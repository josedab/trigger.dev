import { PrismaClientOrTransaction } from "@trigger.dev/database";
import { assertNever } from "assert-never";
import pMap from "p-map";
import { AuthenticatedEnvironment } from "../../shared/index.js";
import { getLatestExecutionSnapshot } from "./executionSnapshotSystem.js";
import { SystemResources } from "./systems.js";

export type RepairSystemOptions = {
  resources: SystemResources;
  repairSnapshotTimeoutMs: number;
};

export class RepairSystem {
  private readonly $: SystemResources;
  private readonly repairSnapshotTimeoutMs: number;

  constructor(private readonly options: RepairSystemOptions) {
    this.$ = options.resources;
    this.repairSnapshotTimeoutMs = options.repairSnapshotTimeoutMs;
  }

  async repairEnvironment(environment: AuthenticatedEnvironment, dryRun: boolean) {
    const runIds = await this.$.runQueue.getCurrentConcurrencyOfEnvironment(environment);

    return this.repairRuns(runIds, dryRun);
  }

  async repairQueue(
    environment: AuthenticatedEnvironment,
    queue: string,
    dryRun: boolean,
    ignoreRunIds: string[]
  ) {
    const runIds = await this.$.runQueue.getCurrentConcurrencyOfQueue(environment, queue);

    const runIdsToRepair = runIds.filter((runId) => !ignoreRunIds.includes(runId));

    return this.repairRuns(runIdsToRepair, dryRun);
  }

  async repairRuns(runIds: string[], dryRun: boolean) {
    if (runIds.length === 0) {
      return {
        runIds,
        repairs: [],
        dryRun,
      };
    }

    const repairs = await pMap(
      runIds,
      async (runId) => {
        return this.repairRun(runId, dryRun);
      },
      { concurrency: 5 }
    );

    return {
      runIds,
      repairs,
      dryRun,
    };
  }

  async repairRun(runId: string, dryRun: boolean) {
    const snapshot = await getLatestExecutionSnapshot(this.$.prisma, runId);

    if (
      snapshot.executionStatus === "QUEUED" ||
      snapshot.executionStatus === "SUSPENDED" ||
      snapshot.executionStatus === "FINISHED"
    ) {
      if (!dryRun) {
        // Schedule the repair job
        await this.$.worker.enqueueOnce({
          id: `repair-in-progress-run:${runId}`,
          job: "repairSnapshot",
          payload: { runId, snapshotId: snapshot.id, executionStatus: snapshot.executionStatus },
          availableAt: new Date(Date.now() + this.repairSnapshotTimeoutMs),
        });
      }

      return {
        action: "repairSnapshot",
        runId,
        snapshotStatus: snapshot.executionStatus,
        snapshotId: snapshot.id,
      };
    }

    return {
      action: "ignore",
      runId,
      snapshotStatus: snapshot.executionStatus,
      snapshotId: snapshot.id,
    };
  }

  async handleRepairSnapshot({
    runId,
    snapshotId,
    executionStatus,
    tx,
  }: {
    runId: string;
    snapshotId: string;
    executionStatus: string;
    tx?: PrismaClientOrTransaction;
  }) {
    const prisma = tx ?? this.$.prisma;

    return await this.$.runLock.lock("handleRepairSnapshot", [runId], async () => {
      const latestSnapshot = await getLatestExecutionSnapshot(prisma, runId);

      if (latestSnapshot.id !== snapshotId) {
        this.$.logger.log(
          "RepairSystem.handleRepairSnapshot no longer the latest snapshot, stopping the repair.",
          {
            runId,
            snapshotId,
            latestSnapshotExecutionStatus: latestSnapshot.executionStatus,
            repairExecutionStatus: executionStatus,
          }
        );

        return;
      }

      // Okay, so this means we haven't transitioned to a new status yes, so we need to do something
      switch (latestSnapshot.executionStatus) {
        case "EXECUTING":
        case "EXECUTING_WITH_WAITPOINTS":
        case "PENDING_CANCEL":
        case "PENDING_EXECUTING":
        case "QUEUED_EXECUTING":
        case "RUN_CREATED": {
          // Do nothing;
          return;
        }
        case "QUEUED": {
          this.$.logger.log("RepairSystem.handleRepairSnapshot QUEUED", {
            runId,
            snapshotId,
          });

          //it will automatically be requeued X times depending on the queue retry settings
          const gotRequeued = await this.$.runQueue.nackMessage({
            orgId: latestSnapshot.organizationId,
            messageId: runId,
          });

          if (!gotRequeued) {
            this.$.logger.error("RepairSystem.handleRepairSnapshot QUEUED repair failed", {
              runId,
              snapshot: latestSnapshot,
            });
          } else {
            this.$.logger.log("RepairSystem.handleRepairSnapshot QUEUED repair successful", {
              runId,
              snapshot: latestSnapshot,
            });
          }

          break;
        }
        case "FINISHED":
        case "SUSPENDED": {
          this.$.logger.log("RepairSystem.handleRepairSnapshot SUSPENDED/FINISHED", {
            runId,
            snapshotId,
          });

          const taskRun = await prisma.taskRun.findFirst({
            where: { id: runId },
            select: {
              queue: true,
            },
          });

          if (!taskRun) {
            this.$.logger.error(
              "RepairSystem.handleRepairSnapshot SUSPENDED/FINISHED task run not found",
              {
                runId,
                snapshotId,
              }
            );
            return;
          }

          // We need to clear this run from the current concurrency sets
          await this.$.runQueue.clearMessageFromConcurrencySets({
            runId,
            orgId: latestSnapshot.organizationId,
            queue: taskRun.queue,
            env: {
              id: latestSnapshot.environmentId,
              type: latestSnapshot.environmentType,
              project: {
                id: latestSnapshot.projectId,
              },
              organization: {
                id: latestSnapshot.organizationId,
              },
            },
          });

          break;
        }
        default: {
          assertNever(latestSnapshot.executionStatus);
        }
      }
    });
  }
}

import { formatDurationMilliseconds, TaskRunInternalError } from "@trigger.dev/core/v3";
import { PrismaClientOrTransaction } from "@trigger.dev/database";
import { assertNever } from "assert-never";
import { NotImplementedError } from "../errors.js";
import { HeartbeatTimeouts, RunEngineOptions } from "../types.js";
import { ExecutionSnapshotSystem, getLatestExecutionSnapshot } from "./executionSnapshotSystem.js";
import { RunAttemptSystem } from "./runAttemptSystem.js";
import { SystemResources } from "./systems.js";
import { WaitpointSystem } from "./waitpointSystem.js";

export type StalledSnapshotHandlerSystemOptions = {
  resources: SystemResources;
  executionSnapshotSystem: ExecutionSnapshotSystem;
  runAttemptSystem: RunAttemptSystem;
  waitpointSystem: WaitpointSystem;
  heartbeatTimeouts: HeartbeatTimeouts;
  treatProductionExecutionStallsAsOOM?: boolean;
  suspendedHeartbeatRetriesConfig?: RunEngineOptions["suspendedHeartbeatRetriesConfig"];
  cancelRun: (params: {
    runId: string;
    workerId?: string;
    runnerId?: string;
    completedAt?: Date;
    reason?: string;
    finalizeRun?: boolean;
    bulkActionId?: string;
    tx?: PrismaClientOrTransaction;
  }) => Promise<any>;
};

export class StalledSnapshotHandlerSystem {
  private readonly $: SystemResources;
  private readonly executionSnapshotSystem: ExecutionSnapshotSystem;
  private readonly runAttemptSystem: RunAttemptSystem;
  private readonly waitpointSystem: WaitpointSystem;
  private readonly heartbeatTimeouts: HeartbeatTimeouts;
  private readonly treatProductionExecutionStallsAsOOM: boolean;
  private readonly suspendedHeartbeatRetriesConfig?: RunEngineOptions["suspendedHeartbeatRetriesConfig"];
  private readonly cancelRun: StalledSnapshotHandlerSystemOptions["cancelRun"];

  constructor(private readonly options: StalledSnapshotHandlerSystemOptions) {
    this.$ = options.resources;
    this.executionSnapshotSystem = options.executionSnapshotSystem;
    this.runAttemptSystem = options.runAttemptSystem;
    this.waitpointSystem = options.waitpointSystem;
    this.heartbeatTimeouts = options.heartbeatTimeouts;
    this.treatProductionExecutionStallsAsOOM = options.treatProductionExecutionStallsAsOOM ?? false;
    this.suspendedHeartbeatRetriesConfig = options.suspendedHeartbeatRetriesConfig;
    this.cancelRun = options.cancelRun;
  }

  async handleStalledSnapshot({
    runId,
    snapshotId,
    restartAttempt,
    tx,
  }: {
    runId: string;
    snapshotId: string;
    restartAttempt?: number;
    tx?: PrismaClientOrTransaction;
  }) {
    const prisma = tx ?? this.$.prisma;
    return await this.$.runLock.lock("handleStalledSnapshot", [runId], async () => {
      const latestSnapshot = await getLatestExecutionSnapshot(prisma, runId);
      if (latestSnapshot.id !== snapshotId) {
        this.$.logger.log(
          "StalledSnapshotHandlerSystem.handleStalledSnapshot() no longer the latest snapshot, stopping the heartbeat.",
          {
            runId,
            snapshotId,
            latestSnapshot: latestSnapshot,
          }
        );

        return;
      }

      this.$.logger.log(
        "StalledSnapshotHandlerSystem.handleStalledSnapshot() handling stalled snapshot",
        {
          runId,
          snapshot: latestSnapshot,
        }
      );

      switch (latestSnapshot.executionStatus) {
        case "RUN_CREATED": {
          throw new NotImplementedError("There shouldn't be a heartbeat for RUN_CREATED");
        }
        case "QUEUED": {
          throw new NotImplementedError("There shouldn't be a heartbeat for QUEUED");
        }
        case "QUEUED_EXECUTING": {
          throw new NotImplementedError("There shouldn't be a heartbeat for QUEUED_EXECUTING");
        }
        case "PENDING_EXECUTING": {
          this.$.logger.log("StalledSnapshotHandlerSystem stalled snapshot PENDING_EXECUTING", {
            runId,
            snapshotId: latestSnapshot.id,
          });

          //the run didn't start executing, we need to requeue it
          const run = await prisma.taskRun.findFirst({
            where: { id: runId },
            include: {
              runtimeEnvironment: {
                include: {
                  organization: true,
                },
              },
            },
          });

          if (!run) {
            this.$.logger.error(
              "StalledSnapshotHandlerSystem.handleStalledSnapshot() PENDING_EXECUTING run not found",
              {
                runId,
                snapshot: latestSnapshot,
              }
            );

            throw new Error(`Run ${runId} not found`);
          }

          //it will automatically be requeued X times depending on the queue retry settings
          await this.runAttemptSystem.tryNackAndRequeue({
            run,
            environment: {
              id: latestSnapshot.environmentId,
              type: latestSnapshot.environmentType,
            },
            orgId: latestSnapshot.organizationId,
            projectId: latestSnapshot.projectId,
            checkpointId: latestSnapshot.checkpointId ?? undefined,
            completedWaitpoints: latestSnapshot.completedWaitpoints,
            batchId: latestSnapshot.batchId ?? undefined,
            error: {
              type: "INTERNAL_ERROR",
              code: "TASK_RUN_DEQUEUED_MAX_RETRIES",
              message: `Trying to create an attempt failed multiple times, exceeding how many times we retry.`,
            },
            tx: prisma,
          });
          break;
        }
        case "EXECUTING":
        case "EXECUTING_WITH_WAITPOINTS": {
          // Stalls for production runs should start being treated as an OOM error.
          // We should calculate the retry delay using the retry settings on the run/task instead of hardcoding it.
          // Stalls for dev runs should keep being treated as a timeout error because the vast majority of the time these snapshots stall because
          // they have quit the CLI

          const retryDelay = 250;

          const timeoutDuration =
            latestSnapshot.executionStatus === "EXECUTING"
              ? formatDurationMilliseconds(this.heartbeatTimeouts.EXECUTING)
              : formatDurationMilliseconds(this.heartbeatTimeouts.EXECUTING_WITH_WAITPOINTS);

          // Dev runs don't retry, because the vast majority of the time these snapshots stall because
          // they have quit the CLI
          const shouldRetry = latestSnapshot.environmentType !== "DEVELOPMENT";
          const errorMessage =
            latestSnapshot.environmentType === "DEVELOPMENT"
              ? `Run timed out after ${timeoutDuration} due to missing heartbeats (sent every 30s). Check if your \`trigger.dev dev\` CLI is still running, or if CPU-heavy work is blocking the main thread.`
              : `Run timed out after ${timeoutDuration} due to missing heartbeats (sent every 30s). This typically happens when CPU-heavy work blocks the main thread.`;

          const taskStalledErrorCode =
            latestSnapshot.executionStatus === "EXECUTING"
              ? "TASK_RUN_STALLED_EXECUTING"
              : "TASK_RUN_STALLED_EXECUTING_WITH_WAITPOINTS";

          const error =
            latestSnapshot.environmentType === "DEVELOPMENT"
              ? ({
                  type: "INTERNAL_ERROR",
                  code: taskStalledErrorCode,
                  message: errorMessage,
                } satisfies TaskRunInternalError)
              : this.treatProductionExecutionStallsAsOOM
              ? ({
                  type: "INTERNAL_ERROR",
                  code: "TASK_PROCESS_OOM_KILLED",
                  message: "Run was terminated due to running out of memory",
                } satisfies TaskRunInternalError)
              : ({
                  type: "INTERNAL_ERROR",
                  code: taskStalledErrorCode,
                  message: errorMessage,
                } satisfies TaskRunInternalError);

          await this.runAttemptSystem.attemptFailed({
            runId,
            snapshotId: latestSnapshot.id,
            completion: {
              ok: false,
              id: runId,
              error,
              retry: shouldRetry
                ? {
                    //250ms in the future
                    timestamp: Date.now() + retryDelay,
                    delay: retryDelay,
                  }
                : undefined,
            },
            forceRequeue: true,
            tx: prisma,
          });
          break;
        }
        case "SUSPENDED": {
          const result = await this.waitpointSystem.continueRunIfUnblocked({ runId });

          this.$.logger.info("handleStalledSnapshot SUSPENDED continueRunIfUnblocked", {
            runId,
            result,
            snapshotId: latestSnapshot.id,
          });

          switch (result.status) {
            case "blocked": {
              if (!this.suspendedHeartbeatRetriesConfig) {
                break;
              }

              if (result.waitpoints.length === 0) {
                this.$.logger.info("handleStalledSnapshot SUSPENDED blocked but no waitpoints", {
                  runId,
                  result,
                  snapshotId: latestSnapshot.id,
                });
                // If the run is blocked but there are no waitpoints, we don't restart the heartbeat
                break;
              }

              const hasRunOrBatchWaitpoints = result.waitpoints.some(
                (w) => w.type === "RUN" || w.type === "BATCH"
              );

              if (!hasRunOrBatchWaitpoints) {
                this.$.logger.info(
                  "handleStalledSnapshot SUSPENDED blocked but no run or batch waitpoints",
                  {
                    runId,
                    result,
                    snapshotId: latestSnapshot.id,
                  }
                );
                // If the run is blocked by waitpoints that are not RUN or BATCH, we don't restart the heartbeat
                break;
              }

              const initialDelayMs =
                this.suspendedHeartbeatRetriesConfig.initialDelayMs ?? 60_000;
              const $restartAttempt = (restartAttempt ?? 0) + 1; // Start at 1
              const maxDelayMs =
                this.suspendedHeartbeatRetriesConfig.maxDelayMs ?? 60_000 * 60 * 6; // 6 hours
              const factor = this.suspendedHeartbeatRetriesConfig.factor ?? 2;
              const maxCount = this.suspendedHeartbeatRetriesConfig.maxCount ?? 12;

              if ($restartAttempt >= maxCount) {
                this.$.logger.info(
                  "handleStalledSnapshot SUSPENDED blocked with waitpoints, max retries reached",
                  {
                    runId,
                    result,
                    snapshotId: latestSnapshot.id,
                    restartAttempt: $restartAttempt,
                    maxCount,
                    config: this.suspendedHeartbeatRetriesConfig,
                  }
                );

                break;
              }

              // Calculate the delay based on the retry attempt
              const delayMs = Math.min(
                initialDelayMs * Math.pow(factor, $restartAttempt - 1),
                maxDelayMs
              );

              this.$.logger.info(
                "handleStalledSnapshot SUSPENDED blocked with waitpoints, restarting heartbeat",
                {
                  runId,
                  result,
                  snapshotId: latestSnapshot.id,
                  delayMs,
                  restartAttempt: $restartAttempt,
                }
              );

              // Reschedule the heartbeat
              await this.executionSnapshotSystem.restartHeartbeatForRun({
                runId,
                delayMs,
                restartAttempt: $restartAttempt,
                tx,
              });
              break;
            }
            case "unblocked":
            case "skipped": {
              break;
            }
          }

          break;
        }
        case "PENDING_CANCEL": {
          //if the run is waiting to cancel but the worker hasn't confirmed that,
          //we force the run to be cancelled
          await this.cancelRun({
            runId: latestSnapshot.runId,
            finalizeRun: true,
            tx,
          });
          break;
        }
        case "FINISHED": {
          throw new NotImplementedError("There shouldn't be a heartbeat for FINISHED");
        }
        default: {
          assertNever(latestSnapshot.executionStatus);
        }
      }
    });
  }
}

import pMap from "p-map";
import { AuthenticatedEnvironment } from "../../shared/index.js";
import { ReportableQueue } from "../types.js";
import { SystemResources } from "./systems.js";

export type ReportingSystemOptions = {
  resources: SystemResources;
};

type EnvInputs = {
  envCurrent: number;
  envLimit: number;
  envLimitWithBurst: number;
  burstFactor?: number;
};

type QueueInputs = {
  paused?: boolean;
  envLimit: number;
  envLimitWithBurst: number;
  queueLimit?: number; // undefined => no explicit queue limit (Lua uses a huge default)
  queueCurrent: number;
  envCurrent: number;
  dueCount?: number; // optional (if you implement countDueMessages)
};

export class ReportingSystem {
  private readonly $: SystemResources;

  constructor(private readonly options: ReportingSystemOptions) {
    this.$ = options.resources;
  }

  async generateEnvironmentReport(
    environment: AuthenticatedEnvironment,
    queues: ReportableQueue[],
    verbose: boolean
  ) {
    const [
      concurrencyLimit, // env limit (no burst)
      concurrencyLimitWithBurstFactor, // env limit * burst
      currentDequeued,
      currentConcurrency,
      burstFactor,
    ] = await Promise.all([
      this.$.runQueue.getEnvConcurrencyLimit(environment),
      this.$.runQueue.getEnvConcurrencyLimitWithBurstFactor(environment),
      this.$.runQueue.currentConcurrencyOfEnvironment(environment), // "currentDequeued" in your label terminology
      this.$.runQueue.operationalCurrentConcurrencyOfEnvironment(environment),
      this.$.runQueue.getEnvConcurrencyBurstFactor(environment),
    ]);

    const envMetrics = {
      envCurrent: currentConcurrency,
      envLimit: concurrencyLimit,
      envLimitWithBurst: concurrencyLimitWithBurstFactor,
      burstFactor,
    };

    const envAnalysis = this.analyzeEnvironment(envMetrics);

    const queueReports = await pMap(
      queues,
      async (queue) => {
        return this.generateReportForQueue(environment, queue, envMetrics, verbose);
      },
      { concurrency: 5 }
    );

    return {
      concurrencyLimit: {
        value: concurrencyLimit,
        key: verbose ? this.$.runQueue.keys.envConcurrencyLimitKey(environment) : undefined,
      },
      concurrencyLimitWithBurstFactor: {
        value: concurrencyLimitWithBurstFactor,
        key: verbose
          ? this.$.runQueue.keys.envConcurrencyLimitBurstFactorKey(environment)
          : undefined,
      },
      currentDequeued: {
        value: currentDequeued,
        key: verbose ? this.$.runQueue.keys.envCurrentDequeuedKey(environment) : undefined,
        label: "Env current dequeued, this is what is displayed to the user",
      },
      currentConcurrency: {
        value: currentConcurrency,
        key: verbose ? this.$.runQueue.keys.envCurrentConcurrencyKey(environment) : undefined,
        label:
          "Env current concurrency, this is what is used to determine if the environment can be dequeued from",
      },
      analysis: envAnalysis,
      queues: queueReports,
    };
  }

  private async generateReportForQueue(
    environment: AuthenticatedEnvironment,
    queue: ReportableQueue,
    envMetrics: EnvInputs,
    verbose: boolean
  ) {
    const currentConcurrency = await this.$.runQueue.currentConcurrencyOfQueue(
      environment,
      queue.name
    );
    const currentDequeued = await this.$.runQueue.currentDequeuedOfQueue(environment, queue.name);
    const concurrencyLimit = await this.$.runQueue.getQueueConcurrencyLimit(
      environment,
      queue.name
    );
    const messagesDueCount = await this.$.runQueue.lengthOfQueueAvailableMessages(
      environment,
      queue.name
    );

    const queueAnalysis = this.analyzeQueue({
      paused: queue.paused === true,
      envLimit: envMetrics.envLimit,
      envLimitWithBurst: envMetrics.envLimitWithBurst,
      queueLimit: typeof concurrencyLimit === "number" ? concurrencyLimit : undefined,
      queueCurrent: currentConcurrency,
      envCurrent: envMetrics.envCurrent,
      dueCount: messagesDueCount,
    });

    return {
      name: queue.name,
      friendlyId: queue.friendlyId,
      type: queue.type,
      paused: queue.paused,
      dbConcurrencyLimit: queue.concurrencyLimit,
      key: this.$.runQueue.keys.queueKey(environment, queue.name),
      analysis: queueAnalysis,
      concurrencyLimit: {
        value: typeof concurrencyLimit === "number" ? concurrencyLimit : null,
        key: verbose
          ? this.$.runQueue.keys.queueConcurrencyLimitKey(environment, queue.name)
          : undefined,
      },
      currentConcurrency: {
        value: currentConcurrency,
        key: verbose
          ? this.$.runQueue.keys.queueCurrentConcurrencyKey(environment, queue.name)
          : undefined,
      },
      currentDequeued: {
        value: currentDequeued,
        key: verbose
          ? this.$.runQueue.keys.queueCurrentDequeuedKey(environment, queue.name)
          : undefined,
      },
    };
  }

  private analyzeEnvironment(inputs: EnvInputs) {
    const { envCurrent, envLimit, envLimitWithBurst, burstFactor } = inputs;

    const reasons: string[] = [];
    const envAvailableCapacity = Math.max(0, envLimitWithBurst - envCurrent);
    const canDequeue = envAvailableCapacity > 0;

    if (!canDequeue) {
      reasons.push(
        `Environment concurrency (${envCurrent}) has reached the limit with burst (${envLimitWithBurst}).`
      );
    }

    return {
      canDequeue,
      reasons,
      metrics: {
        envAvailableCapacity,
      },
    };
  }

  private analyzeQueue(inputs: QueueInputs) {
    const { paused, envLimit, envLimitWithBurst, queueLimit, queueCurrent, envCurrent, dueCount } =
      inputs;

    const reasons: string[] = [];

    // Effective queue limit mirrors the Lua: min(queueLimit || 1_000_000, envLimit)
    const queueLimitCapped = typeof queueLimit === "number" ? queueLimit : 1_000_000;
    const effectiveQueueLimit = Math.min(queueLimitCapped, envLimit);

    const envAvailable = Math.max(0, envLimitWithBurst - envCurrent);
    const queueAvailable = Math.max(0, effectiveQueueLimit - queueCurrent);

    // Mirror Lua's actualMaxCount = min(maxCount, envAvailable, queueAvailable).
    // Here we only need to know if capacity exists at all (maxCount >= 1 assumed).
    const hasCapacity = envAvailable > 0 && queueAvailable > 0;

    // High-signal reasons (ordered)
    if (paused) {
      reasons.push("Queue is paused.");
    }

    if (envAvailable <= 0) {
      reasons.push(
        `Environment concurrency (${envCurrent}) has reached the limit with burst (${envLimitWithBurst}).`
      );
    }

    if (queueAvailable <= 0) {
      reasons.push(
        `Queue concurrency (${queueCurrent}) has reached the effective queue limit (${effectiveQueueLimit}).`
      );
    }

    // Optional visibility: no due messages (score > now or empty queue)
    if (typeof dueCount === "number" && dueCount <= 0) {
      reasons.push("No due messages in the queue (nothing scored ≤ now).");
    }

    // Final decision:
    // - Not paused
    // - Has capacity (both env and queue)
    // - And (optionally) has work due
    const canDequeue =
      !paused && hasCapacity && (typeof dueCount === "number" ? dueCount > 0 : true);

    return {
      canDequeue,
      reasons: canDequeue ? [] : reasons,
      metrics: {
        effectiveQueueLimit,
        queueAvailableCapacity: queueAvailable,
        messagesDueCount: typeof dueCount === "number" ? dueCount : null,
      },
    };
  }
}

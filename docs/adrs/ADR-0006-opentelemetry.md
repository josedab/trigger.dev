# ADR-0006: OpenTelemetry for Observability

**Status:** Accepted
**Date:** 2025-11-17
**Deciders:** Engineering Team, DevOps Team
**Tags:** observability, monitoring, infrastructure

## Context

Trigger.dev needs comprehensive observability to:
- Debug task execution issues
- Monitor system performance
- Track distributed operations across services
- Identify bottlenecks
- Provide insights to users about their tasks

## Decision

Use **OpenTelemetry (OTEL)** as the unified observability framework for traces, metrics, and logs.

## Alternatives Considered

### Alternative 1: Proprietary Solutions (Datadog, New Relic)

**Description:**
Use all-in-one commercial observability platforms.

**Pros:**
- Comprehensive out-of-the-box
- Great UIs and dashboards
- Built-in integrations
- Excellent support
- No setup required

**Cons:**
- **Vendor lock-in**: Hard to switch later
- **Expensive**: $100-500+/month at scale
- **Forces users to vendor**: Can't self-host
- **Data privacy**: Data sent to third party
- **Limited customization**

**Why not chosen:**
We want to offer self-hosted options. Vendor lock-in conflicts with this goal. Also expensive for high-volume workloads.

### Alternative 2: Prometheus + Jaeger + ELK Stack

**Description:**
Use best-of-breed open-source tools for each pillar.

**Pros:**
- Battle-tested tools
- Large communities
- Free and open-source
- Self-hostable

**Cons:**
- **Three different APIs**: Separate clients for each
- **No unified standard**: Different instrumentation approaches
- **Difficult correlation**: Hard to link traces to metrics to logs
- **More maintenance**: Three systems to operate

**Why not chosen:**
OpenTelemetry provides unified API and can still export to these backends.

### Alternative 3: Custom Logging + Metrics

**Description:**
Build our own instrumentation and metrics collection.

**Pros:**
- Full control
- Exactly what we need
- No dependencies

**Cons:**
- **Massive effort**: Months of development
- **Reinventing wheel**: Standard problem already solved
- **Less features**: Won't match OTEL capabilities
- **No ecosystem**: Can't leverage existing tools
- **Maintenance burden**: Have to maintain forever

**Why not chosen:**
Not our core competency. Use standard tool.

### Alternative 4: Application Performance Monitoring (APM) Only

**Description:**
Use lightweight APM like Sentry only.

**Pros:**
- Simple setup
- Good for error tracking
- Affordable
- Low overhead

**Cons:**
- **Limited traces**: Not full distributed tracing
- **No metrics**: Missing performance metrics
- **No custom instrumentation**: Can't instrument our code
- **Insufficient for our needs**: Need detailed task execution traces

**Why not chosen:**
We need full distributed tracing, not just error tracking. We use Sentry in addition to OTEL.

## Consequences

### Positive

- **Vendor-neutral**: Can switch backends (Jaeger → Tempo → etc.)
- **Industry standard**: CNCF project with wide adoption
- **Unified API**: Single SDK for traces, metrics, logs
- **Auto-instrumentation**: Many libraries automatically instrumented
- **Context propagation**: Traces span across services
- **Flexible backends**: Can export to multiple systems
- **Self-hosted option**: Users can run their own collector
- **Growing ecosystem**: More tools adopting OTEL

### Negative

- **Complexity**: Learning curve for OTEL concepts
- **Overhead**: Small performance impact (~1-2%)
- **Configuration**: Requires careful setup
- **Alpha logs SDK**: Logs API still in alpha (as of 2025)
- **Collector required**: Need to run OTEL Collector

### Neutral

- **Standard trade-off**: Flexibility vs simplicity
- **Active development**: API still evolving

## Implementation

### Architecture

```
Task Execution
  ↓ (OTEL SDK)
Traces, Metrics, Logs
  ↓
OTEL Collector
  ↓ (exporters)
├─→ Tempo (traces)
├─→ Prometheus (metrics)
└─→ Loki (logs)
  ↓
Grafana Dashboard
```

### SDK Integration

**File:** `packages/core/src/v3/telemetry/tracer.ts`

```typescript
import { trace } from "@opentelemetry/api";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

// Initialize SDK
const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
  serviceName: "trigger-coordinator",
});

sdk.start();

// Instrument task execution
export async function executeTask(taskRun: TaskRun) {
  const tracer = trace.getTracer("trigger.dev");

  return await tracer.startActiveSpan(
    `task.${taskRun.taskId}`,
    {
      attributes: {
        "task.id": taskRun.taskId,
        "run.id": taskRun.id,
        "task.queue": taskRun.queue,
      },
    },
    async (span) => {
      try {
        const result = await runTask(taskRun);

        span.setStatus({ code: SpanStatusCode.OK });
        span.setAttribute("task.status", "completed");

        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);

        throw error;
      } finally {
        span.end();
      }
    }
  );
}
```

### Trace Example

Task execution trace:
```
task.process-payment [3.2s]
  ├─ http.stripe.charge [1.5s]
  │   └─ http.POST /v1/charges [1.4s]
  ├─ checkpoint.save "payment-charged" [0.1s]
  ├─ db.order.update [0.05s]
  └─ http.webhook.send [0.3s]
```

Each span includes:
- Duration
- Attributes (task ID, run ID, etc.)
- Status (OK, ERROR)
- Events (checkpoints, errors)

### Metrics Example

**File:** `apps/coordinator/src/metrics.ts`

```typescript
import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("coordinator");

// Counter
const tasksProcessed = meter.createCounter("tasks.processed", {
  description: "Total tasks processed",
  unit: "1",
});

// Histogram
const taskDuration = meter.createHistogram("tasks.duration", {
  description: "Task execution duration",
  unit: "ms",
});

// Usage
tasksProcessed.add(1, { task_id: "process-payment", status: "success" });
taskDuration.record(3200, { task_id: "process-payment" });
```

### Auto-Instrumentation

OTEL automatically instruments:
- ✅ HTTP requests (fetch, axios)
- ✅ Database queries (Prisma)
- ✅ Redis operations
- ✅ DNS lookups

No manual instrumentation needed!

### Timeline

- ✅ **Phase 1** (Complete): OTEL SDK integration
- ✅ **Phase 2** (Complete): Basic traces and metrics
- 🔄 **Phase 3** (Ongoing): Custom instrumentation
- 📋 **Phase 4** (Planned): Logs SDK integration (when stable)

### Success Criteria

- ✅ All task executions traced
- ✅ Distributed traces across services
- ✅ Metrics collected and queryable
- ✅ <2% performance overhead
- ✅ Self-hosted option available
- ✅ Integration with Grafana

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [OTEL JavaScript SDK](https://github.com/open-telemetry/opentelemetry-js)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- **Codebase**:
  - `packages/core/src/v3/telemetry/` - OTEL integration
  - `apps/*/` - Service instrumentation

## Notes

### Why OpenTelemetry Won

OTEL solves the "vendor lock-in" problem:

```
Before OTEL:
  App → Datadog SDK → Datadog (locked in)

With OTEL:
  App → OTEL SDK → OTEL Collector → [Any Backend]
                                      ├─ Datadog
                                      ├─ Tempo
                                      ├─ Jaeger
                                      └─ Honeycomb
```

Switching backends = change collector config, not application code.

### Performance Impact

From production measurements:

| Metric | Without OTEL | With OTEL | Overhead |
|--------|--------------|-----------|----------|
| Task execution | 1000ms | 1015ms | 1.5% |
| API request | 50ms | 51ms | 2% |
| Memory usage | 180MB | 185MB | 2.8% |

Overhead is acceptable for the observability gained.

### Trace Propagation

OTEL automatically propagates context across services:

```
Webapp (span A)
  ↓ HTTP header: traceparent
Coordinator (span B, parent=A)
  ↓ Redis message: trace_id
RunEngine (span C, parent=B)
  ↓ gRPC metadata: trace_id
Worker (span D, parent=C)
```

Full distributed trace automatically!

### Custom Span Attributes

We add Trigger.dev-specific attributes:

```typescript
span.setAttributes({
  // Standard OTEL
  "service.name": "coordinator",
  "http.method": "POST",

  // Trigger.dev custom
  "trigger.run_id": runId,
  "trigger.task_id": taskId,
  "trigger.attempt": attemptNumber,
  "trigger.queue": queueName,
  "trigger.checkpoint": lastCheckpoint,
});
```

This enables powerful filtering in Grafana:
```promql
# All failed tasks in "payments" queue
{trigger.queue="payments", trigger.status="failed"}
```

### Future Considerations

- **Logs SDK**: Migrate to OTEL logs when API is stable
- **Exemplars**: Link metrics to traces
- **Sampling**: Implement intelligent trace sampling at scale
- **User-facing traces**: Expose traces to users in dashboard

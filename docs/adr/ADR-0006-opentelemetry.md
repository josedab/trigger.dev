# ADR-0006: OpenTelemetry for Observability

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Distributed Tracing and Observability

## Context

Trigger.dev is a distributed system with multiple services:
- Platform API (receives requests)
- Worker coordinator (schedules tasks)
- Workers (execute tasks)
- Database (PostgreSQL)
- Queue (Redis)

**Observability requirements:**
- Trace requests across services (e.g., API → coordinator → worker)
- Monitor performance (latency, throughput)
- Debug production issues (what happened when?)
- Track resource usage (CPU, memory, database queries)
- Alert on anomalies (errors, slow requests)

**Constraints:**
- Self-hosting support (can't require commercial SaaS)
- Vendor-agnostic (don't lock into one provider)
- Low overhead (minimal performance impact)
- Developer-friendly (easy to add tracing)

## Decision

Use **OpenTelemetry (OTEL)** for distributed tracing, metrics, and logging.

**Architecture:**
```
┌──────────┐  ┌──────────┐  ┌──────────┐
│   API    │→ │Coordinator│→│  Worker  │
└────┬─────┘  └────┬──────┘  └────┬─────┘
     │             │              │
     └─────────────┴──────────────┘
                   │
            ┌──────▼──────┐
            │ OTEL Collector│
            └──────┬────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
  ┌────▼─────┐         ┌──────▼──────┐
  │  Jaeger  │         │ Prometheus  │
  │ (Traces) │         │  (Metrics)  │
  └──────────┘         └─────────────┘
```

**Key aspects:**
- All services instrumented with OTEL SDK
- Auto-instrumentation for Express, Prisma, Redis
- Custom spans for business logic (task execution, checkpoints)
- Traces stored in Jaeger (or any OTLP-compatible backend)
- Metrics exported to Prometheus

## Alternatives Considered

### Alternative 1: Datadog APM

**How it works:**
- Commercial APM (Application Performance Monitoring)
- Agent-based instrumentation
- All-in-one (traces, metrics, logs, dashboards)

**Pros:**
- Excellent UI (best-in-class)
- Auto-instrumentation (minimal code changes)
- Great alerting and anomaly detection
- Built-in dashboards
- Correlate logs, traces, and metrics

**Cons:**
- Expensive (~$31/host/month + $1.70/million spans)
- Vendor lock-in (hard to switch)
- Can't self-host (SaaS only)
- Privacy concerns (data leaves infrastructure)

**Why rejected:**
- Self-hosting requirement (some users want on-premise)
- Cost prohibitive at scale (thousands of workers)
- Vendor lock-in (want to avoid dependence on single vendor)

**Sources:**
- Datadog pricing: https://www.datadoghq.com/pricing/

---

### Alternative 2: Custom Logging

**How it works:**
- Build our own logging and tracing
- Use Winston/Pino for structured logs
- Aggregate in Elasticsearch or Loki

**Pros:**
- Full control over implementation
- No external dependencies
- Can optimize for our use case

**Cons:**
- Reinventing the wheel (distributed tracing is complex)
- No standards (hard to integrate with other tools)
- Lots of work to build and maintain
- No auto-instrumentation (need to instrument everything)
- Trace correlation is hard (span context propagation)

**Why rejected:**
- OpenTelemetry is industry standard (don't reinvent)
- Too much work for small team
- OTEL has auto-instrumentation (saves time)

---

### Alternative 3: Zipkin (Alternative to Jaeger)

**How it works:**
- Open-source distributed tracing (like Jaeger)
- OTEL compatible
- Simpler than Jaeger

**Pros:**
- Lighter than Jaeger (fewer dependencies)
- OTEL compatible
- Good UI

**Cons:**
- Less feature-rich than Jaeger
- Smaller community
- Fewer integrations

**Why rejected:**
- Jaeger has better UI and features
- Both are OTEL compatible (can switch later)
- Jaeger more popular in CNCF ecosystem

**Note:** This is not a strong rejection; Zipkin would also work. Chose Jaeger for slightly better features.

---

## Consequences

### Positive

**1. Vendor-agnostic**
- OTEL is standard (CNCF project)
- Can switch backends (Jaeger → Tempo, Datadog, New Relic)
- Not locked into one vendor

**2. Auto-instrumentation**
- Express.js: Automatic HTTP trace spans
- Prisma: Automatic database query spans
- Redis: Automatic cache operation spans
- Saves time (don't need to instrument manually)

**3. Distributed tracing**
- See full request flow (API → coordinator → worker → DB)
- Identify bottlenecks (which service is slow?)
- Debug errors (where did it fail?)

**Example trace:**
```
[API] POST /tasks (200ms)
  └─ [Coordinator] scheduleTask (50ms)
      └─ [Worker] executeTask (100ms)
          ├─ [Prisma] findTask (10ms)
          ├─ [Redis] dequeue (5ms)
          └─ [User Code] runTask (80ms)
```

**4. Self-hosting friendly**
- Jaeger and Prometheus are open-source
- Can run on any infrastructure
- No data leaves our control

**5. Metrics and tracing in one**
- OTEL supports traces, metrics, and logs
- Single SDK for all observability
- Correlate metrics with traces (e.g., high latency → see trace)

### Negative

**1. Learning curve**
- Team needs to learn OTEL concepts (spans, traces, context)
- Instrumentation requires understanding of OTEL API
- **Mitigation:** Good documentation, examples, training

**2. Operational overhead**
- Need to run Jaeger and Prometheus (or alternatives)
- Need to manage OTEL Collector
- **Mitigation:** Use managed services (Grafana Cloud, etc.) or Docker Compose

**3. Performance overhead**
- Tracing adds latency (~1-5ms per span)
- Memory overhead for span buffering
- **Mitigation:** Sampling (trace 1% of requests in production)

**4. UI not as good as commercial**
- Jaeger UI is functional but not as polished as Datadog
- **Mitigation:** Can use Grafana for better dashboards

### Neutral

**1. OTEL is evolving**
- Still adding features (logs support is new)
- APIs can change (but stable now)
- **Impact:** Part of CNCF, strong commitment to stability

**2. Backend flexibility**
- Can use Jaeger, Tempo, Lightstep, Datadog, etc.
- Too many choices can be confusing
- **Mitigation:** Start with Jaeger, switch if needed

---

## Implementation

Completed in v2.0 release

**Components:**
- [x] OTEL SDK installed (`@opentelemetry/sdk-node`)
- [x] Auto-instrumentation for Express, Prisma, Redis
- [x] Custom spans for task execution, checkpoints
- [x] OTEL Collector deployment (Docker Compose)
- [x] Jaeger deployment (for traces)
- [x] Prometheus deployment (for metrics)
- [x] Grafana dashboards (visualization)

**Instrumentation:**
```typescript
// internal-packages/tracing/src/index.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  serviceName: 'trigger-api',
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

**Custom spans:**
```typescript
// Instrument task execution
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('trigger-worker');

async function executeTask(task: Task) {
  return tracer.startActiveSpan('executeTask', async (span) => {
    span.setAttribute('task.id', task.id);
    span.setAttribute('task.type', task.type);

    const result = await runUserCode(task);

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return result;
  });
}
```

**Performance:**
- Overhead: ~1-5ms per request (with sampling)
- Memory: ~50 MB per service (span buffers)
- Sampling: 100% in dev, 10% in production

---

## References

**Internal:**
- Tracing package: `internal-packages/tracing`
- OTEL config: `internal-packages/tracing/src/config.ts`
- Jaeger deployment: `docker-compose.yml` (Jaeger service)

**External:**
- OpenTelemetry: https://opentelemetry.io/
- OTEL JS SDK: https://opentelemetry.io/docs/instrumentation/js/
- Jaeger: https://www.jaegertracing.io/
- Prometheus: https://prometheus.io/

**Guides:**
- Distributed tracing 101: https://opentelemetry.io/docs/concepts/observability-primer/
- OTEL best practices: https://opentelemetry.io/docs/concepts/sdk-configuration/

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. Grafana Cloud (managed):**
- Use Grafana Cloud instead of self-hosting Jaeger/Prometheus
- Trade-off: cost vs ops overhead
- **Decision:** Offer as option for cloud users

**2. Logs integration:**
- OTEL now supports logs (new feature)
- Correlate logs with traces (same trace ID)
- **Decision:** Implement in v3.0

**3. Sampling strategies:**
- Intelligent sampling (always trace errors, sample successes)
- Tail-based sampling (decide after seeing full trace)
- **Decision:** Explore with OTEL Collector

**4. eBPF instrumentation:**
- Use eBPF for zero-overhead tracing (Linux only)
- No code changes needed
- **Decision:** Experimental, watch ecosystem

# ADR-0004: Container-Based Workers vs Isolates

**Status:** Accepted
**Date:** 2024-06-15
**Deciders:** Engineering Team
**Technical Story:** Task Execution Environment

## Context

Trigger.dev needs to execute user tasks in a secure, isolated environment:
- Run arbitrary user code safely
- Support long-running tasks (hours/days)
- Allow custom dependencies (npm packages, system libraries)
- Scale dynamically based on load
- Support common use cases (Puppeteer, FFmpeg, Python scripts)

**Requirements:**
- Full Node.js runtime (all APIs available)
- Custom system dependencies (Chrome, FFmpeg, etc.)
- Resource isolation (CPU, memory limits)
- Security (sandboxing, network isolation)
- No timeout limits (or very high, 24+ hours)

**Constraints:**
- Self-hosting support required
- Multi-cloud (AWS, GCP, Azure)
- Reasonable cold start times (<10 seconds)

## Decision

Use **Docker containers** (and Kubernetes pods) as the task execution environment.

**Architecture:**
```
┌─────────────────────────────────────┐
│ Kubernetes Cluster                  │
│ ┌─────────────┐  ┌─────────────┐   │
│ │ Worker Pod  │  │ Worker Pod  │   │
│ │  (Task 1)   │  │  (Task 2)   │   │
│ │             │  │             │   │
│ │ - Node.js   │  │ - Node.js   │   │
│ │ - User code │  │ - User code │   │
│ │ - Deps      │  │ - Deps      │   │
│ └─────────────┘  └─────────────┘   │
└─────────────────────────────────────┘
```

**Key aspects:**
- Each task runs in its own container
- Base image: Node.js + common dependencies
- User can customize with Dockerfile
- Resource limits (CPU, memory) configurable
- Kubernetes for orchestration (scaling, health checks)

## Alternatives Considered

### Alternative 1: V8 Isolates (Cloudflare Workers style)

**How it works:**
- Lightweight JavaScript execution contexts
- Shared V8 process, isolated execution
- Sub-millisecond cold starts
- Limited API surface (Web APIs only)

**Pros:**
- Extremely fast cold starts (<100ms)
- Very efficient resource usage (1000s of isolates per machine)
- Low memory overhead (~1-2 MB per isolate)
- Built-in sandboxing (V8 isolate = security boundary)

**Cons:**
- Can't install system dependencies (FFmpeg, Chrome, etc.)
- Limited Node.js API (no `fs`, `child_process`, etc.)
- Can't run native modules (node-gyp packages)
- Hard to run Puppeteer, Playwright, Python scripts
- Not suitable for heavy workloads (CPU/memory constrained)

**Why rejected:**
- Users need full Node.js runtime (real-world use cases)
- Common tasks require system dependencies:
  - Video processing: FFmpeg
  - Web scraping: Puppeteer/Playwright (needs Chrome)
  - Data processing: Python scripts, ImageMagick
- Isolates too restrictive for target use cases

**Sources:**
- Cloudflare Workers: https://workers.cloudflare.com/
- V8 Isolates: https://v8.dev/docs/embed

---

### Alternative 2: AWS Lambda

**How it works:**
- Serverless functions (managed by AWS)
- Container or zip deployment
- Auto-scaling, pay-per-use

**Pros:**
- Fully managed (no ops)
- Auto-scaling built-in
- Pay only for execution time
- Good cold start times (~1-3 seconds)

**Cons:**
- 15-minute timeout (hard limit)
- AWS vendor lock-in
- Can't self-host
- More expensive at high volume
- Limited to AWS (no multi-cloud)

**Why rejected:**
- **15-minute timeout is the problem we're solving**
- Self-hosting requirement (some users want on-premise)
- Vendor lock-in conflicts with multi-cloud strategy
- Cost grows quickly with many long-running tasks

---

### Alternative 3: VM-based workers (Firecracker)

**How it works:**
- MicroVMs (Firecracker, used by AWS Lambda)
- Fast VM startup (~1 second)
- Strong isolation (full VM)

**Pros:**
- Strong security (VM-level isolation)
- Fast startup (~1 second)
- Full OS (can install anything)

**Cons:**
- More complex to manage than containers
- Higher memory overhead (~100 MB per VM)
- Requires KVM (not available on all clouds)
- Team unfamiliar with Firecracker

**Why rejected:**
- Containers provide sufficient isolation for use case
- Kubernetes ecosystem more mature
- Team expertise in Docker/Kubernetes, not Firecracker
- Not all clouds support nested virtualization

**Sources:**
- Firecracker: https://firecracker-microvm.github.io/

---

## Consequences

### Positive

**1. Full Node.js runtime**
- All Node.js APIs available (`fs`, `child_process`, `http`, etc.)
- Can install any npm package (including native modules)
- No restrictions on code

**2. Custom system dependencies**
- Users can install FFmpeg, Chrome, Python, etc.
- Dockerfile support for customization
- Real-world use cases supported:
  - Video processing with FFmpeg
  - Web scraping with Puppeteer
  - PDF generation with wkhtmltopdf
  - Image processing with ImageMagick

**3. No timeout limits**
- Tasks can run for hours or days
- Only limited by checkpoint frequency
- Solves the core problem (serverless timeouts)

**4. Kubernetes ecosystem**
- Mature orchestration platform
- Auto-scaling, rolling updates, health checks
- Multi-cloud (EKS, GKE, AKS)
- Self-hosting friendly

**5. Resource isolation**
- CPU and memory limits per container
- Prevents one task from starving others
- Fair scheduling

### Negative

**1. Slower cold starts**
- Container startup: ~2-5 seconds (vs <100ms for isolates)
- Kubernetes pod scheduling: +1-2 seconds
- Total: ~3-7 seconds (acceptable for long-running tasks)
- **Mitigation:** Keep warm pool of containers

**2. Higher memory overhead**
- Each container: ~50-100 MB base (vs 1-2 MB for isolates)
- Lower density (fewer tasks per machine)
- **Mitigation:** Right-size containers, use resource limits

**3. More complex operations**
- Need Kubernetes expertise (vs serverless)
- Container builds, registries, orchestration
- **Mitigation:** Good documentation, managed Kubernetes

**4. Image build time**
- Custom Dockerfile requires build step
- Can take 1-5 minutes
- **Mitigation:** Cache layers, build on deploy

### Neutral

**1. Container security**
- Containers provide good isolation (not VM-level)
- Need to disable privileged mode, limit capabilities
- **Mitigation:** Security policies, network policies

**2. Cost model**
- Pay for running containers (not per-request like Lambda)
- More cost-effective for long-running tasks
- Need to manage idle containers

---

## Implementation

Completed in v3.0 release

**Components:**
- [x] Base Docker image (`packages/worker-base`)
- [x] Kubernetes manifests (`infra/k8s`)
- [x] Worker coordinator (schedules tasks to pods)
- [x] Resource management (CPU/memory limits)
- [x] Custom Dockerfile support
- [x] Health checks and auto-restart

**Base image includes:**
- Node.js 20 LTS
- Common dependencies (curl, git, etc.)
- Trigger.dev SDK pre-installed
- Optimized for fast startup

**Resource limits (default):**
- CPU: 1 core (adjustable)
- Memory: 2 GB (adjustable)
- Disk: 10 GB (ephemeral)

**Performance:**
- Cold start: ~3-5 seconds (container + pod)
- Warm start: ~100-200ms (reuse container)
- Max concurrent: 1000s per cluster (Kubernetes scales)

---

## References

**Internal:**
- Base image: `packages/worker-base/Dockerfile`
- K8s manifests: `infra/k8s/workers/`
- Worker coordinator: `internal-packages/coordinator`

**External:**
- Docker docs: https://docs.docker.com/
- Kubernetes docs: https://kubernetes.io/docs/
- Container security: https://kubernetes.io/docs/concepts/security/

**Comparison articles:**
- Containers vs VMs: https://www.docker.com/resources/what-container/
- Cloudflare Workers vs Lambda: https://blog.cloudflare.com/cloudflare-workers-vs-lambda/

**Benchmarks:**
- Container startup benchmarks (internal testing)

---

## Superseded By

None (still active as of 2025-11)

---

## Future Considerations

**1. gVisor for stronger isolation:**
- gVisor provides syscall-level sandboxing
- Stronger security than plain containers
- Overhead: ~10-20% performance impact
- **Decision:** Evaluate for enterprise plan

**2. Warm container pool:**
- Keep pool of warm containers ready
- Reduce cold start to <1 second
- Trade-off: idle cost vs latency
- **Decision:** Implement in v3.1

**3. WebAssembly (Wasm):**
- Future alternative to containers
- Near-native performance, strong sandboxing
- Still maturing (WASI for system access)
- **Decision:** Watch ecosystem, revisit in 2025

**4. Spot instances:**
- Use spot instances for worker nodes
- ~70% cost savings
- Need graceful shutdown for evictions
- **Decision:** Implement for cloud offering

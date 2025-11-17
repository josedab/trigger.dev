# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records (ADRs) for the Trigger.dev project.

## What is an ADR?

An ADR is a document that captures an important architectural decision made along with its context and consequences. ADRs help us:

- **Document the "why"** behind architectural choices
- **Onboard new team members** faster
- **Avoid repeating past mistakes**
- **Make better future decisions** by learning from history

## ADR Template

See [TEMPLATE.md](./TEMPLATE.md) for the standard ADR template.

## ADR Process

1. **Propose**: Create a new ADR using the template
2. **Discuss**: Share with the team for feedback
3. **Decide**: Update status to "Accepted" or "Rejected"
4. **Implement**: Reference the ADR in implementation PRs
5. **Supersede**: If needed, create a new ADR that supersedes an old one

## ADR Statuses

- **Proposed**: Under discussion
- **Accepted**: Decision has been made and approved
- **Rejected**: Proposed but not accepted
- **Deprecated**: No longer applicable
- **Superseded by [ADR-XXXX]**: Replaced by a newer decision

## Index of ADRs

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-0001](./ADR-0001-manual-checkpoints.md) | Manual Checkpoints vs Automatic | Accepted | 2025-11-17 |
| [ADR-0002](./ADR-0002-postgresql-redis-architecture.md) | PostgreSQL + Redis vs Event Sourcing | Accepted | 2025-11-17 |
| [ADR-0003](./ADR-0003-remix-over-nextjs.md) | Remix vs Next.js for Webapp | Accepted | 2025-11-17 |
| [ADR-0004](./ADR-0004-container-based-workers.md) | Container-Based Workers vs Isolates | Accepted | 2025-11-17 |
| [ADR-0005](./ADR-0005-monorepo-with-turbo.md) | Monorepo with Turbo | Accepted | 2025-11-17 |
| [ADR-0006](./ADR-0006-opentelemetry.md) | OpenTelemetry for Observability | Accepted | 2025-11-17 |
| [ADR-0007](./ADR-0007-typescript-only.md) | TypeScript-Only Codebase | Accepted | 2025-11-17 |
| [ADR-0008](./ADR-0008-prisma-orm.md) | Prisma vs Drizzle ORM | Accepted | 2025-11-17 |

## Further Reading

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions by Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)

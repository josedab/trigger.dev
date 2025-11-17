# Architectural Decision Records (ADRs)

This directory contains Architectural Decision Records (ADRs) for the Trigger.dev project. ADRs document important architectural decisions, the context in which they were made, alternatives considered, and their consequences.

## What is an ADR?

An Architectural Decision Record (ADR) captures an important architectural decision made along with its context and consequences. ADRs help us:

- Understand why certain decisions were made
- Onboard new team members faster
- Avoid revisiting already-settled debates
- Preserve institutional knowledge

## ADR Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-0001](ADR-0001-manual-checkpoints.md) | Manual Checkpoints for Durable Execution | Accepted | 2024-06-15 |
| [ADR-0002](ADR-0002-postgresql-redis.md) | PostgreSQL + Redis vs Event Sourcing | Accepted | 2024-06-15 |
| [ADR-0003](ADR-0003-remix-framework.md) | Remix vs Next.js for Webapp | Accepted | 2024-06-15 |
| [ADR-0004](ADR-0004-container-workers.md) | Container-Based Workers vs Isolates | Accepted | 2024-06-15 |
| [ADR-0005](ADR-0005-monorepo-turbo.md) | Monorepo with Turbo vs Polyrepo | Accepted | 2024-06-15 |
| [ADR-0006](ADR-0006-opentelemetry.md) | OpenTelemetry for Observability | Accepted | 2024-06-15 |
| [ADR-0007](ADR-0007-typescript-only.md) | TypeScript Only (No JavaScript) | Accepted | 2024-06-15 |
| [ADR-0008](ADR-0008-prisma-orm.md) | Prisma vs Drizzle for ORM | Accepted | 2024-06-15 |

## ADR Statuses

- **Proposed**: The ADR is under discussion
- **Accepted**: The decision has been made and is being implemented/followed
- **Deprecated**: The decision is no longer relevant but kept for historical context
- **Superseded**: Replaced by a newer ADR (link provided)

## Creating a New ADR

1. Copy the [ADR-template.md](ADR-template.md) file
2. Name it `ADR-XXXX-brief-title.md` (use the next available number)
3. Fill in all sections, especially:
   - Context: Why is this decision needed?
   - Decision: What did we decide?
   - Alternatives Considered: What other options were evaluated?
   - Consequences: What are the trade-offs?
4. Submit a PR with the ADR for team review
5. Update this README with the new ADR in the index

## When to Write an ADR

Create an ADR for decisions that are:

- **Hard to reverse**: Changes that would require significant effort to undo
- **Architecturally significant**: Affect multiple components or the overall system structure
- **Have significant trade-offs**: Decisions where alternatives have meaningful pros and cons
- **Need context preservation**: Decisions that will be questioned by future team members

Examples:
- Choice of database technology
- Selection of frameworks or libraries
- System architecture patterns
- Major API design decisions

## ADR Process

1. **Draft**: Create the ADR using the template
2. **Review**: Share with the team for feedback (via PR)
3. **Decide**: Tech lead + senior engineer approve
4. **Document**: Merge the ADR
5. **Reference**: Link to the ADR in relevant code, docs, or discussions

## Resources

- [ADR Template](ADR-template.md) - Use this to create new ADRs
- [ADR GitHub Organization](https://adr.github.io/) - More information about ADRs
- [Michael Nygard's article](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) - Original ADR concept

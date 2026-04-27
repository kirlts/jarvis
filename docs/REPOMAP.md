# REPOMAP: Jarvis

> Generated: 2026-04-27 01:56 (Kairós v1.2.0)  
> Purpose: Routing matrix. Defines when the AI is authorized to read each directory or file.

## Authoring Constraints (Read Before Populating)

- **Scope:** Map the host project only. Kairós governance files (`.agents/`, `README-KAIROS.md`, `kairos-version.txt`) are invisible infrastructure. They MUST NOT appear as Domain Axioms or individual rows. If listed at all, compress them into a single noise cluster row labeled `Kairós Governance`. The documentary axis files in `docs/` are project documentation, not governance. `docs/MASTER-SPEC.md` receives an individual row as a Domain Axiom; the remaining axis files defined in `04-documentation.md` are grouped into a single row.
- **Abstraction level:** Source code files are always mapped at the directory level, never as individual rows. Only documentation and specification files qualify for individual rows as Domain Axioms, per the three-signal detection algorithm in the `/repomap` workflow.
- **Anti-recency bias:** The physical timestamp of a file is not a factor. Do not elevate recently modified files. Prominence is determined by architectural role defined in `MASTER-SPEC`, not by modification date.
- **MECE:** Every row must be Mutually Exclusive (no overlapping access conditions) and Collectively Exhaustive (every directory or logical cluster must be represented).
- **Language:** This document is written in English regardless of the host project's language.

## Routing Matrix

| Directory / File | Nature | When to Consult |
|---|---|---|
| `PRD-Constitucion.md` | Domain Axiom | MANDATORY first read for high-level constitutional constraints and architectural vision. |
| `docs/MASTER-SPEC.md` | Domain Axiom | MANDATORY first read for technical stack, constraints, and system boundaries. |
| `docs/TEST.md` | Domain Axiom | Consult before writing or modifying any test suite to ensure compliance with testing doctrine. |
| `docs/*.md` (Documentary Axis) | Documentary Axis | Consult automatically based on Kairós workflow triggers (TODO, MEMORY, CHANGELOG, USER-DECISIONS). |
| `src/` | Architectural Module | Consult when modifying the Fastify HTTP Core, VSA endpoints, or database pool configuration. |
| `src/workers/` | Architectural Module | Consult when modifying background jobs, pg-boss consumers, or WhatsApp (Baileys) transduction logic. |
| `supabase/migrations/` | Architectural Module | Consult when modifying database schemas, RLS policies, or Atlas migrations. |
| `specs/` | Architectural Module | Consult when modifying or verifying OpenAPI specifications for Contract-Driven Development. |
| `scripts/` | Architectural Module | Consult when running local health checks, stress tests (K6), or contract tests. |
| `infrastructure/` | Architectural Module | Consult when modifying the Ops Console (Appsmith) exports or other infrastructure-as-code. |
| `Idea/` & `Research/` | Ideation & Research | Consult when exploring original project concepts or Deep Research historical reports. |
| `*.*` (Root Configs) | Configuration | Consult when modifying Docker Compose, Atlas CLI routing, package dependencies, or environment variables. |
| `.agents/`, `kairos-version.txt` | Kairós Governance | Invisible infrastructure. Consult only when modifying agent behaviors or templates. |

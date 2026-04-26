# REPOMAP: Jarvis

> Generated: 2026-04-26 (Kairós v0.1.0)  
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
| `docs/MASTER-SPEC.md` | Domain Axiom | Consult FIRST when altering any system behavior, dependency, or architecture to verify constraints. |
| `docs/*.md` (Excl. MASTER-SPEC) | Documentary Axis | Consult when governed by task initiation rules (e.g., reading `TODO.md` or `MEMORY.md`). |
| `Idea/` | Noise Cluster | Consult ONLY when explicitly requested to parse historical transcripts or raw product ideas. |
| `*.*` (Root Project Files) | Noise Cluster | Consult when managing legacy root specifications like `PRD-Constitucion.md`. |
| `Kairós Governance` | Invisible Infrastructure | NEVER consult for project logic. Regulates AI behavior internally. |

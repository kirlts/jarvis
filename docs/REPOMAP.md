# REPOMAP: Jarvis

> Generated: 2026-05-29 02:56:00 (Kairós v3.4.1)  
> Purpose: Routing matrix. Defines when the AI is authorized to read each directory or file.

## Authoring Constraints (Read Before Populating)

- **Scope:** Map the host project only. Kairós release metadata files (`README-KAIROS.md`, `kairos-version.txt`) are distribution artifacts and MUST NOT appear as Domain Axioms or individual rows. If listed at all, compress them into a single noise cluster row. The `.agents/` directory is the **active governance layer** and is handled by a hardcoded mandatory row below — it MUST NOT be classified as a noise cluster or invisible infrastructure. The documentary axis files in `docs/` are project documentation, not governance. `docs/MASTER-SPEC.md` receives an individual row as a Domain Axiom; the remaining axis files defined in `04-documentation.md` are grouped into a single row.
- **Abstraction level:** Source code files are always mapped at the directory level, never as individual rows. Only documentation and specification files qualify for individual rows as Domain Axioms, per the three-signal detection algorithm in the `/repomap` workflow.
- **Anti-recency bias:** The physical timestamp of a file is not a factor. Do not elevate recently modified files. Prominence is determined by architectural role defined in `MASTER-SPEC`, not by modification date.
- **MECE:** Every row must be Mutually Exclusive (no overlapping access conditions) and Collectively Exhaustive (every directory or logical cluster must be represented).
- **Language:** This document is written in English regardless of the host project's language.

## Routing Matrix

| Directory / File | Nature | When to Consult |
|---|---|---|
| `.agents/` | **[Active Governance]** Rules, skills, workflows, and templates that define agent behavior. | **MANDATORY.** Consult `01-behavior.md` at session start; dynamically load other files per `[RULE: DYNAMIC CONTEXT LOAD]` and `[RULE: DYNAMIC SKILL ACTIVATION]` triggers. |
| `docs/MASTER-SPEC.md` | Domain Axiom (Signal 1) | Before modifying core architecture, system constraints, technology choices, or executing any major implementation phase. |
| `docs/` (excluding `MASTER-SPEC.md`) | Secondary Documentation (Signal 1) | To verify task statuses, update changelogs, trace verification checklists, check historical user decisions, or read visual inventory. |
| `specs/` | API Specifications (Domain Axiom - Signal 2) | Before modifying or adding endpoints to Fastify backend or before updating dataProvider in React frontend. |
| `supabase/migrations/` | Database Migrations (Domain Axiom - Signal 3) | Before modifying database structure, schemas, tables, triggers, indexes, or Row-Level Security (RLS) policies. |
| `src/features/admin/` | Administrative Backend (Architectural Module) | Before modifying or adding endpoints related to tenants, jobs, audit logs, WhatsApp sessions, storage, or configurations. |
| `src/features/sync-inbox/` | Core Business Logic (Architectural Module) | Before modifying webhook ingestion, validation schema, or queue processing behavior of inbox items. |
| `src/features/storage/` | Storage Module (Architectural Module) | Before modifying pre-signed S3 URL generation, multipart upload limits, or orphan file detection. |
| `src/workers/baileys/` | WhatsApp Communication Worker (Architectural Module) | Before modifying dynamic connection life cycle, QR code generation, or socket events parsing. |
| `src/workers/` (excluding `baileys/`) | Background Queue Worker (Architectural Module) | Before modifying queue handlers, rollback behaviors, transaction context, or job retry logic. |
| `ops-console/` | Ops Console Frontend (Architectural Module) | Before modifying frontend pages, dashboard metrics, layout components, data providers, or styling. |
| `infrastructure/` | Infrastructure Provisioning (Architectural Module) | Before modifying Loki configs, Grafana provisioning (alerting, dashboards, datasources), or JWT key files. |
| `scripts/` | Utility Scripts (Noise Cluster) | Before running synthetic checks, provisioning Kuma, running contract/stress tests, or checking files integrity. |
| `*.*` (Root Configs) | Root Configuration Cluster (Noise Cluster) | Before upgrading npm packages, modifying service networks, altering proxy routing, or customizing mutation test thresholds. |

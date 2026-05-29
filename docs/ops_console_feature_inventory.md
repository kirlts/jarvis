# Ops Console: Feature Inventory (Dense Edition)

> **Purpose:** Especificación exhaustiva de las 51 features requeridas para la Ops Console.
> Cada feature es trazable a una fuente concreta: transcripciones del fundador, PRD (archivado), MASTER-SPEC o código existente.

---

## Contexto Arquitectónico

### What is Jarvis?
A multi-tenant B2B SaaS backend (Fastify/Node.js + PostgreSQL 17) with a microkernel plugin architecture. Each tenant is an isolated business client. The system handles messaging (WhatsApp via Baileys), async job processing (pg-boss), file storage (MinIO/S3), and observability (Loki+Grafana). See `docs/MASTER-SPEC.md` for full architecture.

### What is the Ops Console?
A React SPA (Refine v5 + Vite) served at `admin.jarvis.local` that consumes a dedicated Admin API (`/admin/*`). It is the **only** interface the system operator uses to manage the entire fleet of tenants and monitor system health. The operator must never need CLI access for routine operations.

### Authentication Model
- **Admin JWT**: RS256 algorithm, namespace `admin`, role `super_admin`. Separate from tenant JWTs (HS256).
- **Database role**: `jarvis_admin` with `BYPASSRLS` (sees all tenants' data). Defined in `supabase/migrations/008_admin_role.sql`.
- **Dev Login**: `POST /admin/dev-login` returns a signed JWT when `NODE_ENV=development`. Production ignores this route.
- **Auth Provider**: `ops-console/src/providers/auth.ts`. Token stored in `sessionStorage`. Auto-logout on expiry (1h) or 401/403.

### Existing Database Schema (tables the console can query)

| Table | Key Columns | RLS | Location |
|---|---|---|---|
| `tenants` | `id` (UUIDv7), `name` (UNIQUE where not deleted), `created_at`, `deleted_at` | Yes | `002_tenants.sql` |
| `sync_inbox` | `id`, `tenant_id` (FK), `payload` (JSONB), `status` (pending/processing/done/failed), `created_at`, `processed_at` | Yes | `003_sync_inbox.sql` |
| `wapp_sessions` | `id`, `tenant_id` (FK), `credentials` (JSONB), `status` (connected/disconnected/qr_pending), `created_at`, `updated_at` | Yes | `004_wapp_state.sql` |
| `wapp_incoming` | `id`, `tenant_id` (FK), `sender`, `message` (JSONB), `created_at` | Yes | `004_wapp_state.sql` |
| `storage_objects` | `id`, `tenant_id` (FK), `file_name`, `size` (BIGINT), `mime_type`, `storage_key` (UNIQUE), `status`, `created_at`, `deleted_at` | Yes | `006_storage_objects.sql` |
| `pgboss.job` | `id`, `name` (queue name), `state`, `data` (JSONB with `tenant_id`), `created_on`, `started_on`, `completed_on` | No (pgboss schema) | pg-boss internal |

**Hard deletes are prohibited on ALL tables** (trigger `prevent_hard_delete()` in `005_rls_and_isolation.sql`). All deletions are soft-deletes via `deleted_at`.

### Existing Admin API Endpoints (file: `src/features/admin/routes.js`)

| Method | Route | What it does | Response |
|---|---|---|---|
| POST | `/admin/dev-login` | Dev-only JWT generation | `{ token }` |
| GET | `/admin/tenants?page=&limit=` | List active tenants (paginated, `deleted_at IS NULL`) | `{ data: [...], meta: { total, page, limit } }` |
| POST | `/admin/tenants` | Create tenant (UUIDv7 server-side) | `201 { id, name, created_at }` |
| GET | `/admin/tenants/:id` | Get tenant by ID (includes deleted) | `{ id, name, created_at, deleted_at }` |
| PATCH | `/admin/tenants/:id` | Update tenant name (only active) | `{ id, name, created_at, deleted_at }` |
| DELETE | `/admin/tenants/:id?confirm=true` | Soft-delete tenant | `{ status: "deleted", id }` |
| GET | `/admin/jobs?state=&tenant_id=&limit=` | List pg-boss jobs (filtered) | `[{ id, name, state, data, created_on, ... }]` |
| GET | `/admin/whatsapp/status` | List all WhatsApp sessions | `[{ tenant_id, status, updated_at }]` |

All endpoints use `withAdminClient()` which runs `SET LOCAL role = 'jarvis_admin'` inside a transaction. Error codes: 400 (bad input), 401 (no/bad JWT), 403 (wrong role), 404 (not found), 409 (duplicate name).

### Existing Frontend Pages (directory: `ops-console/src/pages/`)

| File | What it renders | Gaps |
|---|---|---|
| `login.tsx` | Login form + Dev Login button | Functional |
| `tenants/list.tsx` | Table with ID, Name, Created, Delete button. Pagination. | No search, no filters, no edit, no detail view |
| `tenants/create.tsx` | Form with `name` field | Minimal |
| `jobs/list.tsx` | Table of jobs | No detail view, no retry, no filters in UI |
| `whatsapp/list.tsx` | Table of sessions | Read-only, no actions |

### Contract File
`specs/admin-api.yaml` (OpenAPI 3.0.3) defines the API contract. Specmatic validates backend compliance against this file. **Any new endpoint MUST be added to this spec first** (contract-first development).

### Data Provider
`ops-console/src/providers/data.ts` translates Refine CRUD calls to Admin API requests. Resource-to-path mapping: `tenants` → `/admin/tenants`, `jobs` → `/admin/jobs`, `whatsapp` → `/admin/whatsapp/status`.

---

## Feature Inventory

### A. Dashboard (Landing Page After Login)

**Source:** Founder transcript 04-26: *"I need to be able to quickly take a look at all of them"*, *"detect this problem before the client even does"*.

**Current state:** Does not exist. After login, the user is redirected to `/tenants` (a raw table).

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| A.1 | Tenant count cards (active / suspended / deleted) | New endpoint `GET /admin/dashboard/summary` that runs `SELECT count(*) ... GROUP BY` on `tenants` | Card components with counts | Numbers match database state within 5 seconds of page load |
| A.2 | Job queue health (active / failed / completed in last 24h) | Same summary endpoint. Query: `SELECT state, count(*) FROM pgboss.job WHERE created_on > now() - interval '24h' GROUP BY state` | Bar or pill indicators with color coding (green=healthy, red=failures) | Failed count > 0 shows red indicator |
| A.3 | WhatsApp status overview (connected / disconnected / qr_pending) | Same summary endpoint. Query: `SELECT status, count(*) FROM wapp_sessions GROUP BY status` | Status pills per state | Disconnected count > 0 shows amber warning |
| A.4 | Event loop health | Endpoint already exists: `GET /health/event-loop` (returns min, max, mean, p99, stddev in ms). Currently NOT behind admin auth. | Gauge or metric card showing p99 latency | p99 > 50ms shows red |
| A.5 | Storage usage (total files, total bytes) | New endpoint or extend summary. Query: `SELECT count(*), sum(size) FROM storage_objects WHERE status = 'uploaded'` | Metric card with human-readable size (e.g., "142 files, 3.2 GB") | Numbers match `storage_objects` table |
| A.6 | Sync inbox backlog (pending items count) | New endpoint or extend summary. Query: `SELECT count(*) FROM sync_inbox WHERE status = 'pending'` | Metric card. Yellow if > 100, red if > 1000 | Threshold values configurable |
| A.7 | Recent errors (last 10 system errors) | New endpoint `GET /admin/logs/recent?level=error&limit=10`. Requires Loki HTTP API proxy (Loki runs at `http://loki:3100/loki/api/v1/query_range`) | Compact error list with timestamp, message, service label | Each entry links to full log context |

---

### B. Tenant Lifecycle Management

**Source:** Transcript: *"add, modify, configure, delete"*, *"change parameters"*, *"up to a hundred individual clients"*. MASTER-SPEC §1: *"Each client receives an instance perceived as personalized"*.

**Current state:** CRUD exists but is skeletal. No edit view, no detail view, no status management, no configuration.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| B.1 | Search tenants by name | Modify `GET /admin/tenants` to accept `?search=` param. SQL: `WHERE name ILIKE '%' \|\| $1 \|\| '%'` | Search input above table with debounced query (300ms) | Typing "cli" matches "Clinica Norte". Case insensitive |
| B.2 | Filter tenants by status | Modify `GET /admin/tenants` to accept `?status=active\|deleted\|all`. Change WHERE clause accordingly | Dropdown filter next to search | Selecting "deleted" shows soft-deleted tenants |
| B.3 | Tenant detail page | Endpoint exists (`GET /admin/tenants/:id`). Extend response to include related data: session count, inbox count, storage usage. New endpoint `GET /admin/tenants/:id/stats` | Full page at `/tenants/:id` with profile card + tabs (Overview, WhatsApp, Jobs, Storage, Config) | All tabs load data correctly, URL is bookmarkable |
| B.4 | Edit tenant (inline or form) | Endpoint exists (`PATCH /admin/tenants/:id`). Currently only supports `name`. Will need to support additional fields as schema grows | Edit form or inline editing on detail page | PATCH request fires, table refreshes, 409 handled for duplicate names |
| B.5 | Tenant status field | **Schema change required**: `ALTER TABLE tenants ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial'))`. New endpoint `PATCH /admin/tenants/:id/status` | Status badge on list and detail. Toggle button to suspend/reactivate | Suspending a tenant sets status='suspended'. RLS policies should still allow admin access |
| B.6 | Restore deleted tenant | New endpoint `POST /admin/tenants/:id/restore` that sets `deleted_at = NULL`. Must verify tenant exists and IS deleted | Button on detail page (only visible for deleted tenants) | Tenant reappears in active list after restore |
| B.7 | Tenant configuration (JSONB) | **Schema change required**: `ALTER TABLE tenants ADD COLUMN config JSONB NOT NULL DEFAULT '{}'`. Modify PATCH to accept `config` field | JSON editor or structured form on detail page Config tab | Config persists across page reloads. Invalid JSON rejected with 400 |

---

### C. WhatsApp Channel Management

**Source:** MASTER-SPEC §7.1 (Baileys worker). Schema: `wapp_sessions` (status: connected/disconnected/qr_pending), `wapp_incoming`. Architecture: Baileys worker runs as separate Docker container communicating via pg-boss queues.

**Current state:** Read-only table of sessions. No actions, no message history, no health metrics.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| C.1 | Session detail view | Extend `GET /admin/whatsapp/status` to include `id`, `created_at`. Or new `GET /admin/whatsapp/:tenant_id` | Detail panel showing session ID, status badge, last updated, uptime | Timestamps render correctly |
| C.2 | Reconnect session | New endpoint `POST /admin/whatsapp/:tenant_id/reconnect`. Implementation: enqueue a pg-boss job `wapp-reconnect` that the Baileys worker consumes | Button on session row. Shows spinner while reconnecting | Worker picks up job, updates `wapp_sessions.status`. Console reflects new status |
| C.3 | Disconnect session | New endpoint `POST /admin/whatsapp/:tenant_id/disconnect`. Same pattern: pg-boss job `wapp-disconnect` | Button with confirmation modal | Session status changes to 'disconnected' |
| C.4 | Message history (recent) | New endpoint `GET /admin/whatsapp/:tenant_id/messages?limit=50`. Query: `SELECT * FROM wapp_incoming WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2` (using `jarvis_admin` role, bypasses RLS) | Scrollable message list with sender, timestamp, message preview | Messages display in reverse chronological order |
| C.5 | Message throughput | New endpoint `GET /admin/whatsapp/:tenant_id/stats`. Query: count messages per hour/day from `wapp_incoming` | Simple chart (messages per hour, last 24h) or numeric summary | Numbers match manual SQL count |
| C.6 | Status badges on tenant list | No new endpoint needed (data exists) | Add WhatsApp status column to tenant list, or a colored dot indicator | Green = connected, Yellow = qr_pending, Gray = disconnected, No dot = no session |

---

### D. Job Queue Management (pg-boss)

**Source:** MASTER-SPEC §7.2. pg-boss stores jobs in `pgboss.job` table. Current config: `retryBackoff: true`, `retryLimit: 5`, `teamSize: 5`. Queue names: `sync-inbox-process`, `wapp-send-process`.

**Current state:** Read-only filtered list. No detail, no actions.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| D.1 | Job detail view | New endpoint `GET /admin/jobs/:id`. Query: `SELECT * FROM pgboss.job WHERE id = $1` | Modal or page showing full payload (JSON viewer), all timestamps, retry count, error output | Large JSONB payloads render without crashing |
| D.2 | Retry failed job | New endpoint `POST /admin/jobs/:id/retry`. Use pg-boss API: `boss.retry(queue, id)` or re-insert with same data | Button on failed jobs only. Confirmation required | Job state changes from 'failed' to 'created'. Appears in active queue |
| D.3 | Cancel pending job | New endpoint `POST /admin/jobs/:id/cancel`. Use pg-boss API: `boss.cancel(id)` | Button on pending/created jobs only | Job state changes to 'cancelled' |
| D.4 | Queue overview | New endpoint `GET /admin/jobs/queues`. Query: `SELECT name, state, count(*) FROM pgboss.job GROUP BY name, state` | Table showing each queue name with counts per state | All known queues appear even if empty |
| D.5 | Date range filter | Modify `GET /admin/jobs` to accept `?from=&to=` (ISO timestamps). Add `WHERE created_on BETWEEN $x AND $y` | Date picker inputs in filter bar | Only jobs within range appear |
| D.6 | Queue metrics | New endpoint `GET /admin/jobs/metrics`. Queries: avg processing time (`completed_on - started_on`), failure rate, throughput/hour | Metric cards or small chart | Numbers are mathematically correct against raw data |

---

### E. Sync Inbox Monitor

**Source:** MASTER-SPEC §7.2: *"Fastify inserts raw into sync_inbox and returns 202 Accepted"*. This is the primary data flow of the entire system. Schema: `sync_inbox` with status enum (pending/processing/done/failed).

**Current state:** Not visible in the console at all.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| E.1 | Inbox list with filters | New endpoint `GET /admin/inbox?status=&tenant_id=&limit=&page=` with pagination | Table: ID, tenant, status badge, created_at, processed_at | Pagination works, filters combine correctly |
| E.2 | Inbox item detail | New endpoint `GET /admin/inbox/:id` returning full payload JSONB | Modal with JSON viewer showing raw payload | Large payloads render. Timestamps formatted |
| E.3 | Failed items view | Same endpoint with `?status=failed` filter | Dedicated tab or filter preset for failed items | One-click access to all failures |
| E.4 | Reprocess failed item | New endpoint `POST /admin/inbox/:id/reprocess`. Sets status back to 'pending' so pg-boss picks it up again | Button on failed items | Status changes to 'pending', item re-enters processing pipeline |
| E.5 | Backlog metrics | Can share `/admin/dashboard/summary` endpoint. Query: `SELECT status, count(*) FROM sync_inbox GROUP BY status` | Visible on Dashboard (A.6) and on Inbox page header | Numbers refresh on page load |

---

### F. Storage Management (MinIO / S3)

**Source:** MASTER-SPEC §4.1 Axiom 4: *"Binary files prohibited in PostgreSQL, must be in S3"*. Schema: `storage_objects`. Existing script: `scripts/audit_storage.js` (detects orphaned files).

**Current state:** Not visible in the console.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| F.1 | Storage usage per tenant | New endpoint `GET /admin/storage/usage`. Query: `SELECT tenant_id, count(*) as files, sum(size) as bytes FROM storage_objects WHERE status='uploaded' GROUP BY tenant_id` | Table sorted by usage descending. Sizes in human-readable format | Sum of per-tenant bytes equals total |
| F.2 | Recent uploads list | New endpoint `GET /admin/storage/objects?limit=&tenant_id=`. Query on `storage_objects` | Table: filename, tenant, mime_type, size, created_at | Files listed in reverse chronological order |
| F.3 | Orphan detection | New endpoint `GET /admin/storage/orphans`. Logic from `scripts/audit_storage.js`: list S3 keys not in `storage_objects` table | Table of orphaned files with option to bulk delete | Matches output of existing audit script |
| F.4 | Total storage metrics | Part of dashboard summary endpoint | Card on Dashboard (A.5) | Number matches `SELECT sum(size) FROM storage_objects` |

---

### G. Observability (Logs)

**Source:** MASTER-SPEC §4.11: *"Pino to Loki to Grafana"*. Loki runs at `http://loki:3100` inside Docker network. Logs have labels: `service`, `level`, `tenant_id`.

**Current state:** Logs exist in Loki but are only accessible via Grafana. No console integration.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| G.1 | Recent logs viewer | New endpoint `GET /admin/logs?level=&tenant_id=&limit=&query=`. Backend proxies to Loki LogQL API: `{service="jarvis-core-api"} \|= "query"` | Log viewer with color-coded severity, timestamp, message. Auto-refresh toggle | Logs appear within 10s of being generated |
| G.2 | Log search | Same endpoint with `query` param passed to LogQL | Search input with debounce | Searching "error" returns only error-containing log lines |
| G.3 | Grafana link | No backend needed | External link button labeled "Grafana Dashboards" pointing to `http://grafana.jarvis.local` or configured URL | Link opens in new tab |
| G.4 | Uptime Kuma link | No backend needed. Per UD-006: Uptime Kuma is architecturally independent (separate VPS in production) | External link labeled "Status Page" | Link opens in new tab |
| G.5 | System health metrics | Endpoint exists: `GET /health/event-loop`. New: DB pool stats via `SELECT * FROM pgbouncer.pools` (requires PgBouncer admin access) or simplified query | Metric cards: event loop p99, DB pool active/idle, memory usage | Values update on page load |

---

### H. Audit Trail

**Source:** Transcript: *"audit"*. Mandatory practice: `jarvis_admin` bypasses RLS and has cross-tenant write access. Every destructive action must be logged.

**Current state:** Does not exist. No table, no endpoint, no logging.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| H.1 | Audit log table | **Schema change required**: `CREATE TABLE admin_audit_log (id UUID PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id UUID, details JSONB, created_at TIMESTAMPTZ DEFAULT now())`. Middleware in admin routes that logs every mutating request (POST/PATCH/DELETE) | N/A (backend only) | Every admin mutation creates an audit entry |
| H.2 | Audit log viewer | New endpoint `GET /admin/audit?action=&resource=&from=&to=&limit=` | Table: timestamp, actor, action, resource, resource_id, details preview | Filters combine. Pagination works |
| H.3 | Audit log export | Extend audit endpoint with `Accept: text/csv` header support, or new endpoint `GET /admin/audit/export?format=csv` | Download button (CSV or JSON) | Downloaded file contains all filtered records |

---

### I. Data Export

**Source:** User requirement: *"exportar"*.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| I.1 | Export tenant list | Extend `GET /admin/tenants` with `Accept: text/csv` support, or separate `GET /admin/tenants/export` | Download button on tenant list page | CSV has headers: id, name, status, created_at, deleted_at |
| I.2 | Export job history | Same pattern for `GET /admin/jobs/export` | Download button on jobs page | CSV includes all job fields |
| I.3 | Export messages | New `GET /admin/whatsapp/:tenant_id/messages/export` | Download button on message history | CSV with sender, message, timestamp |

---

### J. Multimedia Pipeline Monitor

**Source:** MASTER-SPEC §7.5. Flow: Baileys intercepts audio/image → uploads to MinIO `jarvis-private` bucket → pg-boss queue `sync-inbox-process` with `type: audio|image` → worker executes stub (mock transcription/OCR) → response enqueued to `wapp-send-process`.

**Current state:** Pipeline works end-to-end but is invisible. Stub returns hardcoded strings: `[MOCK_AUDIO_TRANSCRIPTION: Audio recibido]`, `[MOCK_IMAGE_OCR: Imagen analizada]`.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| J.1 | Media processing queue | Can reuse jobs endpoint with filter `?name=sync-inbox-process`. Enhance to show `data.type` field | Filtered view of multimedia jobs showing type (audio/image), status, tenant | Filter by media type works |
| J.2 | Processing stats | Part of jobs metrics endpoint. Filter by queue name `sync-inbox-process` | Card showing: total processed, success rate, avg processing time | Numbers match filtered job data |

---

### K. API Key Management

**Source:** Transcript: *"API keys handling everything centralized"*. MASTER-SPEC §6: JWT realms separated. Current tenant JWT uses HS256 with a single shared secret.

**Current state:** No key management. Tenant JWTs are generated manually or by external systems.

| # | Feature | Backend needs | Frontend needs | Acceptance criteria |
|---|---|---|---|---|
| K.1 | Generate tenant JWT from console | New endpoint `POST /admin/tenants/:id/token` that signs a tenant JWT (HS256) with the tenant's `id` as `tenant_id` claim | Button on tenant detail page. Shows generated token (copyable, one-time display) | Token is valid against `/api/v1/sync/inbox` with correct tenant isolation |
| K.2 | Token revocation list | **Schema change required**: `CREATE TABLE revoked_tokens (jti UUID PRIMARY KEY, tenant_id UUID REFERENCES tenants(id), revoked_at TIMESTAMPTZ DEFAULT now())`. Modify JWT verification middleware to check revocation | Revoke button per issued token. Confirmation modal | Revoked token returns 401 on next API call |
| K.3 | Token expiration policy | Add `token_ttl_hours` field to tenant `config` JSONB (depends on B.7) | Config field on tenant detail page | Generated tokens use per-tenant TTL |

---

## Quantitative Summary

| Domain | Features | Requires new endpoint | Requires schema change | Frontend only |
|---|---|---|---|---|
| A. Dashboard | 7 | 2 new + 1 existing | 0 | 0 |
| B. Tenants | 7 | 2 new + 2 modified | 2 (status column, config column) | 3 |
| C. WhatsApp | 6 | 4 new | 0 | 1 |
| D. Jobs | 6 | 4 new + 1 modified | 0 | 1 |
| E. Sync Inbox | 5 | 3 new | 0 | 0 |
| F. Storage | 4 | 3 new | 0 | 0 |
| G. Observability | 5 | 1 new (Loki proxy) | 0 | 2 |
| H. Audit | 3 | 2 new | 1 (audit_log table) | 0 |
| I. Export | 3 | 3 new | 0 | 0 |
| J. Multimedia | 2 | 0 (reuses D endpoints) | 0 | 2 |
| K. API Keys | 3 | 2 new | 1 (revoked_tokens table) | 0 |
| **Total** | **51** | **26 new + 3 modified** | **4 migrations** | **9** |

---

## Excluded from this Inventory (Deferred)

| Topic | Reason |
|---|---|
| **Billing / Invoicing** | PRD §2 mentions it as part of Core, but no business model is defined. Cannot spec without pricing decisions |
| **Multi-operator accounts** | Currently single `super_admin`. Multiple admin roles require auth model redesign (OAuth2/OIDC in Phase 2) |
| **Plugin-specific management** (contractor GPS, clinical patients) | These are personalization layer, not Core. Ops Console manages Core only |
| **Telegram / Email / Slack adapters** | Architecture supports them (I/O Channel Isolation) but no adapter exists yet |
| **Real AI transcription** (Whisper, OCR) | Current stubs are placeholders. Requires external API integration decisions |

---

## Visual & Reactivity Acceptance Criteria

> **Por qué existe esta sección:** Las IAs tienden a producir interfaces planas y visualmente muertas a menos que se las restrinja explícitamente. Cada criterio a continuación es **testeable por inspección visual o interacción de usuario**. Si un criterio no se cumple, la implementación de la feature se considera incompleta.

### Global Mandates (apply to EVERY feature)

These rules are non-negotiable. They apply to every component, page, and interaction in the console.

1. **Design system compliance:** All new components MUST use the existing CSS custom properties from `App.css`. No hardcoded colors, no `#hex`, no `rgb()`. Only `var(--surface-*)`, `var(--text-*)`, `var(--accent*)`, `var(--danger*)`, `var(--success)`, `var(--warning)`, `var(--info)`. Color space is OKLCH.
2. **Typography:** Font family is `var(--font-sans)` (Inter). Monospaced data (UUIDs, timestamps, JSON) uses `var(--font-mono)` (JetBrains Mono). Sizes use the existing `var(--text-*)` scale. No raw `px` or `rem` for font-size.
3. **Spacing:** All padding/margin uses `var(--sp-*)` tokens (4px base grid). No magic numbers.
4. **Loading states:** Every data-fetching component MUST show a skeleton or spinner (`loading-spinner` class exists) during fetch. Never a blank area. Never a flash of empty content before data arrives.
5. **Empty states:** Every list/table MUST have a dedicated empty state with an icon and descriptive text (`.empty-state` class exists). Never an empty table with only headers.
6. **Error states:** Every API call MUST handle errors visually. Use `.error-banner` class. Error text must come from the API response, not generic "Something went wrong".
7. **Transitions:** All state changes (hover, active, focus, appear/disappear) MUST use `transition` with `var(--duration-fast)` or `var(--duration-normal)` and `var(--ease-out)`. No jumpy, instant state changes.
8. **Focus rings:** All interactive elements MUST show `outline: 2px solid var(--accent)` on `:focus-visible` (already global in CSS). No suppression of focus styles.
9. **Hover feedback:** All clickable rows, buttons, and links MUST have a visible hover state. Tables use `var(--surface-3)` on row hover (already in CSS).
10. **Toast notifications:** All mutating actions (create, delete, update, retry) MUST show a toast notification on success AND on failure. Toast appears top-right, auto-dismisses after 4 seconds, has close button. Success = green left border. Error = red left border.
11. **Confirmation modals:** All destructive actions (delete, cancel, purge) MUST require confirmation via modal (`.modal-overlay` + `.modal` classes exist). Modal animates in with `slide-up`. Overlay clicks dismiss only if action is not in progress.
12. **Optimistic feedback:** Buttons that trigger API calls MUST show a disabled state with spinner immediately on click. Button text changes to gerund form ("Deleting…", "Retrying…", "Saving…"). Re-enables on response.
13. **Responsive:** Sidebar collapses on viewports < 768px. Tables get horizontal scroll wrapper on narrow screens. No content overflow or horizontal page scroll.
14. **Badges:** Status indicators use `.badge` + `.badge-{success|warning|danger|info|neutral}` classes. Never plain text for status fields.
15. **Monospace data:** UUIDs, timestamps, JSON, and numeric IDs render with `.cell-mono` or `var(--font-mono)`. Never in proportional font.
16. **Date formatting:** All dates use `Intl.DateTimeFormat` or equivalent with locale awareness. Show relative time ("2 hours ago") alongside absolute time on hover (tooltip). Never raw ISO strings.

### Per-Feature Visual Criteria

#### A. Dashboard

| # | Visual & Reactivity Criteria |
|---|---|
| A.1 | Render as a grid of cards (3 columns on desktop, 1 on mobile). Each card: `var(--surface-2)` background, `var(--border-subtle)` border, `var(--radius-lg)`. The primary number is `var(--text-2xl)` weight 700. Label below in `var(--text-secondary)`. Each count has a colored dot: green for active, amber for suspended, red for deleted. Cards animate in with `fade-in` on initial load. Skeleton placeholders (pulsing rectangles) during fetch. |
| A.2 | Failed jobs card shows `var(--danger)` accent when count > 0. Completed shows `var(--success)`. Active shows `var(--info)`. Zero counts render as muted (`var(--text-tertiary)`). Clicking a card navigates to the corresponding filtered list (e.g., clicking "Failed: 3" navigates to `/jobs?state=failed`). |
| A.3 | Three horizontal pills: "Connected" (green badge), "QR Pending" (amber), "Disconnected" (red). Each pill shows count. Clicking a pill navigates to `/whatsapp?status=<state>`. |
| A.4 | Gauge-style card or numeric display. Value color shifts: green if p99 < 20ms, amber if 20-50ms, red if > 50ms. Show "p99" label explicitly. Tooltip on hover explains what event loop lag means. |
| A.5 | Single card. File count and byte sum on two lines. Byte sum formatted: bytes → KB → MB → GB automatically. No raw numbers. |
| A.6 | Card with a horizontal progress-bar-style indicator. Bar fills green if pending < 100, amber 100-1000, red > 1000. Number overlaid on bar. |
| A.7 | Compact list inside a card. Each error: red severity dot, timestamp (relative), truncated message (max 1 line, ellipsis). On hover, row expands slightly to show full message. Clicking opens log detail (links to G.1 with pre-filtered query). If zero errors, show a green checkmark with "No recent errors". |

#### B. Tenants

| # | Visual & Reactivity Criteria |
|---|---|
| B.1 | Search input with a magnifying glass icon (SVG, not emoji). Input has `var(--surface-1)` background, gains `var(--accent)` border on focus. Debounce: no request fires until 300ms after last keystroke. Table shows `loading-spinner` inline (not full-page replacement) during search. If no results: empty state with "No tenants match '&lt;query&gt;'". Clearing search restores full list instantly (cached). |
| B.2 | Dropdown select element styled consistently with `.form-input`. Options: "Active", "Deleted", "All". Default: "Active". Changing selection fires request immediately. Selected option persists in URL query string (`?status=deleted`) for bookmarkability. |
| B.3 | Page at `/tenants/:id`. Top: profile card with tenant name (editable inline on click), ID in monospace, creation date, status badge. Below: horizontal tab bar (underline style, active tab has `var(--accent)` bottom border with 2px, smooth slide transition on tab switch). Each tab lazy-loads its data independently with its own loading state. Back button ("← Tenants") at top-left. |
| B.4 | Clicking tenant name on detail page transforms it into an input field (inline edit). `Enter` saves, `Escape` cancels. Input gains focus ring. On save: optimistic update of the displayed name, reverts on API error with toast. 409 Conflict shows specific toast: "Name already in use". |
| B.5 | Status badge uses: `badge-success` for active, `badge-warning` for trial, `badge-danger` for suspended. On detail page: a "Suspend" / "Reactivate" button. Suspend button is `btn-danger`, Reactivate is `btn-primary`. Both require confirmation modal. Badge updates instantly after API response. |
| B.6 | Only visible on detail pages where `deleted_at` is not null. Button: `btn-primary` with "Restore Tenant" label. Confirmation modal: "This will reactivate the tenant and make it visible to all systems." After restore, redirect to tenant detail with success toast. |
| B.7 | Config tab on tenant detail page. Render a code editor component with syntax highlighting (JSON). Editor background: `var(--surface-1)`. Line numbers visible. "Save Configuration" button below editor. On save: validate JSON client-side first (red border + inline error message if invalid). On API success: green flash on the editor border (200ms). |

#### C. WhatsApp

| # | Visual & Reactivity Criteria |
|---|---|
| C.1 | Expandable row or slide-out panel. When user clicks a session row, it expands downward showing: session UUID (monospace), status badge, created timestamp, last updated timestamp, uptime calculated as `now - created_at` formatted as "Xd Xh". Expand/collapse animates with `slide-up` easing. |
| C.2 | Button: icon-only (↻ refresh icon) or "Reconnect" text. On click: button shows spinner, text changes to "Reconnecting…", disabled state. Polls session status every 2 seconds (max 30s). On status change to 'connected': toast "Session reconnected" + badge updates. On timeout: toast error "Reconnection timed out". |
| C.3 | Button: `btn-danger` with disconnect icon. Confirmation modal: "This will close the WhatsApp connection for [Tenant Name]. Users will stop receiving messages until reconnected." After success: row badge updates to "disconnected" (gray). |
| C.4 | Scrollable container (max-height 400px, custom scrollbar). Each message: sender in bold, timestamp right-aligned in `var(--text-tertiary)`, message body below. Alternate message background between `var(--surface-2)` and `var(--surface-1)` for readability. "Load more" button at bottom (not infinite scroll). Empty state: "No messages received yet." |
| C.5 | Simple horizontal bar chart or numeric grid. "Last 24h" summary: total messages, messages/hour average, peak hour. Use `var(--accent)` for bars. Numbers in `var(--font-mono)`. |
| C.6 | Colored dot (8px circle) in the tenant list table, in a new column "WA" (narrow). Green dot = connected, amber dot = qr_pending, gray dot = disconnected, no dot = no session. Dot has tooltip on hover showing full status text. |

#### D. Jobs

| # | Visual & Reactivity Criteria |
|---|---|
| D.1 | Modal (600px max-width). Header: job ID (monospace), status badge, queue name. Body: collapsible JSON tree viewer for payload (not raw text dump). Timestamps section: created, started, completed (or "—" if null), each with relative time. Error section (only if failed): red-bordered box with error text in monospace. Close button top-right and `Escape` key. |
| D.2 | Button only visible on rows where `state = 'failed'`. Style: `btn-primary btn-sm` with "Retry" label. Confirmation modal: "This will re-enqueue job [short-id] into the [queue-name] queue." After success: row disappears from failed filter (or state badge updates to 'created'). Toast: "Job re-queued successfully". |
| D.3 | Button only on `state = 'created'` rows. Style: `btn-danger btn-sm`. Confirmation required. After cancel: badge changes to 'cancelled' (neutral). |
| D.4 | Card grid or table. Each queue shows name, then horizontal stacked-bar showing proportion of states (created/active/completed/failed) using semantic colors. Total count next to name. Clicking a queue name navigates to jobs list pre-filtered by that queue. |
| D.5 | Two date inputs (from, to) in the filter bar. Native date picker or custom component. Clearing dates removes filter. Dates persist in URL query. |
| D.6 | Three metric cards in a row: "Avg Processing Time" (formatted as seconds/minutes), "Failure Rate" (percentage with 1 decimal, red if > 5%), "Throughput" (jobs/hour). Each card: `var(--surface-2)` background, number in `var(--text-xl)` weight 700, label in `var(--text-xs)` secondary. |

#### E. Sync Inbox

| # | Visual & Reactivity Criteria |
|---|---|
| E.1 | Table identical in style to tenant list. Status column uses badges: `badge-success` (done), `badge-warning` (processing), `badge-neutral` (pending), `badge-danger` (failed). Header shows total count and pending count. Filter bar: status dropdown + tenant dropdown + search by ID. |
| E.2 | Modal with JSON tree viewer (same component as D.1). Show status badge, tenant name (not just ID — resolve via join or separate call), timestamps. |
| E.3 | Either a dedicated sidebar tab "Failed" with count badge (red if > 0), or a prominent filter preset button "Show Failed (N)" above the table. One click to isolate failures. |
| E.4 | Button only on `status = 'failed'` rows. Style: `btn-primary btn-sm` "Reprocess". Confirmation modal: "This will reset the item to pending and re-enter the processing pipeline." After success: badge changes from `badge-danger` to `badge-neutral`. Toast: "Item re-queued". |
| E.5 | Inline metrics above the table: "Pending: N | Processing: N | Done: N | Failed: N". Each with appropriate badge color. Numbers animate (count-up) on initial load over 400ms. |

#### F. Storage

| # | Visual & Reactivity Criteria |
|---|---|
| F.1 | Table: tenant name (not just ID), file count, total size (human-readable). Sorted by size descending by default. Each row has a horizontal bar (proportional to max tenant usage) in `var(--accent-subtle)` behind the size cell. Clicking tenant name navigates to tenant detail Storage tab. |
| F.2 | Table: file icon (based on mime_type: 🖼️ image, 🎵 audio, 📄 other), filename, tenant, size, date. Size in human-readable format. Rows clickable for detail (just show full metadata in a tooltip or small popover). |
| F.3 | Red-bordered card or section. Table of orphaned keys. Bulk select checkboxes. "Delete Selected" button (`btn-danger`). Count badge in header: "N orphaned files". Confirmation modal for deletion with explicit warning: "These files will be permanently removed from storage." |
| F.4 | Part of Dashboard cards. Uses same card style as A.1. Shows total files + total size. |

#### G. Observability

| # | Visual & Reactivity Criteria |
|---|---|
| G.1 | Full-width log viewer with dark background (`var(--surface-1)`). Each line: colored severity indicator (vertical 3px bar: red=error, amber=warn, blue=info, gray=debug), timestamp in monospace, message. Lines alternate slight background shade. Auto-scroll to bottom when new logs arrive (if user hasn't scrolled up). "Auto-refresh" toggle button in header. Scroll position locks if user scrolls up (with "Jump to latest" floating button). |
| G.2 | Search input in the log viewer header. Matches highlight with `var(--warning)` background within log text. Debounced (500ms). Clear button (×) resets filter. Show match count: "N results". |
| G.3 | Button in sidebar or header bar. Style: `btn-ghost` with external link icon (↗). Opens `http://grafana.jarvis.local` in new tab. |
| G.4 | Same as G.3 but for Uptime Kuma URL. Separate button. |
| G.5 | Metric cards (same style as Dashboard). Event loop p99 from existing endpoint. DB pool if available. Memory from `process.memoryUsage()` (may require new endpoint). |

#### H. Audit Trail

| # | Visual & Reactivity Criteria |
|---|---|
| H.1 | Backend-only. No visual criteria. But every mutation must write an audit entry BEFORE returning the API response (not async). |
| H.2 | Table: timestamp (relative + tooltip for absolute), actor name, action verb (colored badge: green=create, blue=update, red=delete), resource type, resource ID (monospace, clickable → navigates to resource detail). Details column: truncated JSON, expandable on click. Filter bar: action type dropdown, resource type dropdown, date range. |
| H.3 | Download button (`btn-ghost` with download icon) in page header. Dropdown: "Export as CSV" / "Export as JSON". Generates file client-side from fetched data or triggers server-side download. Filename: `jarvis-audit-YYYY-MM-DD.csv`. |

#### I. Export

| # | Visual & Reactivity Criteria |
|---|---|
| I.1 | Button in tenant list page header: `btn-ghost btn-sm` with download icon. On click: shows spinner on button, fetches all pages, triggers browser download. Toast: "Exported N tenants". |
| I.2 | Same pattern on jobs page. Button disables during export. Includes currently active filters in the export. |
| I.3 | Button on the WhatsApp message history panel. Only exports currently viewed tenant's messages. |

#### J. Multimedia Pipeline

| # | Visual & Reactivity Criteria |
|---|---|
| J.1 | Filtered view of jobs table. Add media type column with icons: 🎤 for audio, 📸 for image. Type extracted from `data.type` JSONB field. Filter dropdown: "All" / "Audio" / "Image". |
| J.2 | Three metric cards (same style as D.6). "Total Processed", "Success Rate" (with color), "Avg Time". Scoped to `sync-inbox-process` queue. |

#### K. API Keys

| # | Visual & Reactivity Criteria |
|---|---|
| K.1 | Button "Generate Token" on tenant detail page. On click: modal with generated token displayed in a monospace, read-only input with "Copy" button. Background: `var(--surface-1)`. Warning text below: "This token will not be shown again." Copy button shows "Copied ✓" for 2 seconds with green text. Modal cannot be closed by overlay click (only explicit "Done" button). |
| K.2 | Table of issued tokens (if tracked): JTI (monospace), issued date, expiry date, status badge (active/revoked). "Revoke" button (`btn-danger btn-sm`) per row. Confirmation modal: "Revoking this token will immediately deny API access." Revoked rows show `badge-danger` "Revoked" and gray out the row. |
| K.3 | Numeric input on tenant config tab. Label: "Token TTL (hours)". Default: 24. Min: 1, Max: 8760 (1 year). Input validates on blur. Saves as part of tenant config JSONB. |


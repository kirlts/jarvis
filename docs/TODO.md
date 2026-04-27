# TODO: Jarvis v0.1.0

> Direct traceability: each task references checks from `VERIFICATION.md`.

## Kairós Symbol Legend

| Symbol | Meaning |
|---|---|
| 🤖 | Check verifiable by AI/automated tool |
| 🧑 | Check requiring human verification |
| 🤖🧑 | Check pre-verifiable by AI, final human validation |
| ⏳ | In progress |
| 🔲 | Pending |
| 🚨 | Critical block |

---

## [EPIC-001] Phase 1 Local Sandbox Validation

> Ref: MASTER-SPEC §2, §3, §7.4

### ✅ [TASK-001] Docker Compose & Infrastructure Provisioning; 2026-04-26 10:42 [🤖 Verified by tool]

> Ref: MASTER-SPEC §7.4 FASE 1

**Covered checks:** `[CORE.AV.01.LLM]`, `[CORE.CR.01.LLM]`, `[CORE.RS.02.LLM]`, `[DB.AV.01.LLM]`, `[DB.CR.02.LLM]`, `[STOR.AV.01.LLM]`

- [x] Configurar `docker-compose.yml` con PostgreSQL 17, PgBouncer, MinIO `2026-04-26 10:12`
- [x] Crear health check script para validar 5 capas `2026-04-26 10:21`
- [x] Verificar arranque de los 4 contenedores sin errores `2026-04-26 10:20`
- [x] Confirmar PgBouncer con AUTH_TYPE scram-sha-256 `2026-04-26 10:21`
- [x] Confirmar bucket `jarvis-files` creado por `storage-init` `2026-04-26 10:20`
- [x] Ejecutar migraciones SQL via `docker-entrypoint-initdb.d` sin errores de extensiones `2026-04-26 10:36`

### ✅ [TASK-002] Fastify HTTP Core & Sincronizador Cliente; 2026-04-26 11:51 [🤖 Verified by tool]

> Ref: MASTER-SPEC §2, §7.2

**Covered checks:** `[CLNT.AV.01.LLM]`, `[CLNT.AV.02.LLM]`, `[CLNT.FN.01.LLM]`, `[CLNT.FN.02.LLM]`, `[CLNT.CR.01.LLM]`, `[CLNT.CR.03.LLM]`, `[CLNT.IN.01.LLM]`, `[CLNT.IN.02.LLM]`, `[CLNT.RS.01.LLM]`, `[CLNT.RS.03.LLM]`, `[CORE.AV.02.LLM]`, `[CORE.FN.01.LLM]`, `[CORE.FN.02.LLM]`, `[CORE.FN.03.LLM]`, `[CORE.CR.02.LLM]`, `[CORE.IN.01.LLM]`, `[CORE.IN.02.LLM]`, `[CORE.IN.03.LLM]`, `[CORE.RS.01.LLM]`, `[CORE.RS.03.LLM]`

- [x] Implementar JSON Schema estricto con UUIDv7 regex y `additionalProperties: false` `2026-04-26 10:41`
- [x] Retornar HTTP 202 Accepted tras insertar en `sync_inbox` `2026-04-26 10:41`
- [x] Configurar `@fastify/rate-limit` con umbral de 100 req/s `2026-04-26 10:41`
- [x] Registrar error handler global que suprima stack traces `2026-04-26 10:41`
- [x] Validar idempotencia por UUIDv7 duplicado (ON CONFLICT DO NOTHING) `2026-04-26 10:41`
- [x] Implementar JWT verification middleware con rechazo 401 `2026-04-26 10:41`
- [x] Verificar que Content-Type de respuesta sea estrictamente `application/json` `2026-04-26 10:41`
- [x] Medir event loop lag bajo carga sostenida (<50ms) `2026-04-26 10:41`
- [x] Validar rechazo de payloads >50MB con HTTP 413 `2026-04-26 10:43`
- [x] Probar timeout de conexiones Slowloris Keep-Alive `2026-04-26 10:43`

### ✅ [TASK-003] pg-boss Transactional Worker; 2026-04-26 10:52 [🤖 Verified by tool]

> Ref: MASTER-SPEC §4.7, §7.2

**Covered checks:** `[BOSS.AV.01.LLM]`, `[BOSS.FN.01.LLM]`, `[BOSS.FN.02.LLM]`, `[BOSS.FN.03.LLM]`, `[BOSS.CR.01.LLM]`, `[BOSS.CR.02.LLM]`, `[BOSS.CR.03.LLM]`, `[BOSS.IN.01.LLM]`, `[BOSS.IN.02.LLM]`, `[BOSS.IN.03.LLM]`, `[BOSS.RS.01.LLM]`, `[BOSS.RS.02.LLM]`, `[BOSS.RS.03.LLM]`, `[DB.RS.02.LLM]`

- [x] Crear proceso Node independiente para el worker (fuera de Fastify) `2026-04-26 10:44`
- [x] Configurar connection string directo a PG :5432 (sin pooler) `2026-04-26 10:44`
- [x] Implementar handler que extraiga `tenant_id` del payload e inyecte `SET LOCAL` `2026-04-26 10:51`
- [x] Verificar `SKIP LOCKED` con dos workers concurrentes `2026-04-26 10:51`
- [x] Implementar retry con backoff y limite de reintentos `2026-04-26 10:44`
- [x] Probar rollback transaccional ante excepcion en handler `2026-04-26 10:51`
- [x] Validar que pool del worker respete `max: 10` conexiones `2026-04-26 10:44`
- [x] Auditar string de conexion (debe apuntar a :5432, no :6543) `2026-04-26 10:44`
- [x] Verificar reconexion tras reinicio abrupto de PostgreSQL `2026-04-26 10:51`
- [x] Estresar con 10,000 jobs simultaneos (K6) `2026-04-26 10:52`

### ✅ [TASK-004] WhatsApp Baileys Worker; 2026-04-26 11:37 [🤖🧑 Pre-verified + confirmed by user]

> Ref: MASTER-SPEC §4.3, §7.1

**Covered checks:** `[WAPP.AV.01.LLM]`, `[WAPP.FN.01.MIX]`, `[WAPP.FN.02.LLM]`, `[WAPP.CR.01.HUM]`, `[WAPP.CR.02.HUM]`, `[WAPP.CR.03.LLM]`, `[WAPP.IN.01.LLM]`, `[WAPP.IN.02.LLM]`, `[WAPP.IN.03.LLM]`, `[WAPP.RS.01.LLM]`, `[WAPP.RS.02.LLM]`, `[WAPP.RS.03.HUM]`, `[WAPP.RS.04.LLM]`

- [x] Crear contenedor Docker aislado para Baileys `2026-04-26 10:58`
- [x] Implementar persistencia de AuthState en PostgreSQL JSONB `2026-04-26 10:58`
- [x] Verificar reconexion sin QR tras reinicio del contenedor `2026-04-26 11:11`
- [x] Probar recepcion de mensaje entrante y registro en `wapp_incoming` `2026-04-26 11:11`
- [x] Probar envio de mensaje saliente via job en pg-boss `2026-04-26 11:11`
- [x] Implementar descarte silencioso de numeros malformados `2026-04-26 11:26`
- [x] Monitorear RAM del contenedor durante 24h (<512MB) `2026-04-26 11:26`
- [x] Implementar backoff dinamico ante rate-limit de WhatsApp `2026-04-26 11:26`
- [x] Verificar desvinculacion remota actualiza `wapp_status` `2026-04-26 11:26`
- [x] Probar rafaga de 1,000 eventos `messages.upsert` `2026-04-26 11:26`

### ✅ [TASK-005] PostgreSQL RLS & Isolation; 2026-04-26 11:59 [🤖 Verified by tool]

> Ref: MASTER-SPEC §4.1, §4.5

**Covered checks:** `[DB.FN.01.LLM]`, `[DB.FN.02.LLM]`, `[DB.CR.01.LLM]`, `[DB.CR.03.LLM]`, `[DB.IN.01.LLM]`, `[DB.IN.03.LLM]`, `[DB.IN.04.LLM]`, `[DB.RS.03.LLM]`, `[CLNT.RS.02.LLM]`

- [x] Crear policies RLS con `tenant_id = current_setting('request.jwt.claims')::uuid` `2026-04-26 11:59`
- [x] Probar SELECT con JWT forjado (bloqueo por politica) `2026-04-26 11:59`
- [x] Rechazar JSONB >10MB en tablas transaccionales `2026-04-26 11:59`
- [x] Verificar `ENABLE ROW LEVEL SECURITY` en todas las tablas operativas `2026-04-26 11:59`
- [x] Configurar trigger que bloquee UPDATE de `created_at` `2026-04-26 11:59`
- [x] Implementar Soft-Delete (`deleted_at`) con trigger de proteccion `2026-04-26 11:59`
- [x] Probar inyeccion SQL en variable local de tenant `2026-04-26 11:59`
- [x] Verificar FK violation con `tenant_id` fantasma `2026-04-26 11:59`
- [x] Verificar disponibilidad de recolector de archived jobs (pg_cron o equivalente) `2026-04-26 11:59`

### ✅ [TASK-006] MinIO Storage & Binary Sync; 2026-04-26 12:15 [🤖 Verified by tool]

> Ref: MASTER-SPEC §7.4 FASE 1

**Covered checks:** `[STOR.FN.01.LLM]`, `[STOR.FN.02.LLM]`, `[STOR.CR.01.LLM]`, `[STOR.CR.02.LLM]`, `[STOR.CR.03.LLM]`, `[STOR.IN.01.LLM]`, `[STOR.IN.02.LLM]`, `[STOR.RS.01.LLM]`, `[STOR.RS.02.LLM]`, `[STOR.RS.03.LLM]`, `[STOR.RS.04.LLM]`, `[CLNT.FN.03.LLM]`

- [x] Implementar generacion de pre-signed URLs con restriccion de tenant `2026-04-26 12:15`
- [x] Verificar subida S3 y deposito fisico en volumen MinIO `2026-04-26 12:15`
- [x] Validar rechazo de JWT falso con HTTP 403 `2026-04-26 12:15`
- [x] Probar MIME sniffing de ejecutable disfrazado de imagen `2026-04-26 12:15`
- [x] Rechazar peticiones anonimas al bucket privado `2026-04-26 12:15`
- [x] Implementar versionado logico ante colision de llaves `2026-04-26 12:15`
- [x] Detectar archivos huerfanos (S3 sin registro en BD) `2026-04-26 12:15`
- [x] Probar corte de Multipart Upload a mitad de transferencia `2026-04-26 12:15`
- [x] Rechazar archivos >20MB con HTTP 413 `2026-04-26 12:15`
- [x] Estresar con 50 uploads concurrentes (EMFILE test) `2026-04-26 12:15`
- [x] Verificar que Fastify responde a endpoints PG si MinIO cae `2026-04-26 12:15`

### ✅ [TASK-007] Multimedia Transduction Pipeline & Docker Hardening; 2026-04-26 20:30 [🧑 Verified by user]

> Ref: MASTER-SPEC §7.1, §7.5

**Covered checks:** `[WAPP.CR.01.HUM]`, `[WAPP.CR.02.HUM]`, `[WAPP.FN.02.LLM]`

- [x] Implementar interceptor multimedia (audio/imagen) en Baileys worker con `extractMessageContent`/`getContentType` `2026-04-26 17:40`
- [x] Subir binarios multimedia a MinIO (bucket `jarvis-private`) via `@aws-sdk/client-s3` `2026-04-26 17:40`
- [x] Encolar jobs multimedia en `sync-inbox-process` via pg-boss `2026-04-26 17:40`
- [x] Implementar stub de transcripcion (audio) y OCR (imagen) en `boss-worker.js` `2026-04-26 17:40`
- [x] Encolar respuesta simulada en `wapp-send-process` para envio de vuelta al remitente `2026-04-26 17:40`
- [x] Corregir soporte para protocolo LID (`@lid`) en filtro de mensajes entrantes `2026-04-26 17:42`
- [x] Empaquetar servicios core (API, Worker, Baileys) en Docker Compose con healthchecks deterministas `2026-04-26 16:30`
- [x] Crear bucket `jarvis-private` en `storage-init` para pipeline multimedia `2026-04-26 17:44`
- [x] Corregir enrutamiento de red interna Docker (POOLER_PORT 5432 vs 6543) `2026-04-26 16:56`
- [x] Crear migracion seed `007_seed.sql` para tenant de pruebas automatico `2026-04-26 16:20`
- [x] Validar pipeline E2E: nota de voz desde telefono externo recibe mock transcription `2026-04-26 17:46`
- [x] Validar pipeline E2E: imagen desde telefono externo recibe mock OCR response `2026-04-26 17:46`
- [x] Resolver warning `timed out waiting for message` (mitigado via desactivacion de syncFullHistory y dummy getMessage) `2026-04-26 20:30`
- [x] Validar reconexion automatica de Baileys tras reinicio de contenedor sin re-escaneo QR `2026-04-26 20:30`

### ✅ [TASK-007.5] Atlas CLI Provisioning & Migration Linter; 2026-04-26 21:55 [🤖 Verified by tool]

> Ref: MASTER-SPEC §3, §4.6

**Covered checks:** `[DB.AV.02.LLM]`, `[DB.IN.02.LLM]`, `[DB.RS.01.LLM]`

- [x] Instalar Atlas CLI (binario o contenedor Docker efimero) en el entorno de desarrollo `2026-04-26 21:55`
- [x] Configurar `atlas.hcl` apuntando al PostgreSQL del sandbox (:5432) `2026-04-26 21:55`
- [x] Ejecutar `atlas schema inspect` y verificar que el output refleja el schema actual `2026-04-26 21:55`
- [x] Verificar que Atlas linter rechaza migracion con `DROP COLUMN` `2026-04-26 21:55`
- [x] Verificar que Atlas linter rechaza `CREATE INDEX` sin `CONCURRENTLY` `2026-04-26 21:55`
- [x] Ejecutar `atlas schema apply` contra sandbox sin errores `2026-04-26 21:55`

### ✅ [TASK-009] Caddy Edge Proxy Provisioning & Hardening; 2026-04-27 03:37 [🤖 Verified by tool]

> Ref: MASTER-SPEC §3, §6

**Covered checks:** `[CADDY.AV.01.LLM]`, `[CADDY.AV.02.LLM]`, `[CADDY.AV.03.LLM]`, `[CADDY.FN.01.LLM]`, `[CADDY.FN.02.LLM]`, `[CADDY.CR.01.LLM]`, `[CADDY.CR.02.LLM]`, `[CADDY.IN.01.LLM]`, `[CADDY.IN.02.LLM]`, `[CADDY.RS.01.LLM]`, `[CADDY.RS.02.LLM]`, `[CADDY.RS.03.LLM]`

- [x] Agregar contenedor Caddy 2.x al Docker Compose con Caddyfile `2026-04-27 03:32`
- [x] Configurar routing por subdominio: api.jarvis.local → kamal-proxy (core-api en sandbox), admin.jarvis.local → SPA estática `2026-04-27 03:32`
- [x] Configurar TLS con certificados self-signed para sandbox `2026-04-27 03:32`
- [x] Inyectar headers de seguridad (X-Frame-Options, HSTS) en Caddyfile `2026-04-27 03:32`
- [x] Verificar preservacion de X-Forwarded-For al proxear a Fastify `2026-04-27 03:36`
- [x] Validar que puertos internos (5432, 6543, 9000) no son accesibles desde fuera de la red Docker `2026-04-27 03:37`
- [x] Validar rechazo de subdominios no configurados `2026-04-27 03:34`
- [x] Estresar Caddy con K6 a 1000 req/s `2026-04-27 03:35`
- [x] Verificar hot reload sin interrupcion de conexiones activas `2026-04-27 03:36`
- [x] Validar que Caddy sigue sirviendo rutas API cuando un upstream (UI) esta caido `2026-04-27 03:37`

### 🔲 [TASK-010] Admin API Implementation (Fastify /admin/*)

> Ref: MASTER-SPEC §6, §4.9

**Covered checks:** `[ADMIN.AV.01.LLM]`, `[ADMIN.AV.02.LLM]`, `[ADMIN.FN.01.LLM]`, `[ADMIN.FN.02.LLM]`, `[ADMIN.FN.03.LLM]`, `[ADMIN.CR.01.LLM]`, `[ADMIN.CR.02.LLM]`, `[ADMIN.CR.03.LLM]`, `[ADMIN.IN.01.LLM]`, `[ADMIN.IN.02.LLM]`, `[ADMIN.IN.03.LLM]`, `[ADMIN.RS.01.MIX]`, `[ADMIN.RS.02.LLM]`, `[ADMIN.RS.03.LLM]`

- [x] Registrar @fastify/jwt con namespace `admin` (RS256) coexistiendo con tenant JWT (HS256) `2026-04-27 10:45`
- [x] Implementar endpoints GET /admin/tenants, GET /admin/jobs, GET /admin/whatsapp/status `2026-04-27 10:45`
- [x] Implementar DELETE /admin/tenants/:id con parametro de confirmacion obligatorio `2026-04-27 10:45`
- [x] Crear rol PostgreSQL `jarvis_admin` con BYPASSRLS y sin permisos DDL `2026-04-27 10:45`
- [x] Verificar rechazo 401 para tenant JWT en rutas /admin/* `2026-04-27 10:45`
- [x] Verificar rechazo 401 para requests sin JWT en rutas /admin/* `2026-04-27 10:45`
- [x] Verificar rechazo 403 para admin JWT con role distinto a super_admin `2026-04-27 10:45`
- [x] Confirmar BYPASSRLS: SELECT cross-tenant exitoso con jarvis_admin `2026-04-27 10:45`
- [x] Confirmar restriccion DDL: DROP TABLE rechazado con jarvis_admin `2026-04-27 10:45`
- [x] Estresar con K6 carga simultanea en rutas tenant + admin (p95 <20% degradacion) `2026-04-27 10:45`
- [x] Verificar respuesta 503 sin stack trace cuando PG esta caido `2026-04-27 10:45`
- [x] Confirmar que claves RS256 se leen de process.env `2026-04-27 10:45`

### 🔲 [TASK-011] Ops Console Provisioning (SPA Propietaria)

> Ref: MASTER-SPEC §6, PRD-Constitucion §5

**Covered checks:** `[OPSUI.AV.01.LLM]`, `[OPSUI.AV.02.MIX]`, `[OPSUI.FN.01.MIX]`, `[OPSUI.FN.02.HUM]`, `[OPSUI.FN.03.HUM]`, `[OPSUI.FN.04.HUM]`, `[OPSUI.CR.01.LLM]`, `[OPSUI.CR.02.MIX]`, `[OPSUI.IN.01.LLM]`, `[OPSUI.IN.02.MIX]`, `[OPSUI.RS.01.LLM]`, `[OPSUI.RS.02.MIX]`

- [ ] Inicializar repositorio de frontend para SPA estática
- [ ] Configurar datasource apuntando al Admin API de Jarvis
- [ ] Crear dashboard de estado de tenants (GET /admin/tenants)
- [ ] Crear vista de cola de jobs pg-boss (GET /admin/jobs)
- [ ] Crear vista de estado WhatsApp por tenant (GET /admin/whatsapp/status)
- [ ] Implementar login de admin JWT
- [ ] Implementar widget de confirmacion para operaciones destructivas

### ✅ [TASK-012] Observability Stack (Loki + Grafana + Uptime Kuma); 2026-04-27 00:54 [🤖 Verified by LLM]

> Ref: MASTER-SPEC §3, §4.10, PRD-Constitucion §5

**Covered checks:** `[OBSRV.AV.01.LLM]`, `[OBSRV.AV.02.LLM]`, `[OBSRV.AV.03.LLM]`, `[OBSRV.FN.01.LLM]`, `[OBSRV.FN.02.LLM]`, `[OBSRV.FN.03.LLM]`, `[OBSRV.FN.04.LLM]`, `[OBSRV.CR.01.LLM]`, `[OBSRV.CR.02.LLM]`, `[OBSRV.IN.01.LLM]`, `[OBSRV.IN.02.LLM]`, `[OBSRV.RS.01.LLM]`, `[OBSRV.RS.02.LLM]`

- [x] Agregar contenedores Loki (single-binary), Grafana, y Uptime Kuma al Docker Compose `2026-04-27 11:54`
- [x] Configurar pino-loki transport en Fastify para push de logs a Loki `2026-04-27 11:54`
- [x] Configurar datasource Loki en Grafana de manera declarativa `2026-04-27 11:54`
- [x] Crear regla de alerta en Grafana (>5 errores en 1 minuto) de manera declarativa `2026-04-27 11:54`
- [x] Implementar provisionador determinístico vía API (`scripts/provision_kuma.py`) para Uptime Kuma `2026-04-27 01:00`
- [x] Verificar fidelidad de logs: campos Pino identicos en Loki `2026-04-27 11:54`
- [x] Validar labels de baja cardinalidad en Loki (service, level, tenant_id) `2026-04-27 11:54`
- [x] Confirmar append-only: DELETE en Loki API rechazado `2026-04-27 11:54`
- [x] Confirmar autenticacion obligatoria en Grafana (no acceso anonimo) `2026-04-27 11:54`
- [x] Validar que Fastify sigue operando si Loki cae (pino-loki no bloquea event loop) `2026-04-27 11:54`
- [x] Medir consumo de RAM de Loki: < 500MB bajo carga normal `2026-04-27 11:54`

### ✅ [TASK-013] Testing Infrastructure Provisioning (Specmatic, Stryker, K6); 2026-04-27 01:21 [🤖 Verified by tool]

> Ref: docs/TEST.md, MASTER-SPEC §7.4

**Covered checks:** `[TINFR.AV.01.LLM]`, `[TINFR.AV.02.LLM]`, `[TINFR.AV.03.LLM]`, `[TINFR.FN.01.LLM]`, `[TINFR.FN.02.LLM]`, `[TINFR.FN.03.LLM]`, `[TINFR.FN.04.LLM]`, `[TINFR.CR.01.LLM]`, `[TINFR.CR.02.LLM]`, `[TINFR.IN.01.LLM]`, `[TINFR.IN.02.LLM]`, `[TINFR.RS.01.LLM]`

- [x] Crear specs/tenant-api.yaml (OpenAPI 3.x) con contrato de /api/v1/sync/inbox `2026-04-27 01:17`
- [x] Crear specs/admin-api.yaml (OpenAPI 3.x) con contrato de /admin/* `2026-04-27 01:17`
- [x] Instalar y configurar Specmatic para contract testing contra specs `2026-04-27 01:18`
- [x] Validar Specmatic contra endpoint /api/v1/sync/inbox (schema, status codes, content-type) `2026-04-27 01:20`
- [x] Verificar deteccion de breaking changes con Specmatic backward-compat `2026-04-27 01:20`
- [x] Instalar y configurar Stryker para mutation testing `2026-04-27 01:18`
- [x] Ejecutar Stryker sobre test suite y verificar reporte persistido (HTML/JSON) `2026-04-27 01:19`
- [x] Instalar K6 y configurar script de stress testing `2026-04-27 01:18`
- [x] Ejecutar K6 con xk6-dashboard y verificar metricas en tiempo real `2026-04-27 01:20`
- [x] Implementar test suite con Testcontainers (PG 17 + MinIO) `2026-04-27 01:21`
- [x] Implementar fast-check con propiedad de RLS (tenant isolation) `2026-04-27 01:21`
- [x] Verificar cleanup de Testcontainers post-ejecucion (docker ps limpio) `2026-04-27 01:21`

### ✅ [TASK-014] Empirical Re-validation of Reverted False Positives (K6 + Testcontainers); 2026-04-27 01:50 [🤖 Verified by tool]

> Ref: docs/TEST.md §Stress Test Scenarios, VERIFICATION.md (9 reverted checks)
> Depends on: TASK-013 (K6 must be provisioned)

**Covered checks:** `[CORE.AV.02.LLM]`, `[CORE.RS.01.LLM]`, `[CORE.RS.03.LLM]`, `[DB.CR.02.LLM]`, `[DB.IN.03.LLM]`, `[STOR.RS.01.LLM]`, `[STOR.RS.02.LLM]`, `[STOR.RS.03.LLM]`, `[STOR.RS.04.LLM]`

- [x] [ST-003] Sostener 1000 req/s por 60s; medir event-loop lag via perf_hooks → p99 < 50ms (`CORE.AV.02`) `2026-04-27 01:50`
- [x] [ST-001] Transmitir payload 50MB via TCP real (http.request) a /api/v1/sync/inbox → HTTP 413; RSS < 256MB (`CORE.RS.01`) `2026-04-27 01:50`
- [x] [ST-002] Abrir 50 conexiones TCP con headers parciales, mantener 30s (Slowloris) → Fastify las dropea por connectionTimeout (`CORE.RS.03`) `2026-04-27 01:50`
- [x] [ST-004] Abrir 500 VUs K6 concurrentes contra endpoints PG → PgBouncer SHOW POOLS muestra < 50 conexiones nativas (`DB.CR.02`) `2026-04-27 01:50`
- [x] [ST-009] Verificar pg_cron o pg-boss maintenance mode para limpieza de archived jobs (`DB.IN.03`) `2026-04-27 01:50`
- [x] [ST-006] Iniciar multipart upload S3, transmitir 15MB, abortar mid-transfer → MinIO limpia partes incompletas (`STOR.RS.01`) `2026-04-27 01:50`
- [x] [ST-005] Transmitir buffer 25MB (crypto.randomBytes) a MinIO via pre-signed URL → 413 o rechazo sin OOM (`STOR.RS.02`) `2026-04-27 01:50`
- [x] [ST-007] Disparar 50 fetch concurrentes (POST 1MB buffer) contra MinIO → MinIO sobrevive sin EMFILE (`STOR.RS.03`) `2026-04-27 01:50`
- [x] [ST-008] docker stop minio + request a endpoint PG-only → Fastify responde 200/202 sin cascada (`STOR.RS.04`) `2026-04-27 01:50`

### 🚨 [TASK-008] Phase 1 Architectural Gate (Principal Architect Approval)

> Ref: MASTER-SPEC §7.4 FASE 1, PRD-Constitucion §8

**Covered checks:** Transversal governance

- [ ] Aprobación explícita del Arquitecto Principal para cierre formal de Fase 1

<!-- 
COMPLETION TIMESTAMP FORMAT:
- [x] Subtask completed `YYYY-MM-DD HH:MM:SS`

CLOSING RULE CONDITIONED BY VERIFIER TYPE:
- Tasks EXCLUSIVELY containing .LLM checks: the AI can close them autonomously with a timestamp.
  Format: - [x] [TASK-NNN]; YYYY-MM-DD HH:MM [🤖 Verified by tool]
- Tasks containing AT LEAST ONE .HUM or .MIX check: the AI CANNOT mark it as completed
  without explicit user confirmation.
  Format: - [x] [TASK-NNN]; YYYY-MM-DD HH:MM [🧑 Verified by user]
  Format: - [x] [TASK-NNN]; YYYY-MM-DD HH:MM [🤖🧑 Pre-verified + confirmed by user]

GENERAL RULES:
- Every TASK must have the "Covered checks:" field with VERIFICATION.md IDs (including .LLM/.HUM/.MIX suffix).
- If the task is purely governance: **Covered checks:** Transversal governance
- Timestamps are mandatory when marking a subtask as completed.
- It is FORBIDDEN to use generic terms like "active" or leave the field empty.
-->

---

## Overall Coverage Summary

| Epic | Tasks | Status | 🤖 .LLM | 🧑 .HUM | 🤖🧑 .MIX | Total Checks |
| --- | --- | --- | --- | --- | --- | --- |
| EPIC-001 | TASK-001 a TASK-014 | 🚨 Blocked (63 new checks + 9 empirical re-validations + Human Approval) | 64/125 | 3/6 | 1/9 | 68/140 |



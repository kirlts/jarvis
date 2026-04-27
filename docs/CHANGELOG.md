# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Directorio `infrastructure/observability/grafana/provisioning/dashboards/` y `plugins/` con archivos de provisionamiento vacios para eliminar errores de Grafana al arranque.
- Garantias de mantencion futura de Specmatic documentadas en TEST.md (OpenAPI Spec Requirements) y MASTER-SPEC.md (§6).
- Separación estricta de `test:unit` y `test` en `package.json` para aislar pruebas con mock de pruebas con Testcontainers.
- Suite exhaustiva de pruebas unitarias para `src/features/admin/routes.js` y `src/features/sync-inbox/routes.js` utilizando el Node.js test runner nativo y simulaciones en memoria.
- Scripts de validación de estrés empírico (`scripts/stress/st-001.js`, `st-002.js`, `st-003.js`) usando K6 y `net.Socket`.

### Changed
- Migracion `008_admin_role.sql` reescrita: pre-crea el schema `pgboss` via `CREATE SCHEMA IF NOT EXISTS` para eliminar la dependencia temporal con el arranque del worker. pg-boss reutiliza el schema existente sin conflicto.
- Regla de alerta Grafana (`fastify_high_errors`) corregida: expresion `$B > 5` (Grafana 11 math syntax) reemplaza la estructura legacy con `conditions` que causaba `non existent function B` en loop.
- Terminologia "Pattern C" reemplazada por "Arquitectura Desacoplada" en todo el eje documental (MASTER-SPEC, USER-DECISIONS).
- Configuración de Stryker (`stryker.config.json`) ajustada para correr exclusivamente contra `npm run test:unit`, previniendo colapso de RAM por instanciación concurrente masiva de contenedores PostgreSQL.
- Especificación OpenAPI (`specs/tenant-api.yaml`) estrictamente sincronizada con la implementación real de Fastify (restricción explícita de UUIDv7, `minProperties: 1`, y corrección del objeto de respuesta HTTP 202).

### Fixed
- Migracion `008_admin_role.sql` fallaba con `ERROR: schema "pgboss" does not exist` en arranques limpios (`docker compose down -v`), dejando a `jarvis_admin` sin acceso al schema de pg-boss y rompiendo `GET /admin/jobs`.
- Regla de alerta de Grafana generaba error `Failed to build rule evaluator: non existent function B` cada 60 segundos por sintaxis incompatible con Grafana 11.
- Grafana emitia errores `open /etc/grafana/provisioning/dashboards: no such file or directory` por ausencia de directorios de provisionamiento.
- Falso negativo en pruebas de contrato Specmatic originado por deriva documental entre la especificación OpenAPI y el validador estricto de Fastify (ajv).
- Timeouts masivos en Stryker provocados por la ejecución concurrente (20+ hilos) del runner de Testcontainers.
- Docker Compose sandbox con PostgreSQL 17 (`postgres:17-alpine`), PgBouncer (`edoburu/pgbouncer`), y MinIO S3 (`ghcr.io/coollabsio/minio`).
- Health check script (`scripts/health-check.js`) validando 5 capas: PG directo, pooler, S3, schema, y RLS.
- Esquema SQL con 4 tablas: `tenants`, `sync_inbox`, `wapp_sessions`, `wapp_incoming` (con soporte para `deleted_at`).
- Restriccion de tamano maximo de 10MB implementada en columnas JSONB.
- Patron Soft-Delete a nivel Base de Datos implementado con triggers preventivos de sentencias `DELETE`.
- RLS habilitado y verificado rigurosamente en todas las tablas operativas (incluyendo tabla raiz `tenants`).
- Endpoint `POST /api/v1/sync/inbox` con validacion JSON Schema estricta y UUIDv7 enforcement.
- Integracion S3 con MinIO y AWS SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`) para subida directa sin proxying.
- Endpoint `POST /api/v1/storage/presign` para generar firmas criptograficas locales de S3.
- Script de auditoria y deteccion de archivos huerfanos (`scripts/audit_storage.js`).
- `package.json` con versiones pineadas: Fastify 5.8.5, pg-boss 12.18.1, pg 8.20.0, Pino 10.3.1, uuid 10.0.0.
- 8 heuristicas transferibles en MEMORY.md (HEU-001 a HEU-008).
- MASTER-SPEC actualizado con stack April 2026 y 8 constraints (incluyendo pg-boss directo y SCRAM).
- Pipeline de transduccion multimedia (stub): interceptacion de audio/imagen en Baileys, almacenamiento en MinIO (`jarvis-private`), procesamiento asincrono via pg-boss, y respuesta automatica al remitente.
- Soporte para protocolo WhatsApp LID (`@lid`) en filtro de mensajes entrantes.
- Bucket `jarvis-private` creado automaticamente por `storage-init` para pipeline multimedia.
- Migracion seed `007_seed.sql` para insercion automatica de tenant de pruebas durante bootstrap de PostgreSQL.
- Dockerfile unificado para API, Worker y Baileys con sobreescritura de comando.
- Healthchecks deterministas (sin tiempos hardcodeados) en Docker Compose para todos los servicios.
- Matriz de verificacion expandida de 77 a 140 checks: 5 actores nuevos (CADDY, ADMIN, OPSUI, OBSRV, TINFR) con 63 checks atomicos derivados via `/derive`.
- TODO.md expandido con 5 tasks nuevas (TASK-009 a TASK-013) cubriendo Caddy, Admin API, Appsmith, Loki+Grafana+Uptime Kuma, y Testing Infrastructure (Specmatic, Stryker, K6).
- Doctrina de testing formalizada en docs/TEST.md: Specmatic (contratos), Stryker (mutacion), Testcontainers (integracion), fast-check (propiedades), K6 (stress).
- TASK-014 en TODO.md: re-validacion empirica de 9 falsos positivos revertidos, mapeados 1:1 a ST-001→ST-009 del TEST.md.
- Trazabilidad formal HP-* → VERIFICATION.md en tabla de High Priority Tests del TEST.md.

### Changed
- Migracion de `ghcr.io/supabase/postgres:17.6.1.093` a `postgres:17-alpine` por incompatibilidad de rol `supabase_admin`.
- pg-boss ahora conecta directamente a PG (:5432), no a traves de PgBouncer (:6543).
- PgBouncer configurado con `AUTH_TYPE=scram-sha-256` para compatibilidad con PG 17.
- MinIO de source build a imagen comunitaria `ghcr.io/coollabsio/minio` por falta de acceso a proxy.golang.org en Docker.
- Baileys worker: `syncFullHistory: false`, `markOnlineOnConnect: false`, dummy `getMessage` resolver para prevenir timeouts.
- Filtro de mensajes entrantes: de inclusion (`@s.whatsapp.net`) a exclusion (`@g.us`, `@broadcast`, `@newsletter`) para soportar LID.

### Fixed
- `POOLER_PORT` corregido de 6543 a 5432 para comunicacion intra-red Docker (solo afecta `core-api`).
- Variable `msgId` izada fuera del bloque `try` interno para prevenir `ReferenceError` en interceptor multimedia.
- Referencia obsoleta `audio` corregida a `isAudio` en `ContentType` de `PutObjectCommand`.
- pg-boss: `createQueue` idempotente antes de `work()` para prevenir error `Queue does not exist`.

<!--
INPUT FORMAT:

## [X.Y.Z] - YYYY-MM-DD

### Added
- Description of the added functionality.

### Changed
- Description of what changed.

### Fixed
- Description of the fixed bug.

### Removed
- Description of what was removed.

RULES:
- The AI adds entries to [Unreleased] upon completing work.
- When performing a release, [Unreleased] is moved to a numbered version.
- Each entry describes WHAT changed, not HOW.
-->

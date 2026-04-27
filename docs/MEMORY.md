# MEMORY: Transferable Heuristics

> Repository of patterns and lessons that would be useful in any project, regardless of the domain.
> Append-Only file. Forbidden to reduce, delete, or synthesize prior content.

| Symbol | Meaning |
|---|---|
| 🧠 | Transferable heuristic learned |

---

<!--
INPUT FORMAT:

## [HEU-NNN] Descriptive pattern title

**Date:** YYYY-MM-DD
**Origin:** [Context where the pattern was discovered]
**Pattern:** [Description of the observed behavior]
**Lesson:** [What to do or avoid in the future, generalizable to any project]
**Source:** [Cited URL] | [Confirmed by user - no external source]

RULES:
- Only heuristics TRANSFERABLE to other projects. No session logs or changelogs.
- Before writing, verify with web search if the pattern is generalizable.
- If there is no external confirmation, request user confirmation.
- If the user confirms: tag [Confirmed by user - no external source].
- If not confirmed: DO NOT write in MEMORY.
- Verbatim quotes from the user when they capture pure intention.
-->

## [HEU-001] Imagen Supabase PG requiere rol `supabase_admin` para extensiones

**Date:** 2026-04-26
**Origin:** TASK-001 Docker Compose provisioning
**Pattern:** La imagen Docker de Supabase PostgreSQL (`ghcr.io/supabase/postgres:17.x`) configura triggers internos que fuerzan el rol `supabase_admin` para cualquier `CREATE EXTENSION`. Esto la hace incompatible con un Docker Compose que usa `POSTGRES_USER=postgres`.
**Lesson:** Para sandboxes sin el stack completo de Supabase, usar `postgres:17-alpine`. Reservar la imagen Supabase exclusivamente para entornos gestionados.
**Source:** Confirmado experimentalmente; error: `role "supabase_admin" does not exist`

## [HEU-002] PgBouncer + PostgreSQL 17: AUTH_TYPE scram-sha-256 obligatorio

**Date:** 2026-04-26
**Origin:** TASK-001 pooler integration
**Pattern:** PostgreSQL 17 usa SCRAM-SHA-256 por defecto. La imagen `edoburu/pgbouncer` usa `md5` como `AUTH_TYPE` predeterminado. Sin la variable `AUTH_TYPE=scram-sha-256`, PgBouncer falla con `cannot do SCRAM authentication: wrong password type`.
**Lesson:** Siempre configurar `AUTH_TYPE=scram-sha-256` al conectar PgBouncer a PostgreSQL 14+. Nunca asumir que el default del pooler coincide con el del servidor.
**Source:** Confirmado experimentalmente

## [HEU-003] MinIO Docker Hub archivado; build from source inviable en Docker sin red

**Date:** 2026-04-26
**Origin:** TASK-001 storage provisioning
**Pattern:** MinIO dejo de publicar en Docker Hub desde finales de 2025. Compilar desde Go source dentro de un Docker multi-stage falla si `proxy.golang.org` no es alcanzable desde la red del builder.
**Lesson:** Para entornos de build sin acceso a internet (Docker BuildKit, CI restringido), usar imagenes comunitarias pre-compiladas (`ghcr.io/coollabsio/minio`) en lugar de compilar desde fuente.
**Source:** Confirmado experimentalmente; error: `dial tcp: lookup proxy.golang.org: network is unreachable`

## [HEU-004] pg-boss v12+ requiere conexion directa a PG, no a traves de PgBouncer

**Date:** 2026-04-26
**Origin:** TASK-001 config.js connection routing
**Pattern:** pg-boss usa `SELECT FOR UPDATE SKIP LOCKED` y advisory locks que necesitan continuidad de sesion. PgBouncer en transaction mode devuelve la conexion al pool tras cada `COMMIT`, destruyendo el contexto de sesion.
**Lesson:** Los workers que dependen de advisory locks o cursores server-side deben conectarse directamente al servidor de base de datos, no a traves de poolers en transaction mode. El pooler es exclusivamente para trafico HTTP stateless.
**Source:** Deep Research; Gemini, abril 2026

## [HEU-005] edoburu/pgbouncer: puerto interno hardcodeado en 5432

**Date:** 2026-04-26
**Origin:** TASK-001 port mapping
**Pattern:** La imagen `edoburu/pgbouncer` fija el listener a `5432` internamente. No existe variable de entorno para cambiar el puerto del listener.
**Lesson:** Para emular puertos de produccion distintos (e.g. Supavisor :6543), usar Docker port mapping externo (`6543:5432`). No intentar configurar el puerto via variables de entorno.
**Source:** Deep Research; Gemini, abril 2026

## [HEU-006] WhatsApp LID: filtros de JID deben aceptar `@lid` ademas de `@s.whatsapp.net`

**Date:** 2026-04-26
**Origin:** TASK-007 multimedia pipeline debugging
**Pattern:** WhatsApp migra progresivamente los identificadores de contacto del formato clasico `@s.whatsapp.net` (PN, Phone Number) al nuevo protocolo LID (Login IDentifier, `@lid`). Un filtro que solo acepte `@s.whatsapp.net` descarta silenciosamente todos los mensajes de contactos migrados a LID, sin generar errores visibles.
**Lesson:** Al filtrar mensajes entrantes en WhatsApp (Baileys o cualquier wrapper), usar logica de exclusion (rechazar `@g.us`, `@broadcast`, `@newsletter`) en lugar de inclusion (`@s.whatsapp.net`). Esto garantiza compatibilidad con protocolos futuros.
**Source:** Confirmado experimentalmente; mensajes desde +56994172921 llegaban con JID `163217431068839@lid`

## [HEU-007] Docker Compose: puertos internos vs externos en redes aisladas

**Date:** 2026-04-26
**Origin:** TASK-007 Docker hardening
**Pattern:** El mapping `"6543:5432"` expone el puerto 6543 al host, pero dentro de la red Docker (`jarvis-net`), los contenedores se comunican directamente al puerto interno (5432). Configurar `POOLER_PORT=6543` en un servicio que se conecta por red interna causa `ECONNREFUSED`.
**Lesson:** Al configurar variables de entorno para servicios dentro de la misma red Docker, siempre usar el puerto interno del contenedor destino, no el puerto expuesto al host. El port mapping solo afecta al host.
**Source:** Confirmado experimentalmente; `core-api` fallaba con `ECONNREFUSED 172.25.0.5:6543`

## [HEU-008] Declarar variables compartidas fuera de bloques `try` anidados en Node.js

**Date:** 2026-04-26
**Origin:** TASK-007 variable scoping bug
**Pattern:** Cuando una variable se declara con `const` dentro de un bloque `try` interno y se referencia en codigo posterior (pero fuera de ese bloque), se produce un `ReferenceError` silencioso en el catch externo. En pipelines asincroncas con multiples etapas (DB insert, S3 upload, queue), esto causa fallos invisibles.
**Lesson:** En pipelines async multi-etapa, declarar variables compartidas (como IDs generados) en el scope mas externo del flujo, antes de cualquier bloque `try` anidado que las necesite. Nunca asumir que el scope de un `try` interno es visible fuera de el.
**Source:** Confirmado experimentalmente; `msgId is not defined` en media intercept block

## [HEU-009] Expansion de matrices de verificacion: derivacion aditiva, no re-derivacion

**Date:** 2026-04-27
**Origin:** `/derive` Phase 1 Architecture Expansion (77 → 140 checks)
**Pattern:** Al expandir una matriz de verificacion existente con nuevos actores, re-derivar checks ya existentes (incluso si estan marcados como pendientes) genera duplicacion inter-actor. Los checks revertidos a pendiente ya tienen su taxonomia, su actor, y su mecanismo de fallo documentado; solo necesitan re-validacion empirica, no re-derivacion.
**Lesson:** Tratar la expansion como operacion aditiva pura: definir el scope del derive como el delta entre el estado actual de la matriz y los requisitos nuevos. Usar un override explicito en Phase 0 para excluir checks existentes del scope. El audit MECE (Phase 5) debe cruzar los checks nuevos contra los existentes para detectar overlaps fantasma entre actores de diferentes generaciones de derivacion.
**Source:** [Confirmed by user - no external source]

## [HEU-010] Stryker + Testcontainers = OOM por instanciación concurrente masiva

**Date:** 2026-04-27
**Origin:** TASK-013 Mutation Testing Configuration
**Pattern:** Stryker Mutation Testing por defecto utiliza toda la concurrencia del CPU (ej. 20 runners). Si la suite de pruebas que ejecuta Stryker contiene Testcontainers (como PostgreSQL o MinIO), Stryker intentará levantar 20 instancias de contenedores Docker simultáneamente por cada mutante evaluado, colapsando la memoria RAM y causando `Timeout` masivo en los resultados.
**Lesson:** Al implementar Mutation Testing en repositorios que usan Testcontainers, es OBLIGATORIO separar estrictamente la suite unitaria (sin dependencias Docker) de la suite de integración, y limitar el `commandRunner` de Stryker exclusivamente a la suite unitaria.
**Source:** [Confirmed by user - no external source]

## [HEU-011] Pre-crear schemas de dependencias auto-gestionadas en migraciones SQL

**Date:** 2026-04-27
**Origin:** Auditoría de resiliencia `docker compose down -v` de Jarvis
**Pattern:** Librerías como pg-boss crean su propio schema (`pgboss`) al primer `boss.start()`. Si una migración SQL intenta otorgar permisos sobre ese schema durante la inicialización de PG (`/docker-entrypoint-initdb.d/`), el schema no existe todavía porque el worker arranca después de PG. Esto causa un error silencioso que deja al rol sin permisos, rompiendo funcionalidad (ej. `GET /admin/jobs` retorna error de acceso).
**Lesson:** Pre-crear el schema con `CREATE SCHEMA IF NOT EXISTS` en la propia migración, antes de los GRANTs. Las librerías bien diseñadas usan `IF NOT EXISTS` internamente, por lo que pre-crear es seguro e idempotente. Nunca depender de scripts post-arranque manuales para completar permisos de base de datos.
**Source:** https://github.com/timgit/pg-boss (documentación oficial confirma que pg-boss reutiliza schemas existentes)

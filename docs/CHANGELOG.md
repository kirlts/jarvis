# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Planificación de la Fase 2: Documentadas en `MASTER-SPEC.md` y `TODO.md` las tareas de mitigación arquitectónica del MVP (Segregación de Conexiones Lectura/Escritura `[TASK-023]` y Pipeline de Auditoría Automatizada RLS `[TASK-024]`).
- [TASK-022] Ops Console UI/UX Iteration 1: Agrupamiento inteligente de mensajes multimedia contiguos (imágenes, audios, videos, documentos) recibidos en ráfagas del mismo remitente con una separación menor a 5 segundos, presentándose como una única actividad interactiva en el historial de inquilinos.
- [TASK-022] Ops Console UI/UX Iteration 1: Colapsado por defecto del panel multimedia en la vista de detalle de actividades, manteniendo las previsualizaciones y reproductores ocultos inicialmente bajo un diseño sobrio y limpio que requiere de un clic explícito para su despliegue.
- [TASK-022] Ops Console UI/UX Iteration 1: Extracción por lookahead del primer subtítulo/caption de acompañamiento en ráfagas multimedia para mostrar de manera prominente el texto del mensaje (ej. "Isfilsbf") en la cabecera de la actividad, asegurando que la descripción y el contenido textual nunca se pierdan en grupos WhatsApp.
- [TASK-022] Ops Console UI/UX Iteration 1: Generalización del algoritmo de agrupamiento en el timeline, permitiendo consolidar ráfagas de mensajes salientes procesados por la IA (`wapp-send-process`) bajo un único evento en la interfaz.
- [TASK-022] Ops Console UI/UX Iteration 1: Refinamiento de la presentación de textos y transcripciones en la vista de detalle: extracción exhaustiva de todos los captions en un grupo, etiquetado dinámico ("Transcripción de IA (Whisper)" vs "Análisis OCR de IA") y botones de copia individuales altamente resilientes.
- Gobernanza y Aprobación: Eje documental y `/document` actualizados para formalizar que la aprobación visual y operativa de la interfaz de administración (Ops Console) se encuentra activamente "En Progreso" y "Aún no cerca de ser aprobada" a la espera de que el creador (Martín) pruebe e itere empíricamente sobre ella junto con Antigravity IDE.
- [TASK-022] Ops Console UI/UX Iteration 1: Implementada edición en línea del perfil del inquilino ("description" guardado en el jsonb `config`) mediante doble clic sin botones explícitos para maximizar legibilidad.
- Onboarding de WhatsApp con Estado de Carga Visual: Se implementó un estado animado e informativo para la transición `'waiting_qr'` tanto en el listado global de WhatsApp (`whatsapp/list.tsx`) como en la pestaña de detalles de inquilinos (`tenants/detail.tsx`), informando al operador sobre la inicialización asíncrona del socket de Baileys y el aprovisionamiento de credenciales seguras (5-10s).
- Botón "Cancel Request" Simétrico: Añadido el control interactivo y de cancelación reactiva `🚫 Cancel Request` en la pestaña de WhatsApp de detalles de inquilinos para el estado transitorio `'waiting_qr'` o `'qr_pending'`.
- Pruebas de Integración POV Super Admin: Implementada suite de pruebas automatizadas en `src/features/admin/routes.integration.test.js` que valora y aserta end-to-end que el Super Administrador puede previsualizar, descargar y leer payloads de la bandeja de entrada de WhatsApp (`sync_inbox`) tanto en desarrollo local como en producción.

### Changed
- [TASK-022] Alta Densidad y Legibilidad: Modificado el diseño del detalle de Tenant (Ops Console), reemplazando los contenedores gigantes por un layout de dos columnas, forzando tiempos globales al formato militar 24h (`es-CL`), depurando etiquetas innecesarias y sustituyendo los UUIDs ininteligibles por identificadores legibles. El log técnico en JSON se colapsó tras un botón interactivo.
- Flujo de Inicialización de WhatsApp: Se modificó la base de datos y la orquestación del worker en Fastify (`routes.js` y `worker.js`) para establecer instantáneamente el estado de la sesión como `'waiting_qr'` en lugar de `'disconnected'` al crear o reconectar un canal, previniendo falsos badges rojos en la interfaz.

### Fixed
- **Crucial SSE Event Bug**: Corregida función `notify_tenant_activity` en PostgreSQL que omitía los eventos Server-Sent-Events (SSE) para jobs encolados por pg-boss, debido a una validación errónea sobre el nombre físico de la tabla particionada (`job_common` vs `job`). Esto restaura la capacidad de la Ops Console de auto-refrescarse en tiempo real cuando el sistema envía mensajes por WhatsApp.

- [TASK-007] Previsualización Multimedia de Mensajes Duplicados: Corregida la desaparición de la sección desplegable "Multimedia Asociada" para mensajes entrantes duplicados (SHA-256 deduplicados) en el historial de actividades de inquilinos. Ahora el worker de Baileys inserta de manera redundante e idempotente el registro en la tabla `sync_inbox` con el payload y el `s3_url` correcto del archivo ya existente en MinIO, y el componente React en la Ops Console (`tenants/detail.tsx`) realiza una búsqueda fallback local dentro del array `inboxData` para extraer y resolver de forma transparente las URLs pre-firmadas originales del almacenamiento S3.
- Previsualización y descripción del historial de actividades con mensajes multimedia + texto en Ops Console: Corregido el bug por el cual los mensajes multimedia con subtítulo (caption) o texto adjunto (ej. Imagen + Texto) omitían la indicación del tipo de multimedia en el listado de actividades y en la vista detalle de inquilinos (`tenants/detail.tsx`). Se rediseñó el componente de renderizado del detalle para que presente tanto la etiqueta del tipo multimedia (ej. `🖼️ Imagen adjunta`) como el contenido del texto adjunto, y se refinaron las descripciones dinámicas del historial para ambos flujos (`whatsapp` y `operación` / `wapp-lifecycle`) para mostrar de forma explícita composiciones como `📥 Imagen + Texto de [Remitente]`. Corregida la omisión de la columna `payload` en la consulta `GET /admin/inbox` que impedía la extracción de subtítulos/descripciones en la bandeja de entrada. Asimismo, se amplió el ámbito de `textContent` en `src/workers/baileys/worker.js` para persistir la descripción original del mensaje multimedia como propiedad `message` en el payload encolado de pg-boss `sync-inbox-process`, previniendo que se perdiera el texto que acompaña a cualquier tipo de archivo.
- Previsualización de archivos PDF en la Ops Console: Corregida la previsualización de documentos PDF tanto en el panel de detalles del historial de actividades de inquilinos (`tenants/detail.tsx`) como en el navegador de almacenamiento (`storage/list.tsx`). Se reemplazó la integración del visor externo de Google Docs Viewer (`https://docs.google.com/gview`), que fallaba en entornos de desarrollo local y subredes privadas y constituía una fuga de privacidad, por un renderizado de `<iframe>` con el URL directo nativo que utiliza el visor seguro de PDF integrado del propio navegador.
- Visualización y Descarga Multimedia en Ops Console (S3 Host Resolution): Corregido el error de red `ERR_CONNECTION_REFUSED` al previsualizar o descargar audios e imágenes en el detalle de la actividad de los usuarios. Se implementó el helper `resolveExternalUrl` en el backend (`src/features/admin/routes.js`) para reescribir de manera dinámica el hostname de las URLs S3 pre-firmadas generadas (`GET /admin/storage/:id/download-url`, `POST /admin/storage/batch-urls`, y `GET /admin/storage/zip/:jobId/download-url`) de `storage:9000` (interno Docker) a `admin.jarvis.local` o `localhost` según el Host de la solicitud externa, manteniendo el puerto expuesto `9000:9000`.
- [REG-002] Invalidación de Caché de Refine en Tenant Detail: Corregida la ausencia silente de la columna `config` tras guardar la descripción en la interfaz de administración. Se modificó el endpoint `GET /admin/tenants/:id` para que el `SELECT` devuelva el payload completo (con `status` y `config`), alinado arquitectónicamente actualizando el contrato OpenAPI de `Tenant` en `specs/admin-api.yaml` e impidiendo sobrescrituras erróneas.
- [TASK-022] Clasificación de Envío Host vs Recepción en Actividad: Corregida la renderización visual de eventos de Baileys (`whatsapp-message-received`) en el listado de actividades del Ops Console integrando el flag `isFromMe` dentro del `payload` para distinguir mensajes de recepción externa (`📥`) vs sincronización host de envíos salientes (`📤`).
### Added
- [GAP-006] Purga de Trabajos de pg-boss: Implementado endpoint `DELETE /admin/jobs` en el backend para purgar de forma masiva trabajos finalizados (completados, fallidos, cancelados) según su estado, protegido por validación estricta del parámetro `confirm=true`.
- [GAP-006] UI de Purga de Trabajos: Agregada opción interactiva `🗑️ Purge Jobs` en el panel de control de colas de la Ops Console con un modal de confirmación, selector de estado de purga y validación por frase exacta ("PURGE") para prevenir borrados accidentales en producción.
- [GAP-003] Pruebas Unitarias de pg-boss: Creado el archivo `src/workers/boss-worker.test.js` que implementa aserciones completas sobre la cola de tareas `admin-lifecycle` y la eliminación de huérfanos físicos de almacenamiento.
- [GAP-002] Detección de Multiplexación: Agregada prueba unitaria en `src/workers/boss-worker.test.js` que simula la pérdida de cierres consultivos en PgBouncer (modo transacción) y verifica la interrupción fatal del worker.
- [GAP-005] Integración de Linter de Base de Datos pre-test: Creado `scripts/pre_test_lint.js` que automatiza la ejecución de `atlas migrate lint` en pre-test, aislando y advirtiendo elegantemente ante restricciones de Atlas Pro.
- [GAP-003] Eliminación Física de Almacenamiento: Implementado el consumidor de la cola de eventos `admin-lifecycle` en `src/workers/boss-worker.js` para purgar físicamente de MinIO/S3 todos los archivos de almacenamiento de tenants soft-deleted, erradicando objetos huérfanos.

### Changed
- Arquitectura de pruebas del Worker de pg-boss: Refactorizado `src/workers/boss-worker.js` para exportar sus manejadores internos (`handleSyncJob`, `handleAdminLifecycleJob`, pools de conexiones) y conditionalizar la ejecución del método `start()`, permitiendo testing aislado limpio y previniendo el inicio asíncrono descontrolado de colas de fondo.
- Pipeline global de ejecución de pruebas: Modificado el script de pruebas principal (`"test"`) en `package.json` para encadenar secuencialmente la validación del linter de base de datos Atlas (`pre_test_lint.js`) y correr explícitamente los 8 archivos de test deterministas del proyecto.

### Fixed
- [UD-026] Falso Positivo en Detección de Multiplexación de Conexiones: Corregida la lógica del pre-flight check de `src/workers/boss-worker.js` para mantener el primer cliente conectado mientras se consulta el segundo, impidiendo que el pool de base de datos reutilice el mismo socket físico y devuelva falsos positivos al arrancar en limpio.
- [UD-027] Desconexión de Stream de WhatsApp (SSE) y Heartbeat: Reducido el intervalo de latidos (`heartbeatInterval`) en `src/features/admin/routes.js` de 30s a 10s para mantener vivas las conexiones TCP ante el idle timeout de inactividad de 20s de Caddy y navegadores, resolviendo el congelamiento visual de la interfaz.
- [UD-028] Serialización Estricta de Fastify y SSE: Corregido el error 400 Bad Request en la reconexión enviando `body: JSON.stringify({})` en React. Además, se eliminó `return reply;` tras `reply.hijack()` en el endpoint de SSE para evitar que Fastify intente resolver la promesa y cierre prematuramente el socket TCP subyacente.
- [UD-029] Bloqueo de Conexiones PostgreSQL en Baileys: Refactorizado el sistema `usePgAuthState` en `auth-state.js` para encolar secuencialmente (debounce) el guardado de credenciales, impidiendo el colapso del pool de base de datos que congelaba el handshake de WhatsApp en "Iniciando sesión...".
- Bloqueo de CORS y Cierre del Stream de WhatsApp (SSE): Corregidos el bloqueo de CORS y las desconexiones tempranas (`ERR_INCOMPLETE_CHUNKED_ENCODING` / `unexpected EOF` en proxy) del endpoint de Server-Sent Events `/admin/whatsapp/status/stream` al inyectar cabeceras CORS de forma manual y llamar formalmente a `reply.hijack()` para que Fastify no finalice ni cierre el socket TCP de forma automática tras resolver el handler asíncrono.
- Telemetría de Refine: Deshabilitado el envío de telemetría de Refine (`disableTelemetry: true` en las opciones de `<Refine>`) para resolver el error recurrente `net::ERR_CONNECTION_CLOSED` en la consola de desarrollo del navegador al intentar comunicarse con `telemetry.refine.dev`.
- Restricción de base de datos de WhatsApp: Corregida la restricción `wapp_sessions_status_check` mediante la migración `018_wapp_sessions_status_constraint.sql` para admitir los nuevos estados transitorios de sesión `'waiting_qr'`, `'qr_expired'` y `'connecting'`, resolviendo los bloqueos transaccionales e interrupciones del worker al inicializar o expirar códigos QR.
- [GAP-004] Mock de Conexión de Base de Datos en Baileys: Se corrigió `src/workers/baileys/worker.test.js` mediante la inyección de un mock de `pool.connect` in `beforeEach`, lo cual evita intentos de conexión de red reales y garantiza estabilidad offline absoluta en la suite de tests de filtrado JID/LID.
- [GAP-002] Cierre en pre-flight checks: Se insertaron sentencias de retorno explícitas tras llamadas fatales a `process.exit(1)` en los catch blocks de inicialización de `boss-worker.js` para detener la secuencia de ejecución de inmediato en tests.

- [REG-001] Regression Integration Test: Added test in `src/features/admin/routes.integration.test.js` asserting that `GET /admin/dashboard/summary` strictly filters out soft-deleted wapp_sessions.
- WhatsApp Worker Unit & Integration Tests: Created comprehensive unit tests in `src/workers/baileys/worker.test.js` covering stream restart status handling (515), session startup/shutdown lifecycles, and database connectivity events.
- Stress Test Scenarios (ST-004 to ST-009): Created Node.js and K6 scripts in `scripts/stress/` representing all empirical stress scenarios outlined in TEST.md: `st-004.js` (500 VU K6 connection pooling check), `st-005.js` (25MB buffer presigned URL OOM boundary check), `st-006.js` (S3 multipart upload abort cleanup check), `st-007.js` (50 concurrent 1MB uploads to MinIO), `st-008.js` (Fastify resilience during MinIO outage), and `st-009.js` (pg-boss maintenance and job archiving check).
- Mock pgboss schema provisioning: Added mock schema and `pgboss.job` database table (with `data jsonb` column) to the integration tests initialization block to prevent cascade soft-delete triggers from failing with column errors.
- Integración relacional y descripciones dinámicas en la cola de trabajos pg-boss: El listado y modal de detalles de trabajos en la Ops Console ahora muestra hipervínculos navegables al Tenant correspondiente, soportando tanto `tenant_id` como `tenantId` en la base de datos de Fastify y resolviendo las descripciones de los jobs dinámicamente según la acción ejecutada y sus parámetros específicos.
- Cobertura de pruebas unitarias al 100%: Se completaron y corrigieron todos los mocks de entorno para el framework de tests del frontend en Vitest, garantizando que el 100% de las pruebas unitarias pasen limpiamente de forma determinista.
- Migración `015_cascade_tenant_soft_delete.sql` que implementa un disparador PostgreSQL (`trg_tenants_cascade_soft_delete`) para desactivar automáticamente las sesiones de WhatsApp (`wapp_sessions`), solicitar la detención del worker de Baileys (`action_pending = 'disconnect'`), cancelar los trabajos de cola activos (`pgboss.job`) y marcar como eliminados los metadatos de almacenamiento (`storage_objects`) cuando un Tenant es soft-deleted, eliminando por completo las sesiones huérfanas en el sistema (zombies).
- Arquitectura de Worker Dinámica en el Sandbox Local: Refactorización completa de `src/workers/baileys/worker.js` para operar como un orquestador multi-tenant dinámico en tiempo real. Elimina la limitación monotenant de variables de entorno estáticas en el Docker Compose. El worker ahora sincroniza dinámicamente cada 3s contra la tabla `wapp_sessions`, detectando nuevos tenants e inicializando/reiniciando sockets en paralelo de forma completamente transparente.
- Migración `016_harden_rls_deleted_tenants.sql` que endurece las políticas RLS a nivel de base de datos (`tenants`, `sync_inbox`, `wapp_sessions`, `wapp_incoming`, `storage_objects`) para bloquear cualquier consulta o inserción si el Tenant asociado tiene el campo `deleted_at` no nulo.
- Endpoints del Sync Inbox Monitor (`GET /admin/inbox`, `GET /admin/inbox/:id`, y `POST /admin/inbox/:id/reprocess`) con JSON Schema, control de UUIDv7 y log de auditoría (Domain E, TASK-020).
- Vista del Sync Inbox Monitor (`pages/inbox/list.tsx`) con métricas de backlog, tabla paginada de eventos, modal visor de JSON y gatillo de reprocesamiento (E.1, E.2, E.4, E.5), junto a la acción `⏪ Rollback & Replay` para re-ejecutar eventos exitosos (UD-012).
- Endpoint para la generación de tokens de API de Tenants (`POST /admin/tenants/:id/token`) firmado criptográficamente con HS256 y TTL configurable (Domain K, TASK-020).
- Formulario de configuración de TTL de tokens y modal de generación con clipboard copy seguro en la pestaña de configuración del tenant (`pages/tenants/detail.tsx`) (K.1, K.3), así como la integración completa del ciclo de onboarding y vinculación de WhatsApp directamente desde una nueva pestaña interactiva con auto-refresh de 3s (UD-012).
- Botón de exportación de historial de trabajos a CSV (`📥 Export CSV`) en `pages/jobs/list.tsx` que descarga el listado paginado y filtrado en el cliente (I.2).
- Consulta LogQL `{job="jarvis"} |= "error"` integrada dinámicamente en el dashboard card de errores recientes (`pages/dashboard/index.tsx`) para visualización de fallos reales de Loki (A.7).
- Decisión [UD-011] y [UD-012] documentadas en USER-DECISIONS.md sobre la implementación final y flujo Zero-CLI de la Ops Console.
- Enrutamiento robusto con comodín de redirección en `App.tsx` para evitar pantallas en blanco de carga infinita (UD-012).
- Inventario exhaustivo de 51 features para la Ops Console (`docs/ops_console_feature_inventory.md`) con criterios de aceptación visual por feature y 16 mandatos globales de diseño (UD-010, TASK-020).
- PRD archivado en `docs/archive/PRD-Constitucion.md`. Contenido vigente integrado en MASTER-SPEC.

### Fixed
- Error de autenticación `401 Unauthorized` sistémico en múltiples páginas de la Ops Console (`inbox/list.tsx`, `config/list.tsx`, `tokens/list.tsx`, `whatsapp/list.tsx`, `tenants/list.tsx`, `tenants/detail.tsx`) debido al uso inconsistente de claves de recuperación de tokens en `sessionStorage` (`admin_token` vs `jarvis_admin_token`) y la ausencia del prefijo `API_URL` en las rutas. Estandarizado el 100% de llamadas manuales `fetch` para consumir el helper centralizado `getAuthHeader()` de `auth.ts`, resolviendo el ciclo completo de onboarding de WhatsApp sin intervenciones manuales (Zero-CLI) de forma robusta.enciones manuales (Zero-CLI) de forma robusta.
- Resuelto el bug en la Ops Console que provocaba que la vista de monitoreo de trabajos de pg-boss mostrara un skeleton de carga de forma infinita y 0 trabajos cargados debido a un error FST_ERR_VALIDATION (HTTP 400 Bad Request). Se incorporó el parámetro `page` en el esquema de validación querystring del endpoint `GET /admin/jobs` del backend y se implementó paginación estándar completa utilizando `LIMIT` y `OFFSET` a nivel de base de datos.


- Implementación del test suite para el frontend (Ops Console) utilizando Vitest y React Testing Library. Validando estados de carga, manejo de errores, renderizado vacío, mutaciones e interacciones (TEST.md, TASK-018).
- Empirical verification of resilience and security tests including session persistence, automatic retries with backoff, offline forms, API degradation fallback, and Caddy SPA proxy fallback (TASK-018).
- Caddy Edge Proxy routing (`admin.jarvis.local`) for Ops Console SPA con SPA fallback (`try_files` behavior) y estrictos security headers (`X-Frame-Options: SAMEORIGIN`, `HSTS`). Catch-all block rechaza subdominios no configurados con 404 (TASK-017).
- `VITE_API_URL` runtime resolution pointing to `http://api.jarvis.local` inside `docker-compose.yml` for correct browser-to-API communication across Caddy (TASK-017).
- Design system (`App.css`): OKLCH color palette, Minor Third (1.2) fluid typography via `clamp()`, 4px base unit spacing, dark admin surface hierarchy, focus-visible rings, modal animations, scrollbar styling (TASK-016).
- Sidebar layout (`components/layout`): sticky sidebar with brand, navigation via `useMenu()`, user identity display from `authProvider.getIdentity()`, logout button (TASK-016).
- Tenant list view (`pages/tenants/list.tsx`): paginated data table with ID/name/created columns, "New Tenant" action, inline delete button with confirmation modal (OPER.IN.01). DELETE includes `?confirm=true` query param (AAPI.FN.04) (TASK-016).
- Tenant create view (`pages/tenants/create.tsx`): single-field form with validation, error display, and auto-navigation back to list on success with cache invalidation (TASK-016).
- Jobs monitoring view (`pages/jobs/list.tsx`): pg-boss job table with state filter buttons (All/Active/Completed/Failed), color-coded status badges, truncated UUIDs (TASK-016).
- WhatsApp status view (`pages/whatsapp/list.tsx`): Baileys connection table with tenant ID, status badge (connected/disconnected/connecting), and timestamp (TASK-016).
- `dataProvider` personalizado (`ops-console/src/providers/data.ts`): traduce operaciones CRUD de Refine al contrato del Admin API (`specs/admin-api.yaml` v0.2.0) con inyeccion automatica de `Authorization: Bearer` y mapeo de paginacion (`currentPage/pageSize` a `page/limit`) (TASK-015).
- `authProvider` (`ops-console/src/providers/auth.ts`): ciclo completo login/logout/check/getIdentity/getPermissions/onError con JWT RS256. Token almacenado en `sessionStorage` (no `localStorage`) para limitar exposicion XSS. Validacion client-side de algoritmo RS256 y expiracion con buffer de 30s (TASK-015).
- Pagina de login Phase 1 (`ops-console/src/pages/login.tsx`): acepta JWT pre-firmado RS256 via textarea. Sera reemplazada por flujo OAuth2/OIDC en Phase 2 (TASK-015).
- Routing protegido en `App.tsx`: wrapper `Authenticated` con fallback a `/login`, recursos declarados (`tenants`, `jobs`, `whatsapp`) con rutas CRUD, placeholders para vistas (TASK-016) (TASK-015).
- Proyecto Refine v5 (Vite 6 + React 19 + TypeScript 5.8) inicializado en `ops-console/` con data provider REST headless y sin UI framework preset (TASK-011).
- Dockerfile multi-stage para `ops-console/`: Node 24 Alpine (build) + Nginx 1.27 Alpine (serve) con SPA fallback, cache de activos estáticos, y security headers.
- Configuración Nginx (`ops-console/nginx.conf`) con `try_files` para SPA routing, cache inmutable para activos hasheados, y headers de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- Servicio `ops-console` en `docker-compose.yml`: build contextual, `VITE_API_URL` como build arg, healthcheck, restart policy, sin volúmenes persistentes (CSPA.IN.02).
- Caddy configurado como dependencia del servicio `ops-console` para routing `admin.jarvis.local`.
- Directorio `infrastructure/observability/grafana/provisioning/dashboards/` y `plugins/` con archivos de provisionamiento vacios para eliminar errores de Grafana al arranque.
- Garantias de mantencion futura de Specmatic documentadas en TEST.md (OpenAPI Spec Requirements) y MASTER-SPEC.md (§6).
- Separación estricta de `test:unit` y `test` en `package.json` para aislar pruebas con mock de pruebas con Testcontainers.
- Suite exhaustiva de pruebas unitarias para `src/features/admin/routes.js` y `src/features/sync-inbox/routes.js` utilizando el Node.js test runner nativo y simulaciones en memoria.
- Scripts de validación de estrés empírico (`scripts/stress/st-001.js`, `st-002.js`, `st-003.js`) usando K6 y `net.Socket`.
- Matriz de verificación expandida de 140 a 185 checks: 5 actores nuevos para Ops Console (OPER, AAPI, CSPA, REFN, CDDY) con 57 checks atómicos derivados via `/derive`.
- TODO.md expandido con 4 tasks nuevas (TASK-015 a TASK-018) y TASK-011 reescrita: dataProvider/authProvider, vistas, containerización Docker+Caddy, y resiliencia/seguridad.
- Archivo de checks OPSUI archivados en `docs/archive/checks_OPSUI_2026-04-27.md` con referencia a UD-007.
- TASK-019 en TODO.md: expansión del Admin API (POST /admin/tenants, PATCH /admin/tenants/:id, GET /admin/tenants/:id, paginación, filtros) con 18 checks atómicos de testing robusto (happy path + seguridad + concurrencia + edge cases).
- Sección ADMIN completa materializada en VERIFICATION.md: 14 checks verificados (TASK-010) + 18 nuevos pendientes (TASK-019) = 32 checks totales.
- Tabla de endpoints del Admin API en MASTER-SPEC §6 con estados de implementación.
- UD-008 en USER-DECISIONS.md: expansión del contrato API antes de construir frontend.
- Migración `009_tenant_unique_name.sql`: índice único parcial en `tenants.name WHERE deleted_at IS NULL` para permitir recreación de tenants soft-deleted sin conflictos de nombre.
- Suite de integración Admin API con Testcontainers: 12 tests contra PG 17 real validando triggers, soft-delete, unique constraints, y BYPASSRLS.
- Suite de property-based testing Admin API con fast-check: 7 tests (~4000 iteraciones) validando UUID regex, paginación, SQL injection prevention.
- Script de stress K6 `scripts/stress/st-010-admin-crud.js` para carga Admin API bajo 50 VUs.
- Runner de contract testing Specmatic para Admin API (`scripts/run-admin-contract-tests.js`): 24/24 scenarios pasando.

### Changed
- Desacoplamiento de sesiones de WhatsApp: Eliminado el bucle de polling de base de datos de 3 segundos en el worker de Baileys, convirtiendo el sistema en 100% reactivo y orientado a eventos mediante la cola `wapp-session-control` de pg-boss.
- Eliminación y desconexión síncrona/asíncrona de WhatsApp: El endpoint `DELETE /admin/whatsapp/status/:tenant_id` ahora marca de forma estrictamente síncrona la sesión como eliminada (`deleted_at = now()`), borrando credenciales y estado en la base de datos de Fastify de forma inmediata para una UX sin lag, despachando luego la desconexión del socket de forma asíncrona al worker de Baileys vía pg-boss.
- Migracion `008_admin_role.sql` reescrita: pre-crea el schema `pgboss` via `CREATE SCHEMA IF NOT EXISTS` para eliminar la dependencia temporal con el arranque del worker. pg-boss reutiliza el schema existente sin conflicto.
- Regla de alerta Grafana (`fastify_high_errors`) corregida: expresion `$B > 5` (Grafana 11 math syntax) reemplaza la estructura legacy con `conditions` que causaba `non existent function B` en loop.
- Terminologia "Pattern C" reemplazada por "Arquitectura Desacoplada" en todo el eje documental (MASTER-SPEC, USER-DECISIONS).
- Configuración de Stryker (`stryker.config.json`) ajustada para correr exclusivamente contra `npm run test:unit`, previniendo colapso de RAM por instanciación concurrente masiva de contenedores PostgreSQL.
- Especificación OpenAPI (`specs/tenant-api.yaml`) estrictamente sincronizada con la implementación real de Fastify (restricción explícita de UUIDv7, `minProperties: 1`, y corrección del objeto de respuesta HTTP 202).
- TASK-011 en TODO.md: de monolito OPSUI (Appsmith) a Refine Project Initialization con checks REFN/CSPA.
- VERIFICATION.md: Actor OPSUI archivado y reemplazado por 5 actores granulares de la Ops Console Refine. Referencia a `admin.jarvis.local` en CADDY.AV.03 actualizada de Appsmith a contenedor SPA.
- Clasificación de verificabilidad: 9 checks reclasificados de HUM/MIX a LLM tras validar que el framework de testing de Jarvis cubre su automatización completa.
- Matriz de verificación total expandida de 185 a 203 checks (18 nuevos checks ADMIN para endpoints expandidos).
- Secuencia de ejecución actualizada: TASK-019 (API) bloquea TASK-015 (dataProvider) y TASK-016 (vistas).
- Migracion de `ghcr.io/supabase/postgres:17.6.1.093` a `postgres:17-alpine` por incompatibilidad de rol `supabase_admin`.
- pg-boss ahora conecta directamente a PG (:5432), no a traves de PgBouncer (:6543).
- PgBouncer configurado con `AUTH_TYPE=scram-sha-256` para compatibilidad con PG 17.
- MinIO de source build a imagen comunitaria `ghcr.io/coollabsio/minio` por falta de acceso a proxy.golang.org en Docker.
- Baileys worker: `syncFullHistory: false`, `markOnlineOnConnect: false`, dummy `getMessage` resolver para prevenir timeouts.
- Filtro de mensajes entrantes: de inclusion (`@s.whatsapp.net`) a exclusion (`@g.us`, `@broadcast`, `@newsletter`) para soportar LID.
- `specs/admin-api.yaml` actualizado a v0.2.0: endpoints CRUD completos, paginación, filtros, `confirm` parameter corregido de `type: boolean` a `type: string enum: ['true']`.
- TEST.md: E2E Policy actualizada (referencia Appsmith eliminada), Coverage Metrics actualizadas con valores reales, OpenAPI Spec Requirements marcadas como creadas.

### Fixed
- Corregida discrepancia de métricas en el Dashboard (`GET /admin/dashboard/summary`): La consulta de agregación para el conteo de estados de WhatsApp incluía erróneamente sesiones inactivas o eliminadas lógicamente. Se añadió el filtro `WHERE deleted_at IS NULL` para alinear las métricas globales del Dashboard con el estado real de la lista de canales de WhatsApp.
- Reparado el flujo de reprocesamiento de Inbox (`POST /admin/inbox/:id/reprocess`): Corregido el bug de acoplamiento que únicamente actualizaba el estado en la base de datos a `'pending'` pero omitía publicar el job en pg-boss. Ahora encola correctamente el job `sync-inbox-process` con su payload para que el worker reactivo procese el reintento de inmediato.
- Resuelta la laguna de diseño que mantenía activas sesiones de WhatsApp de Tenants eliminados suaves, realizando un barrido de backfill retroactivo para de-aprovisionar y detener los procesos de workers asociados.
- Migracion `008_admin_role.sql` fallaba con `ERROR: schema "pgboss" does not exist` en arranques limpios (`docker compose down -v`), dejando a `jarvis_admin` sin acceso al schema de pg-boss y rompiendo `GET /admin/jobs`.
- Regla de alerta de Grafana generaba error `Failed to build rule evaluator: non existent function B` cada 60 segundos por sintaxis incompatible con Grafana 11.
- Grafana emitia errores `open /etc/grafana/provisioning/dashboards: no such file or directory` por ausencia de directorios de provisionamiento.
- Falso negativo en pruebas de contrato Specmatic originado por deriva documental entre la especificación OpenAPI y el validador estricto de Fastify (ajv).
- Timeouts masivos en Stryker provocados por la ejecución concurrente (20+ hilos) del runner de Testcontainers.
- DELETE /admin/tenants/:id ejecutaba `DELETE FROM tenants` (bloqueado por trigger `prevent_hard_delete`): corregido a `UPDATE SET deleted_at = now()` (soft-delete).
- GET /admin/tenants mezclaba tenants activos con soft-deleted: corregido con `WHERE deleted_at IS NULL`.
- PATCH /admin/tenants/:id permitía modificar tenants soft-deleted: corregido con `AND deleted_at IS NULL` en UPDATE.
- DELETE /admin/tenants/:id faltaba `additionalProperties: false` en querystring schema (HP-004).
- DELETE /admin/tenants/:id no validaba formato UUID en `:id` (inconsistente con GET/PATCH).
- Corregida race condition asíncrona en el handshake de Baileys que provocaba carga infinita ("Iniciando sesión...") en WhatsApp Web, implementando un Batching Mutex Lock sin delays en PostgreSQL y fusionando manualmente los objetos parciales de identidad (`creds.update`) antes de reiniciar el stream (evento `515`).
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

### Removed
- Actor OPSUI (Appsmith) de VERIFICATION.md: 12 checks archivados por decisión arquitectónica UD-007. Reemplazado por 57 checks distribuidos en 5 actores de la Ops Console Refine.

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

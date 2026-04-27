# VERIFICATION: Jarvis v0.1.0

> Canonical truth for all formal promise verifications and testing boundaries.
> Generated and maintained exclusively by the `/derive` algorithm.

## Kairós Symbol Legend

| Symbol | Meaning |
|---|---|
| 🤖 `.LLM` | Verifiable by AI/automated tool |
| 🧑 `.HUM` | Requires human verification |
| 🤖🧑 `.MIX` | Pre-verifiable by AI, final human validation |
| ✅ | Implemented and verified |
| 🔲 | Pending |

---

<!--
Taxonomy: [ACTOR.CATEGORY.NN.VER]
Actors: Defined by /derive according to the project
Categories: AV (Availability), FN (Functionality), CR (Correctness), IN (Integrity), RS (Resilience)
Verifier (VER): LLM (automatable), HUM (requires human), MIX (pre-verifiable + human)

Check format:
  🧑 `[ACTOR.CAT.NN.HUM]` Action -> Result. *(Validated promise)*
  🤖 `[ACTOR.CAT.NN.LLM]` Action -> Result. *(Validated promise)*
  🤖🧑 `[ACTOR.CAT.NN.MIX]` Action -> Result. *(Validated promise)*

Implementation format (with mandatory timestamp):
  ✅ Implemented (🤖 Verified by [tool]; YYYY-MM-DD HH:MM)
  ✅ Implemented (🧑 Confirmed by user; YYYY-MM-DD HH:MM)
  ✅ Implemented (🤖🧑 Pre-verified by [tool], confirmed by user; YYYY-MM-DD HH:MM)
-->

## Phase 1: Local Sandbox Validation

## Abbreviation Key
| Full Name | Abbreviation | Type |
|---|---|---|
| HTTP Client / Sincronizador | CLNT | Actor |
| Fastify HTTP Core | CORE | Actor |
| pg-boss Worker | BOSS | Actor |
| WhatsApp Baileys Worker | WAPP | Actor |
| PostgreSQL RLS | DB | Actor |
| Supabase Storage Emulator (MinIO) | STOR | Actor |
| Caddy (Edge Proxy) | CADDY | Actor |
| Admin API (Fastify /admin/*) | ADMIN | Actor |
| Operador Ops Console (Superadmin) | OPER | Actor |
| Admin API Ops Console (Fastify) | AAPI | Actor |
| Contenedor SPA Ops Console (Docker/Nginx) | CSPA | Actor |
| Refine Framework Ops Console | REFN | Actor |
| Caddy Proxy Ops Console | CDDY | Actor |
| Observabilidad (Loki + Grafana + Uptime Kuma) | OBSRV | Actor |
| Testing Infrastructure | TINFR | Actor |
| Availability | AV | Category |
| Functionality | FN | Category |
| Correctness | CR | Category |
| Integrity | IN | Category |
| Resilience | RS | Category |
| Verifiable by automated tool | LLM | Verifier |
| Requires human verification | HUM | Verifier |
| Pre-verifiable by AI, final human validation | MIX | Verifier |

## CLNT (HTTP Client / Sincronizador)
- ✅ 🤖 `[CLNT.AV.01.LLM]` Script envía payload a Inbox → Endpoint responde al socket TCP. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.AV.02.LLM]` Enviar un payload JSON válido → Se recibe HTTP 202 en <50ms. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.FN.01.LLM]` Enviar UUIDv7 en payload → Respuesta 202, registro aparece en DB con ese UUID exacto. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.FN.02.LLM]` Enviar UUIDv4 o incremental → Respuesta HTTP 400 Bad Request. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.FN.03.LLM]` Solicitar URL presignada → El cliente recibe un token temporal S3 válido. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[CLNT.CR.01.LLM]` Enviar JSON malformado a Inbox → Respuesta HTTP 400 Strict. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.CR.03.LLM]` Enviar payload JSON con campos inyectados no definidos en el Schema → Fastify arroja HTTP 400 por validación estricta (no-additional-properties). *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.IN.01.LLM]` Enviar mismo UUIDv7 dos veces → Segunda inserción es idempotente y no crea duplicados relacionales. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.IN.02.LLM]` Interrumpir la conexión HTTP TCP a la mitad del envío del payload → El servidor descarta el frame, sin corromper la BD. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.RS.01.LLM]` Enviar 100 requests por segundo → Servidor responde con HTTP 429 Too Many Requests (Rate Limiter). *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CLNT.RS.02.LLM]` Solicitar datos con JWT de tenant A pero resource_id de tenant B → Servidor responde 403 o 404. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[CLNT.RS.03.LLM]` Enviar secuencias nulas/Unicode corrupto en texto libre → Schema validation rechaza con HTTP 400 antes de tocar BD. *(🤖 Verified by tool; 2026-04-26 11:51)*

## CORE (Fastify HTTP Core)
- ✅ 🤖 `[CORE.CR.01.LLM]` Bajar contenedor de PostgreSQL y arrancar Fastify → Fastify arranca con log preventivo sin crashear en bucle (Testcontainers). *(🤖 Verified by tool; 2026-04-26 10:42)*
- ✅ 🤖 `[CORE.RS.02.LLM]` Matar y reiniciar contenedor PostgreSQL mientras Fastify corre → Fastify restablece el pool de conexiones (Testcontainers). *(🤖 Verified by tool; 2026-04-26 10:42)*
- ✅ 🤖 `[CORE.AV.01.LLM]` Hacer ping a la ruta `/health` local → Respuesta HTTP 200/OK. *(🤖 Verified by tool; 2026-04-26 10:42)*
- ✅ 🤖 `[CORE.AV.02.LLM]` Ejecutar simulación de carga sostenida → El lag del event loop medido es <50ms. *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[CORE.FN.01.LLM]` Enviar payload incompleto (falta schema obligatorio) → Fastify rechaza de inmediato (logs DB vacíos). *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.FN.02.LLM]` Consultar tabla `sync_inbox` en PG tras HTTP 202 → El JSON de payload crudo existe. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.FN.03.LLM]` Enviar request con JWT estructuralmente correcto pero expirado → Respuesta 401 Unauthorized sin latencia de BD. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.CR.02.LLM]` Inspeccionar headers HTTP al sincronizar → Content-Type explícito y status de respuesta es estrictamente 202. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.IN.01.LLM]` Escanear código fuente Fastify → Imposibilidad de estado global (ej. `let session = {}`). *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.IN.02.LLM]` Hacer request anónimo a endpoint de inbox → Fastify rechaza con HTTP 401 Unauthorized. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.IN.03.LLM]` Inyectar excepción interna provocada (mock) → Fastify no filtra el stack trace al cliente en entorno de producción. *(🤖 Verified by tool; 2026-04-26 11:51)*
- ✅ 🤖 `[CORE.RS.01.LLM]` Enviar payload gigantesco de 50MB → Respuesta 413 Payload Too Large; memoria del worker Node permanece estable. *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[CORE.RS.03.LLM]` Sostener 50 conexiones TCP Keep-Alive sin enviar datos (Slowloris) → Fastify las dropea tras el timeout configurado. *(🤖 Verified by tool; 2026-04-27 01:50)*

## BOSS (pg-boss Worker)
- ✅ 🤖 `[BOSS.FN.01.LLM]` Llenar Inbox con 10,000 registros simultáneos (K6) → El worker de pg-boss los consume a ritmo acotado (rate-limit interno). *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.AV.01.LLM]` Inspeccionar contenedor `boss-worker` → Se ejecuta en su propio proceso Node, no anidado en los hilos de Fastify. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.FN.02.LLM]` Inyectar job y leer output estructurado (Pino) → El log certifica extracción del `tenant_id` del payload crudo. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.FN.03.LLM]` Extraer pg_stat_statements tras consumo → Se confirma patrón `SET LOCAL request.jwt.claims` forzando contexto. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.CR.01.LLM]` Insertar UUIDv7 cronológicamente desordenados → Las lógicas de negocio insertan respetando idempotencia temporal (no overwrite newer). *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.CR.02.LLM]` Lanzar excepción en handler de job → La tarea se visualiza en estado `retry` con backoff en `pg-boss.job`. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.CR.03.LLM]` Levantar dos contenedores BOSS idénticos → El lock `SELECT FOR UPDATE SKIP LOCKED` previene que procesen el mismo job. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.IN.01.LLM]` Abortar handler (throw error) en medio de transacciones relacionales → Rollback transaccional estricto (0 inserts relacionales). *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.IN.02.LLM]` Auditar string de conexion de BOSS; debe apuntar directamente a PostgreSQL (puerto 5432), no al pooler (6543). Advisory locks requieren continuidad de sesion. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.IN.03.LLM]` Reiniciar abruptamente contenedor PostgreSQL → Worker de pg-boss emite errores pero reconecta la subscripción de eventos exitosamente. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.RS.01.LLM]` Inyectar job con estructura inesperada que cause TypeError → Ese job falla de forma aislada; el ciclo de pg-boss no se interrumpe. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.RS.02.LLM]` Forzar N reintentos consecutivos → Al llegar al límite configurado, pg-boss mueve permanentemente a tabla `archived` o status `failed`. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[BOSS.RS.03.LLM]` Medir conexiones activas de BOSS bajo carga → El pool del worker respeta el límite superior (`max: 10`) sin agotar PostgreSQL. *(🤖 Verified by tool; 2026-04-26 10:52)*

## WAPP (WhatsApp Baileys Worker)
- ✅ 🤖 `[WAPP.FN.02.LLM]` Reiniciar contenedor WAPP orquestado → Autenticación Baileys levanta la sesión deserializada desde Postgres sin QR. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🧑 `[WAPP.CR.01.HUM]` Enviar un mensaje de texto desde celular externo → Mensaje se registra en tabla `wapp_incoming` asociado al tenant. *(🧑 Confirmed by user; 2026-04-26 20:28)*
- ✅ 🧑 `[WAPP.CR.02.HUM]` Escribir tarea de mensaje saliente en pg-boss → Teléfono celular externo recibe la notificación visualmente. *(🧑 Confirmed by user; 2026-04-26 20:28)*
- ✅ 🤖 `[WAPP.RS.01.LLM]` Simular caída red local Docker → Baileys WebSocket emite `connection.update: close` y planifica reconexión progresiva. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.RS.02.LLM]` Inyectar instrucción de enviar archivo de 1GB en cola PG → Baileys emite advertencia o falla el mensaje aislado, pero no crashea el proceso. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🧑 `[WAPP.RS.03.HUM]` Desvincular dispositivo remoto en el app móvil original → El worker lee evento de deslogueo y muta tabla `wapp_status` a `disconnected`. *(🧑 Confirmed by user; 2026-04-26 20:30)*
- ✅ 🤖🧑 `[WAPP.FN.01.MIX]` Escanear código QR inicial → PostgreSQL columna JSONB de credenciales Baileys se rellena correctamente. *(🤖🧑 Pre-verified by tool, confirmed by user; 2026-04-26 20:28)*
- ✅ 🤖 `[WAPP.IN.01.LLM]` Inyectar ráfaga de 1,000 eventos `messages.upsert` → Fastify mantiene rendimiento intacto gracias a orquestación desacoplada. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.AV.01.LLM]` Confirmar red Docker Compose → Existe contenedor de servicio discreto dedicado exclusivamente a lógicas de Sock. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.IN.02.LLM]` Borrar volumen efimero de contenedor WAPP, verificar que la sesion no se corrompe gracias al storage `usePgAuthState` persistido en PostgreSQL JSONB. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.CR.03.LLM]` Recibir mensaje entrante de número malformado o grupo no-admitido → Worker lo descarta silente en base a lógicas, sin saturar PG. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.IN.03.LLM]` Monitoreo Docker stats en WAPP 24h → Curva de RAM permanece <512MB previniendo Node OOM en encripciones masivas de Baileys. *(🤖 Verified by tool; 2026-04-26 11:37)*
- ✅ 🤖 `[WAPP.RS.04.LLM]` Provocar rate-limit WhatsApp (spam de mensajes simulado) → Worker Baileys lee el error y retrasa la cola con backoff dinámico sin banear socket permanentemente. *(🤖 Verified by tool; 2026-04-26 11:37)*

## DB (PostgreSQL RLS)
- ✅ 🤖 `[DB.RS.02.LLM]` Estrés K6 de 1000 iteraciones/segundo sobre transacciones completas → RAM/CPU del contenedor PostgreSQL no supera umbral configurado de sandbox. *(🤖 Verified by tool; 2026-04-26 10:52)*
- ✅ 🤖 `[DB.AV.01.LLM]` Comando psql interactivo (ping) → Aceptación inmediata en protocolo libpq. *(🤖 Verified by tool; 2026-04-26 10:42)*
- ✅ 🤖 `[DB.FN.01.LLM]` Intento malicioso de SELECT desde worker con `request.jwt.claims` forjado → Bloqueo matemático estricto por política RLS `tenant_id = current_setting`. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.FN.02.LLM]` Inyección de JSONB > 10MB en tabla transaccional → Base de datos o proxy de PG lanza restricción para obligar el desvío a Storage. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.CR.01.LLM]` Linter `sqlcheck` sobre schema operativo → Tablas operativas poseen constraints estrcitos de `ENABLE ROW LEVEL SECURITY`. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.CR.02.LLM]` Test de 500 conexiones Fastify concurrentes → PgBouncer (Supavisor) las condensa eficientemente en <50 conexiones libpq nativas reales. *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[DB.IN.01.LLM]` Crear registro operativo apuntando a `tenant_id` fantasma → Falla Foreign Key / Violación referencial. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.AV.02.LLM]` Instalar Atlas CLI y ejecutar `atlas version` contra el sandbox → Binario funcional, conecta a PostgreSQL 17 local. *(🤖 Verified by tool; 2026-04-26 21:55)*
- ✅ 🤖 `[DB.IN.02.LLM]` Validar pipeline Atlas CI (o equivalente local) → Exige verificación de migraciones sin caídas abruptas (código `DROP COLUMN` rechazado). *(🤖 Verified by tool; 2026-04-26 21:55)*
- ✅ 🤖 `[DB.RS.01.LLM]` Intentar un `CREATE INDEX` síncrono sobre tabla masiva -> Linter lo rechaza, exigiendo `CONCURRENTLY`. *(🤖 Verified by tool; 2026-04-26 21:55)*
- ✅ 🤖 `[DB.RS.03.LLM]` Inyección SQL clásica en variable local tenant (`; DROP TABLE`) → PgBouncer/parametrización de la query escapa la cadena y previene ataque de segundo orden. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.CR.03.LLM]` Modificar la columna `created_at` (audit log) -> Triggers preventivos relacionales interceptan y rechazan el UPDATE malicioso. *(🤖 Verified by tool; 2026-04-26 11:59)*
- ✅ 🤖 `[DB.IN.03.LLM]` Examinar extensiones instaladas -> `pg_cron` o equivalente está disponible para recolectar basura en colas (archived jobs). *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[DB.IN.04.LLM]` Intentar un `DELETE FROM tabla_operativa` nativo -> Constraints o triggers fuerzan patrón de Soft-Delete (`deleted_at = now()`). *(🤖 Verified by tool; 2026-04-26 11:59)*

## STOR (S3 Storage Emulator / MinIO)
- ✅ 🤖 `[STOR.AV.01.LLM]` Bucket emulado local se expone en puerto TCP HTTP → Responde 200 a peticiones de listado públicas (si aplica) o 401 si privado. *(🤖 Verified by tool; 2026-04-26 10:42)*
- ✅ 🤖 `[STOR.FN.01.LLM]` Ejecutar subida de archivo mediante URL S3 Presignada → El archivo físico se deposita en el volumen montado del contenedor local. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.FN.02.LLM]` Cliente invoca API Storage de subida → Servidor retorna un path o URL unificada resoluble. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.CR.01.LLM]` Operación de lectura S3 con un JWT falso o malformado → El emulador aplica S3 Storage Policies y responde 403 Forbidden. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.CR.02.LLM]` Subir ejecutable binario `.exe` falseando su extensión a `.jpg` → Si S3 MIME sniffing está activo, lo bloquea (o aplicación frontend asume control). *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.CR.03.LLM]` Solicitar binario de bucket restringido sin credenciales en la petición (anon) → Storage emite HTTP 403. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.IN.01.LLM]` Subir archivo con llave homónima ya existente en el bucket → El emulador o Fastify aplican control de versiones lógico o colisión sin truncar datos aleatoriamente. *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.IN.02.LLM]` Borrar archivo en Storage S3 sin actualizar la BD → Test programático de inconsistencias huérfanas (auditoría eventual debe detectarlo). *(🤖 Verified by tool; 2026-04-26 12:15)*
- ✅ 🤖 `[STOR.RS.01.LLM]` Cortar subida Multipart Upload en el byte 15 de 50MB → Partes incompletas se desechan asíncronamente post-timeout en el backend S3. *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[STOR.RS.02.LLM]` Subir archivo que supera el umbral explícito del emulador (ej 20MB) → Fastify proxy o Storage retornan estrictamente 413 Payload Too Large. *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[STOR.RS.03.LLM]` Generar 50 uploads concurrentes en milisegundos hacia el contenedor emulado → El contenedor local sobrevive sin lanzar descriptores de archivo exhaustos (EMFILE). *(🤖 Verified by tool; 2026-04-27 01:50)*
- ✅ 🤖 `[STOR.RS.04.LLM]` Frenar en seco el contenedor STOR → El resto de la infraestructura Fastify responde a endpoints de lectura transaccional pura (Postgres) sin bloqueos masivos. *(🤖 Verified by tool; 2026-04-27 01:50)*

---

## CADDY (Edge Proxy)
- ✅ 🤖 `[CADDY.AV.01.LLM]` Enviar request HTTP a Caddy en puerto 80 del sandbox → Caddy responde con codigo HTTP (no connection refused). *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.AV.02.LLM]` Enviar request HTTP con Host: api.jarvis.local a Caddy → Caddy proxea a kamal-proxy y retorna respuesta de Fastify (/health 200). *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.AV.03.LLM]` Enviar request HTTP con Host: admin.jarvis.local a Caddy → Caddy proxea al contenedor SPA y retorna HTML (o 502 si SPA está caído, lo cual valida el proxeo). *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.FN.01.LLM]` Inspeccionar certificado TLS servido por Caddy en sandbox → Certificado presente y valido (self-signed o internal CA). *(🤖 Verified by tool; 2026-04-27 03:33)*
- ✅ 🤖 `[CADDY.FN.02.LLM]` Solicitar archivo estatico via URL de Caddy → Caddy retorna el archivo con Content-Type correcto. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.CR.01.LLM]` Inspeccionar headers de respuesta de request proxied por Caddy → X-Frame-Options y HSTS presentes. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.CR.02.LLM]` Enviar request a Fastify via Caddy e inspeccionar req.ip en Fastify → Fastify recibe X-Forwarded-For con IP del cliente original. *(🤖 Verified by tool; 2026-04-27 03:36)*
- ✅ 🤖 `[CADDY.IN.01.LLM]` Intentar conectar a puertos 5432, 6543, 9000 desde fuera de la red Docker → Connection refused en todos los puertos internos. *(🤖 Verified by tool; 2026-04-27 03:37)*
- ✅ 🤖 `[CADDY.IN.02.LLM]` Enviar request con Host: fake.jarvis.local a Caddy → Caddy retorna 404 o cierra conexion. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.RS.01.LLM]` Detener contenedor SPA, luego enviar request a api.jarvis.local via Caddy → Caddy retorna respuesta de Fastify normalmente. *(🤖 Verified by tool; 2026-04-27 03:37)*
- ✅ 🤖 `[CADDY.RS.02.LLM]` Ejecutar K6 con 1000 req/s contra Caddy → Caddy maneja la carga sin errores EMFILE ni caida de contenedor. *(🤖 Verified by tool; 2026-04-27 03:35)*
- ✅ 🤖 `[CADDY.RS.03.LLM]` Modificar Caddyfile y ejecutar caddy reload → Conexiones HTTP activas no se interrumpen durante reload. *(🤖 Verified by tool; 2026-04-27 03:36)*
## ADMIN (Admin API / Fastify /admin/*)

### Verified (TASK-010)
- ✅ 🤖 `[ADMIN.AV.01.LLM]` Registrar @fastify/jwt con namespace admin (RS256) → Coexiste con tenant JWT (HS256) sin conflicto. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.AV.02.LLM]` Enviar request a /admin/tenants → Endpoint responde HTTP 200 con JSON. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.FN.01.LLM]` GET /admin/tenants con admin JWT → Retorna array de tenants con id y name. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.FN.02.LLM]` GET /admin/jobs con admin JWT → Retorna array de jobs pg-boss. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.FN.03.LLM]` GET /admin/whatsapp/status con admin JWT → Retorna array de sesiones con tenant_id y status. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.CR.01.LLM]` Enviar request con tenant JWT (HS256) a /admin/* → Respuesta 401 Unauthorized. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.CR.02.LLM]` Enviar request sin JWT a /admin/* → Respuesta 401 Unauthorized. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.CR.03.LLM]` Enviar request con admin JWT pero role distinto a super_admin → Respuesta 403 Forbidden. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.IN.01.LLM]` Ejecutar SELECT cross-tenant con rol jarvis_admin → BYPASSRLS permite visibilidad total. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.IN.02.LLM]` Ejecutar DROP TABLE con rol jarvis_admin → PG rechaza (sin permisos DDL). *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.IN.03.LLM]` DELETE /admin/tenants/:id sin ?confirm=true → Respuesta 400 Bad Request. *(🤖 Verified by tool; 2026-04-27 10:45)*
- ✅ 🤖🧑 `[ADMIN.RS.01.MIX]` K6 carga simultánea en rutas tenant + admin → p95 < 20% degradación. *(🤖🧑 Pre-verified by tool, confirmed by user; 2026-04-27 10:45)*
- ✅ 🤖 `[ADMIN.RS.02.LLM]` Detener PG y enviar request a /admin/* → Respuesta 503 sin stack trace. *(🤖 Verified by tool; 2026-04-27 10:45)*

### Pending (from TASK-010)
- 🔲 🤖 `[ADMIN.RS.03.LLM]` Inspeccionar código fuente de carga de claves RS256 → Claves se leen de process.env, no hardcodeadas.

### Pending (Admin API Expansion — TASK-019)

#### Endpoint: POST /admin/tenants (Create)
- 🔲 🤖 `[ADMIN.FN.04.LLM]` POST /admin/tenants con payload {name: "Acme Corp"} → Respuesta 201 con id (UUID) y name del tenant creado.
- 🔲 🤖 `[ADMIN.CR.04.LLM]` POST /admin/tenants con name duplicado → Respuesta 409 Conflict (unique constraint).
- 🔲 🤖 `[ADMIN.CR.05.LLM]` POST /admin/tenants sin campo name → Respuesta 400 Bad Request (schema validation).
- 🔲 🤖 `[ADMIN.CR.06.LLM]` POST /admin/tenants con campos adicionales no definidos en schema → Respuesta 400 (additionalProperties: false).
- 🔲 🤖 `[ADMIN.IN.04.LLM]` POST /admin/tenants con tenant JWT (no admin) → Respuesta 401.
- 🔲 🤖 `[ADMIN.RS.04.LLM]` POST /admin/tenants durante caída transitoria de PG → Respuesta 503 sin corrupción; retry posterior crea el tenant sin duplicados.

#### Endpoint: PATCH /admin/tenants/:id (Update)
- 🔲 🤖 `[ADMIN.FN.05.LLM]` PATCH /admin/tenants/:id con {name: "New Name"} → Respuesta 200 con tenant actualizado.
- 🔲 🤖 `[ADMIN.CR.07.LLM]` PATCH /admin/tenants/:id con id inexistente → Respuesta 404 Not Found.
- 🔲 🤖 `[ADMIN.CR.08.LLM]` PATCH /admin/tenants/:id con payload vacío → Respuesta 400 (al menos un campo requerido).
- 🔲 🤖 `[ADMIN.CR.09.LLM]` PATCH /admin/tenants/:id con name duplicado de otro tenant → Respuesta 409 Conflict.
- 🔲 🤖 `[ADMIN.IN.05.LLM]` PATCH y DELETE concurrentes sobre el mismo tenant → Uno gana, el otro recibe 404 o 409; sin corrupción.

#### Endpoint: GET /admin/tenants/:id (Detail)
- 🔲 🤖 `[ADMIN.FN.06.LLM]` GET /admin/tenants/:id con id existente → Respuesta 200 con id, name, created_at, deleted_at.
- 🔲 🤖 `[ADMIN.CR.10.LLM]` GET /admin/tenants/:id con UUID inexistente → Respuesta 404 Not Found.
- 🔲 🤖 `[ADMIN.CR.11.LLM]` GET /admin/tenants/:id con id malformado (no UUID) → Respuesta 400 Bad Request.

#### Paginación y Filtros
- 🔲 🤖 `[ADMIN.FN.07.LLM]` GET /admin/tenants?page=1&limit=10 → Respuesta incluye array paginado y metadatos (total, page, limit).
- 🔲 🤖 `[ADMIN.FN.08.LLM]` GET /admin/jobs?state=failed → Retorna solo jobs con state=failed.
- 🔲 🤖 `[ADMIN.FN.09.LLM]` GET /admin/jobs?tenant_id=X → Retorna solo jobs asociados al tenant X.
- 🔲 🤖 `[ADMIN.CR.12.LLM]` GET /admin/tenants?page=-1 → Respuesta 400 (validación de parámetros).
- 🔲 🤖 `[ADMIN.CR.13.LLM]` GET /admin/jobs?limit=9999 → Servidor aplica límite superior (max 100); no permite dumping masivo.

## OPER (Operador Ops Console / Superadmin)
- 🔲 🤖 `[OPER.AV.01.LLM]` Navegar a `admin.jarvis.local` → La SPA carga con HTTP 200 y muestra interfaz funcional. *(Zero-Touch: acceso sin configuración manual)*
- 🔲 🤖 `[OPER.AV.02.LLM]` Ejecutar `docker-compose down && up -d` y navegar a la consola → Operativa sin wizard de onboarding ni creación de cuenta. *(Zero-Touch: cold start sin intervención)*
- 🔲 🤖 `[OPER.AV.03.LLM]` Hacer clic en cada enlace de navegación (tenants, jobs, whatsapp) → Vista cambia sin recarga completa del navegador. *(SPA routing funcional)*
- 🔲 🤖 `[OPER.FN.01.LLM]` Abrir sección "Tenants" con tenants existentes en BD → Tabla muestra id y name de cada tenant. *(Gestión: listado de tenants)*
- 🔲 🤖 `[OPER.FN.02.LLM]` Completar y enviar formulario de creación de tenant → Tenant aparece en la lista; API retorna 201. *(Gestión: alta de tenant)*
- 🔲 🤖 `[OPER.FN.03.LLM]` Hacer clic en "Eliminar" y confirmar en modal → Tenant desaparece de la lista; API retorna 204. *(Gestión: baja de tenant con confirmación)*
- 🔲 🤖 `[OPER.FN.04.LLM]` Abrir sección "Jobs" → Se muestran jobs pg-boss con estados (activo, fallido, completado). *(Monitoreo: colas pg-boss)*
- 🔲 🤖 `[OPER.FN.05.LLM]` Abrir sección "WhatsApp Status" → Se muestran conexiones WhatsApp con estado por tenant. *(Monitoreo: conexiones Baileys)*
- 🔲 🤖 `[OPER.CR.01.LLM]` Comparar JSON de `GET /admin/tenants` con datos renderizados en tabla → Campos coinciden 1:1 sin transformaciones erróneas. *(Fidelidad de datos)*
- 🔲 🤖 `[OPER.CR.02.LLM]` Provocar error 401 (token expirado) → Consola muestra mensaje legible indicando sesión expirada, no stack trace. *(UX de errores)*
- 🔲 🤖 `[OPER.IN.01.LLM]` Hacer clic en "Eliminar" sin confirmar en modal → Petición DELETE no se ejecuta; tenant permanece. *(Protección contra acciones accidentales)*
- 🔲 🤖 `[OPER.IN.02.LLM]` Mantener consola abierta 4+ horas y ejecutar una acción → Acción se ejecuta sin requerir re-autenticación manual. *(Persistencia de sesión)*
- 🔲 🤖 `[OPER.RS.01.LLM]` Detener contenedor Admin API y navegar la consola → Mensaje de error claro ("API no disponible"), no spinner infinito ni pantalla blanca. *(Degradación visible)*
- 🔲 🤖 `[OPER.RS.02.LLM]` Desconectar red del navegador durante edición de formulario, reconectar → Datos ingresados persisten tras reconexión. *(Resiliencia de formularios)*

## AAPI (Admin API Ops Console / Fastify)
- 🔲 🤖 `[AAPI.AV.01.LLM]` Inspeccionar variable `VITE_API_URL` en contenedor SPA → Apunta a URL correcta del Admin API. *(Configuración inyectable)*
- 🔲 🤖 `[AAPI.AV.02.LLM]` Interceptar petición de la SPA al Admin API → Header `Authorization: Bearer <token>` presente con JWT RS256 del namespace admin. *(Autenticación automática)*
- 🔲 🤖 `[AAPI.FN.01.LLM]` Cargar vista de tenants → SPA ejecuta `GET /admin/tenants` y renderiza tabla. *(Consumo de endpoint tenants)*
- 🔲 🤖 `[AAPI.FN.02.LLM]` Cargar vista de jobs → SPA ejecuta `GET /admin/jobs` y renderiza resultado. *(Consumo de endpoint jobs)*
- 🔲 🤖 `[AAPI.FN.03.LLM]` Cargar vista de WhatsApp Status → SPA ejecuta `GET /admin/whatsapp/status` y renderiza resultado. *(Consumo de endpoint whatsapp)*
- 🔲 🤖 `[AAPI.FN.04.LLM]` Ejecutar eliminación de tenant desde SPA → Petición `DELETE /admin/tenants/{id}?confirm=true` incluye query param. *(Parámetro de confirmación obligatorio)*
- 🔲 🤖 `[AAPI.CR.01.LLM]` Decodificar JWT enviado por SPA → Campo `alg` es `RS256`, nunca `HS256` ni `none`. *(Seguridad: algoritmo JWT correcto)*
- 🔲 🤖 `[AAPI.CR.02.LLM]` Aplicar filtro en tabla de tenants → Query params enviados corresponden al filtro en formato esperado por Fastify. *(Traducción correcta de filtros)*
- 🔲 🤖 `[AAPI.IN.01.LLM]` Navegar entre secciones sin ejecutar acciones mutativas → Ninguna petición POST/PUT/DELETE se ejecuta durante navegación. *(Aislamiento de lectura vs. escritura)*
- 🔲 🤖 `[AAPI.IN.02.LLM]` Inspeccionar almacenamiento del navegador tras autenticación → Token JWT no está en localStorage en texto plano sin protección. *(Seguridad: almacenamiento de tokens)*
- 🔲 🤖 `[AAPI.RS.01.LLM]` Detener PostgreSQL y ejecutar acción en consola → Mensaje de error derivado del HTTP 503, sin crash. *(Degradación ante falla de BD)*
- 🔲 🤖 `[AAPI.RS.02.LLM]` Provocar error 500 transitorio → SPA reintenta con backoff antes de mostrar error final. *(Retry automático)*

## CSPA (Contenedor SPA Ops Console / Docker+Nginx)
- 🔲 🤖 `[CSPA.AV.01.LLM]` Ejecutar `docker-compose up -d` → Contenedor SPA aparece con estado `running` o `healthy`. *(Arranque Zero-Touch)*
- 🔲 🤖 `[CSPA.AV.02.LLM]` Ejecutar `docker inspect` del contenedor SPA → Healthcheck reporta `healthy`. *(Healthcheck funcional)*
- 🔲 🤖 `[CSPA.FN.01.LLM]` Ejecutar `docker build` del Dockerfile → Build multi-stage completa sin errores (exit code 0). *(Build reproducible)*
- 🔲 🤖 `[CSPA.FN.02.LLM]` Inspeccionar variables de entorno en `docker-compose.yml` → `VITE_API_URL` definida; no hardcodeada en código fuente. *(Configuración externalizada)*
- 🔲 🤖 `[CSPA.CR.01.LLM]` Comparar hash de activos en contenedor con los de `vite build` → Hashes coinciden (sin activos stale). *(Inmutabilidad de activos)*
- 🔲 🤖 `[CSPA.CR.02.LLM]` Solicitar archivo `.js` de la SPA → `Content-Type: application/javascript`. *(MIME types correctos)*
- 🔲 🤖 `[CSPA.IN.01.LLM]` Ejecutar `docker-compose down && up -d` → Consola funciona sin residuos de estado previo. *(Efimeridad del contenedor)*
- 🔲 🤖 `[CSPA.IN.02.LLM]` Inspeccionar `docker-compose.yml` → No hay volúmenes persistentes para el servicio SPA. *(Sin estado persistente)*
- 🔲 🤖 `[CSPA.RS.01.LLM]` Arrancar contenedor SPA sin Admin API disponible → Contenedor arranca y sirve HTML; no aborta. *(Independencia de arranque)*
- 🔲 🤖 `[CSPA.RS.02.LLM]` Ejecutar `docker kill` del contenedor SPA y esperar 30s → Docker reinicia automáticamente (restart policy). *(Auto-recuperación)*

## REFN (Refine Framework Ops Console)
- 🔲 🤖 `[REFN.AV.01.LLM]` Inicializar proyecto Refine y ejecutar `npm run build` → Build completa sin errores ni conflictos de peer deps. *(Inicialización limpia)*
- 🔲 🤖 `[REFN.AV.02.LLM]` Importar `useTable` en componente conectado al dataProvider → Hook se conecta sin errores de tipo y ejecuta petición. *(Integración de hooks)*
- 🔲 🤖 `[REFN.FN.01.LLM]` Invocar `getList` del dataProvider con recurso "tenants" → DataProvider ejecuta `GET /admin/tenants` y retorna formato esperado. *(DataProvider: operación de lectura)*
- 🔲 🤖 `[REFN.FN.02.LLM]` Navegar a ruta protegida sin token → Refine redirige a login. Con token válido, permite acceso. *(AuthProvider: ciclo de autenticación)*
- 🔲 🤖 `[REFN.FN.03.LLM]` Navegar directamente a `admin.jarvis.local/tenants` (deep link) → Vista de tenants carga correctamente. *(Routing: deep links)*
- 🔲 🤖 `[REFN.CR.01.LLM]` Cargar lista paginada y navegar entre páginas → Registros no se duplican ni se pierden entre páginas. *(Paginación correcta)*
- 🔲 🤖 `[REFN.CR.02.LLM]` Crear tenant y verificar lista → Nuevo tenant aparece inmediatamente sin recarga manual. *(Invalidación de caché tras mutación)*
- 🔲 🤖 `[REFN.IN.01.LLM]` Actualizar `@refinedev/core` a siguiente minor y ejecutar tests → Todos los tests pasan sin modificaciones. *(Estabilidad ante actualizaciones)*
- 🔲 🤖 `[REFN.IN.02.LLM]` Añadir componente React puro con React Query directo → Funciona sin conflictos con QueryClient de Refine. *(Coexistencia con componentes custom)*
- 🔲 🤖 `[REFN.RS.01.LLM]` Configurar token inválido en authProvider y navegar → Refine muestra login o error; no crash del árbol de componentes. *(Manejo de auth fallida)*
- 🔲 🤖 `[REFN.RS.02.LLM]` Forzar HTTP 500 durante `getList` → UI muestra notificación de error; no pantalla blanca. *(Manejo de errores del API)*

## CDDY (Caddy Proxy Ops Console)
- 🔲 🤖 `[CDDY.AV.01.LLM]` Ejecutar `curl -k https://admin.jarvis.local` → HTTP 200 con contenido HTML de la SPA. *(Routing de subdominio)*
- 🔲 🤖 `[CDDY.AV.02.LLM]` Verificar certificado TLS de `admin.jarvis.local` → Certificado válido (self-signed en sandbox), no bloquea carga en navegador. *(TLS funcional)*
- 🔲 🤖 `[CDDY.FN.01.LLM]` Inspeccionar headers de respuesta de `admin.jarvis.local` → X-Frame-Options, X-Content-Type-Options, HSTS presentes. *(Headers de seguridad)*
- 🔲 🤖 `[CDDY.FN.02.LLM]` Navegar directamente a `admin.jarvis.local/tenants` → Caddy retorna `index.html` (SPA fallback), no 404. *(SPA fallback)*
- 🔲 🤖 `[CDDY.CR.01.LLM]` Interceptar peticiones proxeadas → Headers originales (Host, Authorization) preservados. *(Transparencia de proxy)*
- 🔲 🤖 `[CDDY.CR.02.LLM]` Comparar petición al API vía Caddy vs. directa → Respuestas idénticas (sin caché ni modificación). *(Sin alteración de datos)*
- 🔲 🤖 `[CDDY.IN.01.LLM]` Navegar a subdominio no configurado (`hacker.jarvis.local`) → Caddy rechaza con error HTTP, no sirve contenido. *(Rechazo de subdominios desconocidos)*
- 🔲 🤖 `[CDDY.IN.02.LLM]` Reiniciar contenedor de Caddy → `admin.jarvis.local` sigue enrutando correctamente. *(Persistencia de configuración)*
- 🔲 🤖 `[CDDY.RS.01.LLM]` Detener contenedor SPA y curl a `admin.jarvis.local` → HTTP 502. `api.jarvis.local` sigue operativo. *(Aislamiento de fallos)*
- 🔲 🤖 `[CDDY.RS.02.LLM]` Eliminar servicio SPA del compose y arrancar stack → Caddy arranca; API funciona; admin retorna error sin crash. *(Tolerancia a servicios faltantes)*

## OBSRV (Observabilidad / Loki + Grafana + Uptime Kuma)
- ✅ 🤖 `[OBSRV.AV.01.LLM]` Verificar que contenedor Loki acepta POST en /loki/api/v1/push → Respuesta 204 o 200.
- ✅ 🤖 `[OBSRV.AV.02.LLM]` Verificar que contenedor Grafana responde en su puerto → Respuesta 200 en login page.
- ✅ 🤖 `[OBSRV.AV.03.LLM]` Ejecutar script de provisionamiento de Uptime Kuma → Uptime Kuma inicializa sus credenciales via API.
- ✅ 🤖 `[OBSRV.FN.01.LLM]` Generar log en Fastify y buscar en Loki via LogQL → Query retorna el log con estructura JSON completa.
- ✅ 🤖 `[OBSRV.FN.02.LLM]` Configurar datasource Loki en Grafana y ejecutar query LogQL → Grafana retorna resultados via API.
- ✅ 🤖 `[OBSRV.FN.03.LLM]` Configurar regla de alerta en Grafana y provocar condicion → Grafana dispara la alerta (estado firing).
- ✅ 🤖 `[OBSRV.FN.04.LLM]` Ejecutar script de provisionamiento de Uptime Kuma → API de Uptime Kuma confirma creacion deterministica de monitores.
- ✅ 🤖 `[OBSRV.CR.01.LLM]` Comparar log de Pino (stdout) con log en Loki → Campos level, time, msg, pid identicos.
- ✅ 🤖 `[OBSRV.CR.02.LLM]` Inspeccionar labels de Loki en log almacenado → Solo labels de baja cardinalidad (service, level, tenant_id).
- ✅ 🤖 `[OBSRV.IN.01.LLM]` Intentar eliminar logs de Loki via API → Loki rechaza (405 o 404, append-only).
- ✅ 🤖 `[OBSRV.IN.02.LLM]` Acceder a Grafana sin credenciales → Grafana redirige a login (no acceso anonimo).
- ✅ 🤖 `[OBSRV.RS.01.LLM]` Detener contenedor Loki, enviar request HTTP a Fastify → Fastify responde 200/202 (pino-loki no bloquea event loop).
- ✅ 🤖 `[OBSRV.RS.02.LLM]` Medir consumo de RAM de Loki bajo carga normal → Consumo < 500MB segun docker stats.

## TINFR (Testing Infrastructure)
- ✅ 🤖 `[TINFR.AV.01.LLM]` Ejecutar specmatic test contra OpenAPI spec con Fastify levantado → Specmatic conecta y ejecuta tests.
- ✅ 🤖 `[TINFR.AV.02.LLM]` Ejecutar npx stryker run en el proyecto → Stryker genera reporte de mutacion sin crash.
- ✅ 🤖 `[TINFR.AV.03.LLM]` Ejecutar k6 run contra endpoint de Fastify → K6 completa ejecucion y muestra summary.
- ✅ 🤖 `[TINFR.FN.01.LLM]` Ejecutar Specmatic contra /api/v1/sync/inbox con spec estricto → Specmatic valida schema, status codes, content-type.
- ✅ 🤖 `[TINFR.FN.02.LLM]` Modificar campo en OpenAPI spec (breaking change) y ejecutar Specmatic backward-compat → Specmatic detecta breaking change y falla.
- ✅ 🤖 `[TINFR.FN.03.LLM]` Ejecutar Stryker sobre test file con cobertura parcial → Reporte muestra mutantes sobrevivientes con mutation score.
- ✅ 🤖 `[TINFR.FN.04.LLM]` Ejecutar test suite con Testcontainers que levanta PG 17 + MinIO → Tests pasan con contenedores reales.
- ✅ 🤖 `[TINFR.CR.01.LLM]` Ejecutar fast-check con propiedad de RLS (tenant isolation) → Todos los inputs pasan la propiedad.
- ✅ 🤖 `[TINFR.CR.02.LLM]` Ejecutar K6 con xk6-dashboard → Dashboard muestra metricas en tiempo real (latencia, throughput, error rate).
- ✅ 🤖 `[TINFR.IN.01.LLM]` Verificar que specs/tenant-api.yaml y specs/admin-api.yaml existen en el repo → Archivos presentes con formato OpenAPI 3.x valido.
- ✅ 🤖 `[TINFR.IN.02.LLM]` Verificar que Stryker genera reporte persistido (HTML o JSON) → Archivo de reporte existe en directorio configurado.
- ✅ 🤖 `[TINFR.RS.01.LLM]` Ejecutar test suite con Testcontainers y verificar cleanup → docker ps no muestra contenedores efimeros post-ejecucion.

---

## Summary
| Actor | 🤖 .LLM | 🧑 .HUM | 🤖🧑 .MIX | Total | Status |
|---|---|---|---|---|---|
| CLNT | 12 | 0 | 0 | 12 | ✅ Complete |
| CORE | 13 | 0 | 0 | 13 | ✅ Complete |
| BOSS | 13 | 0 | 0 | 13 | ✅ Complete |
| WAPP | 9 | 3 | 1 | 13 | ✅ Complete |
| DB | 14 | 0 | 0 | 14 | ✅ Complete |
| STOR | 12 | 0 | 0 | 12 | ✅ Complete |
| CADDY | 12 | 0 | 0 | 12 | ✅ Complete |
| ADMIN | 31 | 0 | 1 | 32 | 🔲 19 pending |
| OBSRV | 11 | 0 | 2 | 13 | ✅ Complete |
| TINFR | 12 | 0 | 0 | 12 | ✅ Complete |
| OPER | 14 | 0 | 0 | 14 | 🔲 14 pending |
| AAPI | 12 | 0 | 0 | 12 | 🔲 12 pending |
| CSPA | 10 | 0 | 0 | 10 | 🔲 10 pending |
| REFN | 11 | 0 | 0 | 11 | 🔲 11 pending |
| CDDY | 10 | 0 | 0 | 10 | 🔲 10 pending |
| ~~OPSUI~~ | ~~4~~ | ~~3~~ | ~~5~~ | ~~12~~ | Archived (UD-007) |
| **Total** | **196** | **3** | **4** | **203** |


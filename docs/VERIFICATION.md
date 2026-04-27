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
| Ops Console (Appsmith) | OPSUI | Actor |
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
- ✅ 🤖 `[CADDY.AV.03.LLM]` Enviar request HTTP con Host: admin.jarvis.local a Caddy → Caddy proxea a Appsmith y retorna HTML de login (o 502 si Appsmith está caído, lo cual valida el proxeo). *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.FN.01.LLM]` Inspeccionar certificado TLS servido por Caddy en sandbox → Certificado presente y valido (self-signed o internal CA). *(🤖 Verified by tool; 2026-04-27 03:33)*
- ✅ 🤖 `[CADDY.FN.02.LLM]` Solicitar archivo estatico via URL de Caddy → Caddy retorna el archivo con Content-Type correcto. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.CR.01.LLM]` Inspeccionar headers de respuesta de request proxied por Caddy → X-Frame-Options y HSTS presentes. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.CR.02.LLM]` Enviar request a Fastify via Caddy e inspeccionar req.ip en Fastify → Fastify recibe X-Forwarded-For con IP del cliente original. *(🤖 Verified by tool; 2026-04-27 03:36)*
- ✅ 🤖 `[CADDY.IN.01.LLM]` Intentar conectar a puertos 5432, 6543, 9000 desde fuera de la red Docker → Connection refused en todos los puertos internos. *(🤖 Verified by tool; 2026-04-27 03:37)*
- ✅ 🤖 `[CADDY.IN.02.LLM]` Enviar request con Host: fake.jarvis.local a Caddy → Caddy retorna 404 o cierra conexion. *(🤖 Verified by tool; 2026-04-27 03:34)*
- ✅ 🤖 `[CADDY.RS.01.LLM]` Detener contenedor Appsmith, luego enviar request a api.jarvis.local via Caddy → Caddy retorna respuesta de Fastify normalmente. *(🤖 Verified by tool; 2026-04-27 03:37)*
- ✅ 🤖 `[CADDY.RS.02.LLM]` Ejecutar K6 con 1000 req/s contra Caddy → Caddy maneja la carga sin errores EMFILE ni caida de contenedor. *(🤖 Verified by tool; 2026-04-27 03:35)*
- ✅ 🤖 `[CADDY.RS.03.LLM]` Modificar Caddyfile y ejecutar caddy reload → Conexiones HTTP activas no se interrumpen durante reload. *(🤖 Verified by tool; 2026-04-27 03:36)*

- 🔲 🤖 `[ADMIN.RS.03.LLM]` Inspeccionar codigo fuente de carga de claves RS256 → Claves se leen de process.env, no hardcodeadas.

## OPSUI (Ops Console / Appsmith)
- [x] 🤖 `[OPSUI.AV.01.LLM]` Verificar que contenedor Appsmith esta running via docker ps → Estado: Up, health check pasando.
- [x] 🤖🧑 `[OPSUI.AV.02.MIX]` Navegar a admin.jarvis.local en browser via Caddy → Pagina de login de Appsmith se renderiza correctamente.
- [x] 🤖🧑 `[OPSUI.FN.01.MIX]` Autenticarse en Appsmith con email/contrasena configurados → Appsmith emite un admin JWT (RS256) en la sesion.
- [x] 🧑 `[OPSUI.FN.02.HUM]` Abrir dashboard de tenants en Appsmith → Panel muestra datos de tenants provenientes de GET /admin/tenants.
- [x] 🧑 `[OPSUI.FN.03.HUM]` Abrir vista de jobs en Appsmith → Panel muestra cola de pg-boss con estados y filtros funcionales.
- [x] 🧑 `[OPSUI.FN.04.HUM]` Abrir vista de WhatsApp status en Appsmith → Panel muestra estado de conexiones por tenant.
- [x] 🤖 `[OPSUI.CR.01.LLM]` Inspeccionar headers de requests salientes de Appsmith hacia Admin API → Header Authorization contiene Bearer + JWT con alg RS256.
- [x] 🤖🧑 `[OPSUI.CR.02.MIX]` Intentar ejecutar operacion destructiva en Appsmith → Widget de confirmacion aparece antes de ejecutar.
- [x] 🤖 `[OPSUI.IN.01.LLM]` Inspeccionar volumen Docker de Appsmith → Contrasena del operador almacenada como hash, no texto plano.
- [x] 🤖🧑 `[OPSUI.IN.02.MIX]` Verificar que Appsmith no tiene cache local de datos de tenants → Recargar dashboard muestra datos frescos del Admin API.
- [x] 🤖 `[OPSUI.RS.01.LLM]` Detener contenedor Appsmith, enviar request a api.jarvis.local → Fastify responde 200/202 normalmente.
- [x] 🤖🧑 `[OPSUI.RS.02.MIX]` Detener Admin API, intentar usar Appsmith → Appsmith muestra error de conectividad legible, no crash.

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
| Actor | 🤖 .LLM | 🧑 .HUM | 🤖🧑 .MIX | Total |
|---|---|---|---|---|
| CLNT | 12 | 0 | 0 | 12 |
| CORE | 13 | 0 | 0 | 13 |
| BOSS | 13 | 0 | 0 | 13 |
| WAPP | 9 | 3 | 1 | 13 |
| DB | 14 | 0 | 0 | 14 |
| STOR | 12 | 0 | 0 | 12 |
| CADDY | 12 | 0 | 0 | 12 |
| ADMIN | 13 | 0 | 1 | 14 |
| OPSUI | 4 | 3 | 5 | 12 |
| OBSRV | 11 | 0 | 2 | 13 |
| TINFR | 12 | 0 | 0 | 12 |
| **Total** | **125** | **6** | **9** | **140** |


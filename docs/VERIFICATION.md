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

## Phase 1: Local Sandbox Validation

## Abbreviation Key
| Full Name | Abbreviation | Type |
|---|---|---|
| HTTP Client / Sincronizador | CLNT | Actor |
| Fastify HTTP Core | CORE | Actor |
| pg-boss Worker | BOSS | Actor |
| WhatsApp Baileys Worker | WAPP | Actor |
| PostgreSQL RLS | DB | Actor |
| Supabase Storage Emulator | STOR | Actor |
| Verifiable by automated tool | LLM | Verifier |
| Requires human verification | HUM | Verifier |
| Pre-verifiable by AI, final human validation | MIX | Verifier |

## CLNT (HTTP Client / Sincronizador)
- 🔲 🧑 `[CLNT.CR.02.HUM]` Esperar estado en Frontend tras sync → La UI actualiza el indicador visual a "Sincronizado" sin bloqueos de render.
- 🔲 🤖 `[CLNT.AV.01.LLM]` Script envía payload a Inbox → Endpoint responde al socket TCP.
- 🔲 🤖 `[CLNT.AV.02.LLM]` Enviar un payload JSON válido → Se recibe HTTP 202 en <50ms.
- 🔲 🤖 `[CLNT.FN.01.LLM]` Enviar UUIDv7 en payload → Respuesta 202, registro aparece en DB con ese UUID exacto.
- 🔲 🤖 `[CLNT.FN.02.LLM]` Enviar UUIDv4 o incremental → Respuesta HTTP 400 Bad Request.
- 🔲 🤖 `[CLNT.FN.03.LLM]` Solicitar URL presignada → El cliente recibe un token temporal S3 válido.
- 🔲 🤖 `[CLNT.CR.01.LLM]` Enviar JSON malformado a Inbox → Respuesta HTTP 400 Strict.
- 🔲 🤖 `[CLNT.CR.03.LLM]` Enviar payload JSON con campos inyectados no definidos en el Schema → Fastify arroja HTTP 400 por validación estricta (no-additional-properties).
- 🔲 🤖 `[CLNT.IN.01.LLM]` Enviar mismo UUIDv7 dos veces → Segunda inserción es idempotente y no crea duplicados relacionales.
- 🔲 🤖 `[CLNT.IN.02.LLM]` Interrumpir la conexión HTTP TCP a la mitad del envío del payload → El servidor descarta el frame, sin corromper la BD.
- 🔲 🤖 `[CLNT.RS.01.LLM]` Enviar 100 requests por segundo → Servidor responde con HTTP 429 Too Many Requests (Rate Limiter).
- 🔲 🤖 `[CLNT.RS.02.LLM]` Solicitar datos con JWT de tenant A pero resource_id de tenant B → Servidor responde 403 o 404.
- 🔲 🤖 `[CLNT.RS.03.LLM]` Enviar secuencias nulas/Unicode corrupto en texto libre → Schema validation rechaza con HTTP 400 antes de tocar BD.

## CORE (Fastify HTTP Core)
- 🔲 🤖 `[CORE.CR.01.LLM]` Bajar contenedor de Supabase y arrancar Fastify → Fastify arranca con log preventivo sin crashear en bucle (Testcontainers).
- 🔲 🤖 `[CORE.RS.02.LLM]` Matar y reiniciar contenedor Supabase mientras Fastify corre → Fastify restablece el pool de conexiones (Testcontainers).
- 🔲 🤖 `[CORE.AV.01.LLM]` Hacer ping a la ruta `/health` local → Respuesta HTTP 200/OK.
- 🔲 🤖 `[CORE.AV.02.LLM]` Ejecutar simulación de carga sostenida → El lag del event loop medido es <50ms.
- 🔲 🤖 `[CORE.FN.01.LLM]` Enviar payload incompleto (falta schema obligatorio) → Fastify rechaza de inmediato (logs DB vacíos).
- 🔲 🤖 `[CORE.FN.02.LLM]` Consultar tabla `sync_inbox` en PG tras HTTP 202 → El JSON de payload crudo existe.
- 🔲 🤖 `[CORE.FN.03.LLM]` Enviar request con JWT estructuralmente correcto pero expirado → Respuesta 401 Unauthorized sin latencia de BD.
- 🔲 🤖 `[CORE.CR.02.LLM]` Inspeccionar headers HTTP al sincronizar → Content-Type explícito y status de respuesta es estrictamente 202.
- 🔲 🤖 `[CORE.IN.01.LLM]` Escanear código fuente Fastify → Imposibilidad de estado global (ej. `let session = {}`).
- 🔲 🤖 `[CORE.IN.02.LLM]` Hacer request anónimo a endpoint de inbox → Fastify rechaza con HTTP 401 Unauthorized.
- 🔲 🤖 `[CORE.IN.03.LLM]` Inyectar excepción interna provocada (mock) → Fastify no filtra el stack trace al cliente en entorno de producción.
- 🔲 🤖 `[CORE.RS.01.LLM]` Enviar payload gigantesco de 50MB → Respuesta 413 Payload Too Large; memoria del worker Node permanece estable.
- 🔲 🤖 `[CORE.RS.03.LLM]` Sostener 50 conexiones TCP Keep-Alive sin enviar datos (Slowloris) → Fastify las dropea tras el timeout configurado.

## BOSS (pg-boss Worker)
- 🔲 🤖 `[BOSS.FN.01.LLM]` Llenar Inbox con 10,000 registros simultáneos (K6) → El worker de pg-boss los consume a ritmo acotado (rate-limit interno).
- 🔲 🤖 `[BOSS.AV.01.LLM]` Inspeccionar contenedor `boss-worker` → Se ejecuta en su propio proceso Node, no anidado en los hilos de Fastify.
- 🔲 🤖 `[BOSS.FN.02.LLM]` Inyectar job y leer output estructurado (Pino) → El log certifica extracción del `tenant_id` del payload crudo.
- 🔲 🤖 `[BOSS.FN.03.LLM]` Extraer pg_stat_statements tras consumo → Se confirma patrón `SET LOCAL request.jwt.claims` forzando contexto.
- 🔲 🤖 `[BOSS.CR.01.LLM]` Insertar UUIDv7 cronológicamente desordenados → Las lógicas de negocio insertan respetando idempotencia temporal (no overwrite newer).
- 🔲 🤖 `[BOSS.CR.02.LLM]` Lanzar excepción en handler de job → La tarea se visualiza en estado `retry` con backoff en `pg-boss.job`.
- 🔲 🤖 `[BOSS.CR.03.LLM]` Levantar dos contenedores BOSS idénticos → El lock `SELECT FOR UPDATE SKIP LOCKED` previene que procesen el mismo job.
- 🔲 🤖 `[BOSS.IN.01.LLM]` Abortar handler (throw error) en medio de transacciones relacionales → Rollback transaccional estricto (0 inserts relacionales).
- 🔲 🤖 `[BOSS.IN.02.LLM]` Auditar string de conexión de BOSS → Debe apuntar obligatoriamente al pooler Supavisor (puerto 6543), no a port 5432 directo.
- 🔲 🤖 `[BOSS.IN.03.LLM]` Reiniciar abruptamente contenedor PostgreSQL → Worker de pg-boss emite errores pero reconecta la subscripción de eventos exitosamente.
- 🔲 🤖 `[BOSS.RS.01.LLM]` Inyectar job con estructura inesperada que cause TypeError → Ese job falla de forma aislada; el ciclo de pg-boss no se interrumpe.
- 🔲 🤖 `[BOSS.RS.02.LLM]` Forzar N reintentos consecutivos → Al llegar al límite configurado, pg-boss mueve permanentemente a tabla `archived` o status `failed`.
- 🔲 🤖 `[BOSS.RS.03.LLM]` Medir conexiones activas de BOSS bajo carga → El pool del worker respeta el límite superior (`max: 10`) sin agotar Supavisor.

## WAPP (WhatsApp Baileys Worker)
- 🔲 🤖 `[WAPP.FN.02.LLM]` Reiniciar contenedor WAPP orquestado → Autenticación Baileys levanta la sesión deserializada desde Postgres sin QR.
- 🔲 🧑 `[WAPP.CR.01.HUM]` Enviar un mensaje de texto desde celular externo → Mensaje se registra en tabla `wapp_incoming` asociado al tenant.
- 🔲 🧑 `[WAPP.CR.02.HUM]` Escribir tarea de mensaje saliente en pg-boss → Teléfono celular externo recibe la notificación visualmente.
- 🔲 🤖 `[WAPP.RS.01.LLM]` Simular caída red local Docker → Baileys WebSocket emite `connection.update: close` y planifica reconexión progresiva.
- 🔲 🤖 `[WAPP.RS.02.LLM]` Inyectar instrucción de enviar archivo de 1GB en cola PG → Baileys emite advertencia o falla el mensaje aislado, pero no crashea el proceso.
- 🔲 🧑 `[WAPP.RS.03.HUM]` Desvincular dispositivo remoto en el app móvil original → El worker lee evento de deslogueo y muta tabla `wapp_status` a `disconnected`.
- 🔲 🤖🧑 `[WAPP.FN.01.MIX]` Escanear código QR inicial → PostgreSQL columna JSONB de credenciales Baileys se rellena correctamente.
- 🔲 🤖 `[WAPP.IN.01.LLM]` Inyectar ráfaga de 1,000 eventos `messages.upsert` → Fastify mantiene rendimiento intacto gracias a orquestación desacoplada.
- 🔲 🤖 `[WAPP.AV.01.LLM]` Confirmar red Docker Compose → Existe contenedor de servicio discreto dedicado exclusivamente a lógicas de Sock.
- 🔲 🤖 `[WAPP.IN.02.LLM]` Borrar volumen efímero de contenedor WAPP → Sesión no se corrompe gracias al storage `useMultiFileAuthState` montado en BD.
- 🔲 🤖 `[WAPP.CR.03.LLM]` Recibir mensaje entrante de número malformado o grupo no-admitido → Worker lo descarta silente en base a lógicas, sin saturar PG.
- 🔲 🤖 `[WAPP.IN.03.LLM]` Monitoreo Docker stats en WAPP 24h → Curva de RAM permanece <512MB previniendo Node OOM en encripciones masivas de Baileys.
- 🔲 🤖 `[WAPP.RS.04.LLM]` Provocar rate-limit WhatsApp (spam de mensajes simulado) → Worker Baileys lee el error y retrasa la cola con backoff dinámico sin banear socket permanentemente.

## DB (PostgreSQL RLS)
- 🔲 🤖 `[DB.RS.02.LLM]` Estrés K6 de 1000 iteraciones/segundo sobre transacciones completas → RAM/CPU del emulador Supabase DB no supera umbral configurado de sandbox.
- 🔲 🤖 `[DB.AV.01.LLM]` Comando psql interactivo (ping) → Aceptación inmediata en protocolo libpq.
- 🔲 🤖 `[DB.FN.01.LLM]` Intento malicioso de SELECT desde worker con `request.jwt.claims` forjado → Bloqueo matemático estricto por política RLS `tenant_id = current_setting`.
- 🔲 🤖 `[DB.FN.02.LLM]` Inyección de JSONB > 10MB en tabla transaccional → Base de datos o proxy de PG lanza restricción para obligar el desvío a Storage.
- 🔲 🤖 `[DB.CR.01.LLM]` Linter `sqlcheck` sobre schema operativo → Tablas operativas poseen constraints estrcitos de `ENABLE ROW LEVEL SECURITY`.
- 🔲 🤖 `[DB.CR.02.LLM]` Test de 500 conexiones Fastify concurrentes → PgBouncer (Supavisor) las condensa eficientemente en <50 conexiones libpq nativas reales.
- 🔲 🤖 `[DB.IN.01.LLM]` Crear registro operativo apuntando a `tenant_id` fantasma → Falla Foreign Key / Violación referencial.
- 🔲 🤖 `[DB.IN.02.LLM]` Validar pipeline Atlas CI (o equivalente local) → Exige verificación de migraciones sin caídas abruptas (código `DROP COLUMN` rechazado).
- 🔲 🤖 `[DB.RS.01.LLM]` Intentar un `CREATE INDEX` síncrono sobre tabla masiva -> Linter lo rechaza, exigiendo `CONCURRENTLY`.
- 🔲 🤖 `[DB.RS.03.LLM]` Inyección SQL clásica en variable local tenant (`; DROP TABLE`) → Securización en Supavisor escapa la cadena y previene ataque de segundo orden.
- 🔲 🤖 `[DB.CR.03.LLM]` Modificar la columna `created_at` (audit log) -> Triggers preventivos relacionales interceptan y rechazan el UPDATE malicioso.
- 🔲 🤖 `[DB.IN.03.LLM]` Examinar extensiones instaladas -> `pg_cron` o equivalente está disponible para recolectar basura en colas (archived jobs).
- 🔲 🤖 `[DB.IN.04.LLM]` Intentar un `DELETE FROM tabla_operativa` nativo -> Constraints o triggers fuerzan patrón de Soft-Delete (`deleted_at = now()`).

## STOR (Supabase Storage Emulator)
- 🔲 🤖 `[STOR.AV.01.LLM]` Bucket emulado local se expone en puerto TCP HTTP → Responde 200 a peticiones de listado públicas (si aplica) o 401 si privado.
- 🔲 🤖 `[STOR.FN.01.LLM]` Ejecutar subida de archivo mediante URL S3 Presignada → El archivo físico se deposita en el volumen montado del contenedor local.
- 🔲 🤖 `[STOR.FN.02.LLM]` Cliente invoca API Storage de subida → Servidor retorna un path o URL unificada resoluble.
- 🔲 🤖 `[STOR.CR.01.LLM]` Operación de lectura S3 con un JWT falso o malformado → El emulador aplica S3 Storage Policies y responde 403 Forbidden.
- 🔲 🤖 `[STOR.CR.02.LLM]` Subir ejecutable binario `.exe` falseando su extensión a `.jpg` → Si S3 MIME sniffing está activo, lo bloquea (o aplicación frontend asume control).
- 🔲 🤖 `[STOR.CR.03.LLM]` Solicitar binario de bucket restringido sin credenciales en la petición (anon) → Storage emite HTTP 403.
- 🔲 🤖 `[STOR.IN.01.LLM]` Subir archivo con llave homónima ya existente en el bucket → El emulador o Fastify aplican control de versiones lógico o colisión sin truncar datos aleatoriamente.
- 🔲 🤖 `[STOR.IN.02.LLM]` Borrar archivo en Storage S3 sin actualizar la BD → Test programático de inconsistencias huérfanas (auditoría eventual debe detectarlo).
- 🔲 🤖 `[STOR.RS.01.LLM]` Cortar subida Multipart Upload en el byte 15 de 50MB → Partes incompletas se desechan asíncronamente post-timeout en el backend S3.
- 🔲 🤖 `[STOR.RS.02.LLM]` Subir archivo que supera el umbral explícito del emulador (ej 20MB) → Fastify proxy o Storage retornan estrictamente 413 Payload Too Large.
- 🔲 🤖 `[STOR.RS.03.LLM]` Generar 50 uploads concurrentes en milisegundos hacia el contenedor emulado → El contenedor local sobrevive sin lanzar descriptores de archivo exhaustos (EMFILE).
- 🔲 🤖 `[STOR.RS.04.LLM]` Frenar en seco el contenedor STOR → El resto de la infraestructura Fastify responde a endpoints de lectura transaccional pura (Postgres) sin bloqueos masivos.

---

## Summary
| Actor | 🤖 .LLM | 🧑 .HUM | 🤖🧑 .MIX | Total |
|---|---|---|---|---|
| CLNT | 12 | 1 | 0 | 13 |
| CORE | 13 | 0 | 0 | 13 |
| BOSS | 13 | 0 | 0 | 13 |
| WAPP | 9 | 3 | 1 | 13 |
| DB | 13 | 0 | 0 | 13 |
| STOR | 12 | 0 | 0 | 12 |
| **Total** | **72** | **4** | **1** | **77** |

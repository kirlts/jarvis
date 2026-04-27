# MASTER-SPEC: Jarvis v0.1.0

> PRD y Arquitectura Maestra. SDD vía Framework Kairós.

---

## §1. Project Identity

**Purpose:** Plataforma centralizada (núcleo SaaS) para la gestión y trazabilidad de personal y operaciones a medida que los negocios escalan.

**Name:** Jarvis

**Domain:** B2B SaaS (Operations & Personnel Management)

**Problem it solves:** Los negocios en crecimiento necesitan orquestar recursos humanos y tareas en terreno u operativas. Jarvis provee un núcleo robusto multi-tenant (gestión de usuarios, identidades, trazabilidad, notificaciones) sobre el cual se construirán expansiones personalizadas.

**Direct beneficiary:** Operadores de negocios (fundadores, administradores) que necesitan visibilidad y control sobre sus operaciones escalables.

**Indirect beneficiary:** Trabajadores en terreno, especialistas de la salud, personal coordinado.

**What it IS NOT:** No es un sistema atado a una sola industria. Los casos de uso de contratistas o médicos (Plugins) están FUERA DEL SCOPE del sistema core; son expansiones implementables futuras. Microservicios distribuidos, bases vectoriales externas e interfaces PaaS visuales están prohibidas.

---

## §2. Architecture

**Type:** Monolito Modular (VSA / Patrón Microkernel).

**Component Diagram:**

```
[Client] → [Fastify HTTP Core] → [PgBouncer :6543] → [PostgreSQL 17 (RLS)]
[Client] → (S3 Presigned URL) → [MinIO / Supabase Storage]
[pg-boss Worker] ↔ [PostgreSQL 17 :5432 directo]  ← NO pasa por pooler
[WhatsApp Worker (Baileys)] ↔ [PostgreSQL 17 (RLS)]
[Baileys] → downloadMedia → [MinIO jarvis-private] → pg-boss → [Core Worker Stub] → pg-boss → [Baileys sendMessage]
```

**Main Data Flow:**

1. Cliente sincroniza datos offline vía UUIDv7 hacia Fastify Inbox.
2. Fastify inserta crudo en `sync_inbox` vía PgBouncer (transaction mode, :6543) y retorna `202 Accepted`.
3. Worker `pg-boss` procesa el inbox conectándose directamente a PostgreSQL (:5432). Esta conexión elude el pooler para garantizar la continuidad de sesión exigida por los advisory locks y `SKIP LOCKED`.

---

## §3. Technical Stack

| Layer | Technology | Version (Apr 2026) | Justification |
| --- | --- | --- | --- |
| Runtime | Node.js LTS | 24.x (Krypton) | OpenSSL 3.5, SCRAM enforced, EOL Apr 2028 |
| Frontend | TBD | N/A | Definido por instanciamiento |
| Backend | Fastify | 5.8.5 | Monolito Modular, VSA. JSON Schema estricto |
| Data | PostgreSQL | 17.x | Única fuente de verdad. TSVECTOR, JSONB, UUIDv7 nativo (futuro) |
| Pooler | PgBouncer (edoburu) | 1.25.x | Transaction mode en :6543. Sandbox emula Supavisor |
| Queue | pg-boss | 12.x | Sincronización asíncrona dentro de PostgreSQL. Conexión directa :5432 |
| Hosting | Oracle Cloud ARM | N/A | Stateless, bajo costo. Despliegue con Kamal 2 y kamal-proxy |
| Edge Proxy | Caddy | 2.x | Routing de subdominios (`api.`, `admin.`), TLS automático, static file serving. Se sienta delante de kamal-proxy |
| Storage | MinIO (sandbox) / Supabase Storage (prod) | RELEASE.2025-10-15 | S3-compatible. Prohibido almacenar binarios en DB |
| Logging | Pino | 10.x | Structured JSON, worker threads, zero event-loop blocking |
| Observability | Loki + Grafana | latest stable | Log aggregation + dashboards + alerting proactivo. Self-hosted, zero dependencia SaaS |
| Migrations | Atlas CLI (Ariga) | 1.2.0 | Declarativo. Linter bloquea operaciones destructivas |
| Admin UI | SPA Propietaria | N/A | Panel de operaciones construido sobre el Admin API. Backend enteramente delegado a Jarvis |

---

## §4. Constraints (Inviolable Boundaries)

> These constraints override any other decision. They are the lines that must not be crossed.

1. **Singularidad de Estado:** PostgreSQL es la única base de datos. Redis, MongoDB, vector DBs prohibidas.
2. **GitOps Imperativo:** Uso de CLI cruda y logs. Prohibido Dokploy, Coolify, Traefik. Solo Kamal 2 + kamal-proxy.
3. **Criptografía Baileys Aislada:** Worker debe operar fuera del HTTP Core y guardar llaves en PG JSONB. Uso de `fs` prohibido.
4. **UUIDv7 Obligatorio:** Auto-incrementales y UUIDv4 prohibidos para asegurar ordenamiento cronológico absoluto. Generación client-side vía `uuid.v7()` (ESM).
5. **Aislamiento Multi-Tenant (RLS):** Uso de variables locales para inyección RLS (`SET LOCAL request.jwt.claims ...`). Inyección global prohibida. Tráfico HTTP vía PgBouncer (transaction mode, :6543).
6. **Migraciones Declarativas:** Atlas (Ariga) v1.2.0 obligatorio. ORMs manuales prohibidos. Operaciones destructivas bloqueadas por linter.
7. **pg-boss: Conexión Directa Obligatoria:** pg-boss DEBE conectarse directamente a PostgreSQL (:5432), NO a través del pooler. Advisory locks y `SKIP LOCKED` requieren continuidad de sesión incompatible con transaction pooling.
8. **Autenticación SCRAM-SHA-256:** PG 17 impone SCRAM por defecto. Todo pooler debe configurar `AUTH_TYPE=scram-sha-256` explícitamente.
9. **Separación de Realms JWT (Admin ≠ Tenant):** El Admin API (`/admin/*`) NUNCA verifica tokens del realm de tenant. Los tokens de administración son emitidos por Appsmith y verificados por un plugin `@fastify/jwt` registrado con namespace `admin`, independiente del plugin de tenant. Algoritmo: RS256 o ES256. El realm de tenant (HS256) no tiene acceso a rutas `/admin/*`.
10. **Ops Console: Arquitectura Desacoplada Obligatoria:** El panel de administración es un cliente externo separado (SPA propietaria estática). El core Fastify expone un Admin API dedicado (`/admin/*`). Prohibido integrar lógica de rendering UI dentro del proceso Fastify. El Admin API usa un rol PostgreSQL separado (`jarvis_admin`) que bypasea RLS; jamás comparte el rol de tenant.
11. **Observabilidad Self-Hosted:** Pino → Loki → Grafana es el stack de observabilidad obligatorio. Prohibido enviar logs a servicios SaaS de terceros (Datadog, Axiom, Better Stack). Grafana con alerting proactivo. Uptime Kuma para synthetic checks HTTP/TCP.
12. **Prevención SPOF en Monitoreo (Observabilidad Externa):** El sistema de monitoreo de estado (Uptime Kuma) DEBE residir de forma independiente para evitar Puntos Únicos de Falla. En producción, debe alojarse en un VPS externo geográficamente o lógicamente separado del clúster principal de Jarvis. Prohibido integrarlo vía iframes o widgets embebidos dentro de la Ops Console.

> Note: Constraints logged here are defensively duplicated in `.agents/rules/05-constraints.md` to survive context degradation in long sessions.

---

## §5. Agreed Trade-offs

> Decisions where one quality was sacrificed in favor of another, with the explicit reason.

| Trade-off | In favor of | Against | Justification |
| --- | --- | --- | --- |
| Procesamiento diferido (Patrón Inbox) | Estabilidad IOPS Base de datos | Inserción síncrona inmediata | Proteger la base de datos de picos de sincronización offline masivos |
| pg-boss bypass del pooler | Integridad de advisory locks | Uniformidad de conexión | `SKIP LOCKED` requiere sesión persistente; transaction mode la destruye |
| postgres:17-alpine en sandbox | Compatibilidad Docker Compose | Paridad con Supabase gestionado | Imagen Supabase exige rol `supabase_admin` inexistente en standalone |
| MinIO community build | Operabilidad inmediata | Provenance criptográfica oficial | Build from source inviable sin acceso a proxy.golang.org en Docker |
| Caddy como edge proxy adicional | Routing multi-servicio + TLS automático | Simplicidad (solo kamal-proxy) | kamal-proxy no enruta por subdomain ni sirve estáticos; Caddy llena ese gap sin reemplazar Kamal |
| Loki + Grafana self-hosted | Soberanía de datos + alerting proactivo | Consumo de RAM en servidor | Prohibición explícita de enviar logs a SaaS de terceros. RAM calculada en sizing de producción |

---

## §6. Ops Console Architecture

> Patrón adoptado: **Arquitectura Desacoplada (Admin API + Cliente Externo)**

### Topología de red en producción

```
Internet
    └── Caddy (:443, TLS automático, Let's Encrypt)
            ├── api.jarvis.com      → kamal-proxy → Fastify containers (tenant API)
            └── admin.jarvis.com    → SPA estática (Admin UI)

SPA → Admin API (POST /admin/*, GET /admin/*)
         → Fastify verifica Admin JWT (RS256, namespace: admin)
         → jarvis_admin PG role (sin RLS, acceso total)
```

> **Contrato de Interfaz:** La SPA (y futuros clientes) consume el Core asumiendo estrictamente el contrato `specs/admin-api.yaml`. Specmatic audita el backend contra este contrato, garantizando que actualizaciones futuras no interrumpirán la operatividad visual.

### Roles de identidad

| Realm | Emisor | Algoritmo | Claims | Acceso |
|---|---|---|---|---|
| **Tenant** | Fastify core | HS256 | `{ tenant_id, sub, role }` | Rutas `/api/v1/*`, filtradas por RLS |
| **Admin** | CLI/Sistema externo | RS256/ES256 | `{ sub: operator_id, role: "super_admin" }` | Rutas `/admin/*`, rol PG `jarvis_admin` sin RLS |

### Rol PostgreSQL admin

- Rol: `jarvis_admin`
- Permisos: SELECT/INSERT/UPDATE/DELETE en todas las tablas operativas
- RLS: `BYPASSRLS` - cross-tenant visibility requerida para operaciones de gestión
- **Operaciones destructivas (DELETE, UPDATE masivo):** requieren confirmación explícita en la UI (widget de confirmación con texto de acción)

### Observabilidad

| Componente | Función | Transporte |
|---|---|---|
| Pino | Logging estructurado JSON en Fastify | stdout → Docker log driver |
| Loki | Aggregación de logs (single-binary mode) | pino-loki transport |
| Grafana | Dashboards + alerting proactivo | Consulta Loki + pg-boss metrics |
| Uptime Kuma | Synthetic HTTP/TCP checks | Independiente |
| `@pg-boss/dashboard` | Vista de colas de jobs | Montado en `/admin/jobs` vía SPA |

### Hoja de ruta del Admin UI

1. **MVP:** SPA Propietaria que consume el Admin API y provee una interfaz a medida, ágil y de alto rendimiento.

---

## §7. Module Specifications

> Technical detail of each module or critical system component.

### 7.1. WhatsApp Worker (Baileys)

**Purpose:** Orquestación aislada de WhatsApp sin bloquear el Event Loop de Fastify.

**Interface:**
```
Worker distribuido. Aislamiento vía Docker en Kamal 2.
```

**Dependencies:** Baileys, PostgreSQL (JSONB para AuthState), Kamal 2

**Runtime Configuration (validated Apr 2026):**
- `syncFullHistory: false` (previene bloqueo del Event Loop por descarga masiva de historial)
- `markOnlineOnConnect: false` (previene hang de presencia)
- `getMessage` dummy resolver (previene deadlock criptografico por hash no encontrado)
- Soporte para protocolo LID (`@lid`) adicionalmente a `@s.whatsapp.net`

### 7.2. Sync Inbox (pg-boss)

**Purpose:** Recepcion masiva de payloads offline (UUIDv7) de forma diferida.

**Interface:**
```
POST /api/v1/sync/inbox -> HTTP 202 Accepted
```

**Dependencies:** Fastify 5.8.5, pg-boss 12.x, PostgreSQL 17

### 7.3. Connection Pooler (PgBouncer)

**Purpose:** Multiplexar conexiones HTTP hacia PostgreSQL, emulando Supavisor de produccion.

**Topology:**
```
Fastify HTTP → PgBouncer :6543 (transaction mode) → PostgreSQL :5432
pg-boss     → PostgreSQL :5432 (directo, sin pooler)
```

**Dependencies:** edoburu/pgbouncer (Alpine), PostgreSQL 17

### 7.5. Multimedia Transduction Pipeline (Stub)

**Purpose:** Interceptar mensajes multimedia (audio, imagen) desde WhatsApp, almacenarlos en S3 y procesarlos asincronamente. En Fase 1, el procesamiento es un stub simulado. En produccion, se conecta a APIs de LLM (Whisper, GPT-4o, etc.).

**Data Flow:**
```
Baileys intercepta audioMessage/imageMessage
  → downloadMediaMessage (buffer)
  → PutObjectCommand a MinIO bucket jarvis-private
  → pg-boss.send('sync-inbox-process', { type, s3_url, sender })
  → Core Worker extrae payload, ejecuta stub de transcripcion/OCR
  → pg-boss.send('wapp-send-process', { to, text })
  → Baileys sock.sendMessage al remitente original
```

**Dependencies:** Baileys, @aws-sdk/client-s3, pg-boss 12.x, MinIO (jarvis-private bucket)

### 7.4. Fases de Ejecución

**FASE 1: Validación Local (Sandbox)**

Fase iterativa. No se cierra hasta la aprobación explícita del Arquitecto Principal (TASK-008).

- Orquestación en `localhost` con Docker Compose.
- PostgreSQL 17 vanilla (`postgres:17-alpine`). El schema y las políticas RLS son estrictamente idénticos al entorno de producción.
- PgBouncer (`edoburu/pgbouncer`) en transaction mode, puerto 6543→5432.
- MinIO S3 (`ghcr.io/coollabsio/minio`) como emulador de Supabase Storage.
- Fastify y Baileys aislados en procesos independientes.
- Atlas CLI para linting de migraciones contra el sandbox.
- Caddy como edge proxy local para routing de subdominios (emulación de topología de producción).
- UI Propietaria (SPA) consumiendo el Admin API de forma local.
- Loki (single-binary mode) + Grafana en Docker para validación del pipeline de observabilidad.
- Admin API (`/admin/*`) con JWT realm separado (RS256) y rol `jarvis_admin` sin RLS.
- Re-validación empírica de checks de infraestructura con K6 + xk6-dashboard.
- Doctrina de testing formalizada: Specmatic (contratos), Stryker (mutación), Testcontainers (integración), fast-check (propiedades), K6 (stress).

**FASE 2: MVP (Hipótesis Sujeta a Cambios)**
- Migración a Oracle ARM y Supabase Free Tier vía Kamal 2.
- PostgreSQL gestionado por Supabase (Supavisor reemplaza PgBouncer).
- Supabase Storage reemplaza MinIO.
- Caddy en producción con TLS automático (Let's Encrypt).
- SPA persistente conectada al Admin API.
- Uptime Kuma desplegado en VPS externo independiente para protección SPOF.

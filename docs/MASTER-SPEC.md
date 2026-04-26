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
[Client] → [Fastify HTTP Core] → [Supabase PostgreSQL (RLS)]
[Client] → (S3) [Supabase Storage]
[pg-boss Worker] ↔ [Supabase PostgreSQL (RLS)]
[WhatsApp Worker (Baileys / Kamal 2)] ↔ [Supabase PostgreSQL (RLS)]
```

**Main Data Flow:**

1. Cliente sincroniza datos offline vía UUIDv7 hacia Fastify Inbox.
2. Fastify inserta crudo en `sync_inbox` y retorna `202 Accepted`.
3. Worker `pg-boss` procesa el inbox inyectando transaccionalmente el `tenant_id` vía Supavisor.

---

## §3. Technical Stack

| Layer | Technology | Justification |
| --- | --- | --- |
| Frontend | TBD | Definido por instanciamiento |
| Backend | Fastify (Node.js) | Monolito Modular, VSA |
| Data | PostgreSQL (Supabase) | Única fuente de verdad. Transaccionalidad, TSVECTOR, JSONB |
| Queue | pg-boss | Sincronización asíncrona dentro de PostgreSQL |
| Hosting | Oracle Cloud ARM | Stateless, bajo costo. Despliegue con Kamal 2 y kamal-proxy |
| Storage | Supabase Storage (S3) | Prohibido almacenar binarios en DB relacional |

---

## §4. Constraints (Inviolable Boundaries)

> These constraints override any other decision. They are the lines that must not be crossed.

1. **Singularidad de Estado:** PostgreSQL es la única base de datos. Redis, MongoDB, vector DBs prohibidas.
2. **GitOps Imperativo:** Uso de CLI cruda y logs. Prohibido Dokploy, Coolify, Traefik. Solo Kamal 2 + kamal-proxy.
3. **Criptografía Baileys Aislada:** Worker debe operar fuera del HTTP Core y guardar llaves en PG JSONB. Uso de `fs` prohibido.
4. **UUIDv7 Obligatorio:** Auto-incrementales y UUIDv4 prohibidos para asegurar ordenamiento cronológico absoluto.
5. **Aislamiento Multi-Tenant (RLS):** Uso de variables locales para inyección RLS (`SET LOCAL request.jwt.claims ...`). Inyección global prohibida. Uso de Transaction Pooling en Supavisor obligatorio.
6. **Migraciones Declarativas:** Atlas (Ariga) obligatorio. ORMs manuales prohibidos. Operaciones destructivas bloqueadas por linter `sqlcheck`.

> Note: Constraints logged here are defensively duplicated in `.agents/rules/05-constraints.md` to survive context degradation in long sessions.

---

## §5. Agreed Trade-offs

> Decisions where one quality was sacrificed in favor of another, with the explicit reason.

| Trade-off | In favor of | Against | Justification |
| --- | --- | --- | --- |
| Procesamiento diferido (Patrón Inbox) | Estabilidad IOPS Base de datos | Inserción síncrona inmediata | Proteger la base de datos de picos de sincronización offline masivos |

---

## §6. UI and User Experience

**Reference atmosphere:** TBD

**Main user flow:** TBD

**Interface components:**

| Component | Function | File |
| --- | --- | --- |
| TBD | TBD | TBD |

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

### 7.2. Sync Inbox (pg-boss)

**Purpose:** Recepción masiva de payloads offline (UUIDv7) de forma diferida.

**Interface:**
```
POST /sync_inbox -> HTTP 202 Accepted
```

**Dependencies:** Fastify, pg-boss, PostgreSQL

### 7.3. Fases de Ejecución

**FASE 1: Validación Local (Sandbox)**
- Orquestación en `localhost` con Docker Compose.
- Emuladores de Supabase y S3.
- Fastify y Baileys aislados.

**FASE 2: MVP (Hipótesis Sujeta a Cambios)**
- Migración a Oracle ARM y Supabase Free Tier vía Kamal 2.

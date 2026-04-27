# CONSTITUCIÓN DEL SISTEMA: SaaS VERTICAL MULTI-TENANT (Estándar 2026)

> PRD y Arquitectura Maestra.
> Gobernanza: Spec-Driven Development (SDD) vía Framework Kairós.
> Estado: Aprobado.

Los agentes operando en este repositorio acatarán estrictamente estas directrices.

---

## 1. AXIOMAS ARQUITECTÓNICOS

1.  **Monolito Modular:** Backend central en **Fastify (Node.js)**. Arquitectura de Slices Verticales (VSA) y Patrón Microkernel. Microservicios distribuidos prohibidos.
2.  **Singularidad del Estado:** **PostgreSQL (Supabase)** es la única fuente de verdad. Redis, MongoDB y bases vectoriales externas están prohibidas. Enrutamiento asíncrono (`pg-boss`), búsqueda (`TSVECTOR`) y estado dinámico (`JSONB`) residen exclusivamente en Postgres.
3.  **GitOps Declarativo Imperativo:** Infraestructura gestionada vía CLI cruda y logs. Interfaces PaaS visuales (Dokploy, Coolify) prohibidas.
4.  **Almacenamiento de Binarios:** Archivos pesados (imágenes, PDFs, Base64, BYTEA) prohibidos en PostgreSQL. Deben almacenarse en **Supabase Storage** (S3). La base de datos relacional almacena únicamente la URL de referencia.

---

## 2. TOPOLOGÍA DE NEGOCIO Y PLUGINS

El sistema opera como plataforma genérica con instancias modulares aisladas.
*   **Core Genérico:** Identidad, autenticación, base de datos multi-tenant, notificaciones push, facturación.
*   **Módulo Contratista (Plugin A):** Lógica de Tracking GPS en terreno y gestión de cuadrillas.
*   **Módulo Clínico (Plugin B):** Orquestación de pacientes y tratamientos interdisciplinarios.

### Aislamiento de Canales I/O (Arquitectura Hexagonal)
Los canales de comunicación (WhatsApp, Telegram, Email, Slack) operan estrictamente como adaptadores externos. Desde la perspectiva del Core (el núcleo del sistema), son agnósticos e intercambiables. 
*   **Despliegue:** Workers dockerizados aislados (ej. `baileys-worker`) vía **Kamal 2**. No comparten el proceso ni el Event Loop del Core HTTP.
*   **Contrato de Interfaz:** Los workers traducen sus protocolos nativos (ej. WhatsApp LID `@lid`) a payloads agnósticos que se inyectan transaccionalmente en la base de datos o en colas genéricas de `pg-boss` (`sync-inbox-process`, `notification-send-process`).
*   **Persistencia de Sesiones Externas:** Adaptadores como `usePgAuthState` guardan llaves criptográficas en PostgreSQL (`JSONB`). Uso del sistema de archivos local (`fs`) estrictamente prohibido.

---

## 3. SINCRONIZACIÓN OFFLINE Y PATRÓN INBOX

*   **Resolución Cronológica (UUIDv7):** `UUIDv4` y auto-incrementales prohibidos. Uso obligatorio de **UUIDv7** generado en el cliente. Garantiza ordenamiento cronológico absoluto (Last-Write-Wins) para resolver conflictos offline independientemente del reloj del servidor.
*   **Patrón Inbox:** Fastify no inserta cargas masivas de sincronización de forma síncrona. Valida el payload contra JSON Schema, lo inserta crudo en `sync_inbox` y retorna `202 Accepted`. Un worker de `pg-boss` procesa el inbox en segundo plano a ritmo constante para proteger los IOPS de la base de datos.
*   **Transducción Multimedia:** Los archivos binarios interceptados por los adaptadores (ej. notas de voz o imágenes) se suben directamente a S3. Solo el URI referencial (`s3_url`) cruza hacia el Core vía `pg-boss` para su transcripción asíncrona (ej. OCR/Whisper stubs).

---

## 4. CONTEXTO MULTI-TENANT EN COLAS

El aislamiento de datos se gestiona vía Row-Level Security (RLS). Los workers asíncronos de `pg-boss` operan fuera del ciclo HTTP y carecen de JWT.
*   **Encolado:** Todo payload asíncrono debe incluir explícitamente el `tenant_id`.
*   **Consumo:** El worker extrae el `tenant_id` y lo inyecta transaccionalmente en la sesión de base de datos antes de ejecutar consultas.

---

## 5. INFRAESTRUCTURA HÍBRIDA Y GITOPS

*   **Cómputo Stateless:** Oracle Cloud ARM Free Tier (CPU y RAM). Sin estado persistente.
*   **Estado Managed:** Supabase Free Tier / Pro. Tareas de DBA y Backups delegadas.

### Orquestación
Despliegue puramente imperativo vía **Kamal 2**, utilizando **kamal-proxy** para zero-downtime rolling restart de contenedores de aplicación. **Caddy** como edge proxy para routing de subdominios (`api.`, `admin.`), TLS automático y static file serving. Traefik y plataformas PaaS prohibidas.

### Telemetría y Observabilidad
- **Logging:** Pino (structured JSON) → Loki (single-binary, self-hosted) → Grafana (dashboards + alerting proactivo).
- **Synthetic checks:** Uptime Kuma para verificación HTTP/TCP periódica.
- **CLI auxiliar:** `mpstat`, `vnstat` como herramientas de auditoría manual complementaria.
- **SaaS prohibido:** Envío de logs a servicios de terceros (Datadog, Axiom, Better Stack) prohibido.

### Ops Console (Appsmith)
- **Tecnología**: Appsmith (Community Edition).
- **Rol**: Panel de control visual aislado, no expuesto al internet público.
- **Protocolo de Conexión**: Appsmith consume la API de Administración (`/admin/*`) autenticándose obligatoriamente vía JWT asimétrico (RS256) (`ADMIN_JWT_PRIVATE_KEY`).
- **Declaratividad GitOps**: El estado de la interfaz gráfica y los bindings de datos se han consolidado como código en `infrastructure/appsmith/jarvis-ops-console.json`. En caso de destrucción del volumen Docker o migración de infraestructura, la consola se recupera de manera determinista importando este archivo JSON, eliminando la necesidad de reconstrucción manual o dependencia total en la base de datos interna de Appsmith.

---

## 6. TRANSACTION POOLING Y SEGURIDAD RLS

*   Conexión obligatoria a través de enrutador en modo **Transaction Pooling** (PgBouncer en sandbox local; Supavisor en producción). Se exige autenticación **SCRAM-SHA-256** para compatibilidad con PostgreSQL 17.
*   **Excepción pg-boss:** Los workers asíncronos (`pg-boss`) **DEBEN conectarse directamente** a la base de datos (puerto 5432) sorteando el pooler. El uso de `SELECT FOR UPDATE SKIP LOCKED` exige continuidad de sesión, incompatible con Transaction Pooling.
*   **Inyección RLS:** La inyección global de variables causa fuga masiva de datos entre inquilinos cruzados al reciclar conexiones de red. Toda inyección RLS debe usar variables locales.

**Sintaxis SQL exigida para inyección:**
```sql
BEGIN;
SELECT set_config('request.jwt.claims.tenant_id', '...', true); -- (Formato PG Local)
-- <query_de_negocio>;
COMMIT;
```

---

## 7. MIGRACIONES DE ESQUEMA

*   ORMs intrusivos para generación manual de migraciones están prohibidos.
*   Uso obligatorio de **Atlas (Ariga)** para definición declarativa (*Schema-as-Code*).
*   El linter (`sqlcheck`) debe estar configurado para abortar operaciones destructivas (ej. `DROP COLUMN`) o bloqueos de escritura (creación de índices sin `CONCURRENTLY`).

---

## 8. FASES DE EJECUCIÓN Y DESPLIEGUE

La materialización sigue un orden cronológico estricto para aislamiento de riesgos.

*   **FASE 1: Validación Local (Sandbox)**
    *   **Orquestación:** Fastify, Baileys, PostgreSQL oficial y emuladores locales (S3/Auth) levantados vía **Docker Compose** en `localhost`.
    *   **Expansión arquitectónica:** Caddy (edge proxy), Appsmith Community (Ops Console), Loki + Grafana (observabilidad), Admin API (`/admin/*`) con JWT realm separado (RS256) y rol `jarvis_admin`.
    *   **Doctrina de testing:** Specmatic (contratos OpenAPI), Stryker (mutación), Testcontainers (integración), fast-check (propiedades), K6 + xk6-dashboard (stress).
    *   **Condición de Avance:** Aprobación manual del Arquitecto Principal tras auditar seguridad RLS, sincronización offline, contratos (Specmatic) y re-validación empírica de checks de infraestructura. Despliegues externos bloqueados durante esta fase.
*   **FASE 2: MVP (Hipótesis Sujeta a Cambios)**
    *   **Infraestructura:** Despliegue hacia Oracle ARM, Kamal 2, Caddy con TLS automático (Let's Encrypt) y Supabase Free Tier.
    *   **Ops Console:** Appsmith persistente con volúmenes Docker en servidor de producción.
    *   Las definiciones de la Fase 2 están sujetas a modificación en base a los hallazgos y fricciones técnicas detectadas durante la Fase 1. La decisión final se bloquea al concluir la validación local.

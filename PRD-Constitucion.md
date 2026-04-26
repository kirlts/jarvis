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

### Aislamiento de WhatsApp (Baileys)
La criptografía de Baileys bloquea el Event Loop de Fastify.
*   **Despliegue:** Worker dockerizado aislado vía **Kamal 2**. No comparte el proceso del Core HTTP.
*   **Persistencia de Sesión:** Adaptador `AuthState` personalizado. Las llaves criptográficas se guardan en PostgreSQL (`JSONB`). Uso del sistema de archivos local (`fs`) estrictamente prohibido.

---

## 3. SINCRONIZACIÓN OFFLINE Y PATRÓN INBOX

*   **Resolución Cronológica (UUIDv7):** `UUIDv4` y auto-incrementales prohibidos. Uso obligatorio de **UUIDv7** generado en el cliente. Garantiza ordenamiento cronológico absoluto (Last-Write-Wins) para resolver conflictos offline independientemente del reloj del servidor.
*   **Patrón Inbox:** Fastify no inserta cargas masivas de sincronización de forma síncrona. Valida el payload contra JSON Schema, lo inserta crudo en `sync_inbox` y retorna `202 Accepted`. Un worker de `pg-boss` procesa el inbox en segundo plano a ritmo constante para proteger los IOPS de la base de datos.

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
Despliegue puramente imperativo vía **Kamal 2**, utilizando exclusivamente **kamal-proxy**. Traefik y alternativas prohibidas.

### Telemetría
Lectura de flujos CLI crudos (`mpstat`, `vnstat`) para auditar límites físicos (CPU Steal Time, IOPS) bajo tráfico real.

---

## 6. TRANSACTION POOLING Y SEGURIDAD RLS

*   Conexión obligatoria a través de **Supavisor** (enrutador oficial de Supabase) operando en modo **Transaction Pooling**. PgBouncer prohibido.
*   **Inyección RLS:** La inyección global de variables causa fuga masiva de datos entre inquilinos cruzados al reciclar conexiones de red. Toda inyección RLS debe usar variables locales.

**Sintaxis SQL exigida para inyección:**
```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"tenant_id":"..."}';
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
    *   **Condición de Avance:** Aprobación manual del Arquitecto Principal tras auditar seguridad RLS, sincronización offline y contratos (Pact). Despliegues externos bloqueados durante esta fase.
*   **FASE 2: MVP (Hipótesis Sujeta a Cambios)**
    *   **Infraestructura:** Despliegue hacia Oracle ARM, Kamal 2 y Supabase Free Tier.
    *   Las definiciones de la Fase 2 están sujetas a modificación en base a los hallazgos y fricciones técnicas detectadas durante la Fase 1. La decisión final se bloquea al concluir la validación local.

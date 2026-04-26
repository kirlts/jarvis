# CONSTITUCIÓN DEL SISTEMA: SaaS VERTICAL MULTI-TENANT (Estándar 2026)

> **Documento de Requisitos de Producto (PRD) y Arquitectura Maestra.**  
> **Gobernanza:** Spec-Driven Development (SDD) vía Framework Kairós.  
> **Estado:** Aprobado - *Single Source of Truth*.

Este documento constituye la ley matemática y filosófica del sistema. Los Agentes de IA que operen sobre este repositorio tienen estrictamente prohibido desviar la implementación de los dogmas aquí declarados.

---

## 1. PREÁMBULO Y DOGMA ARQUITECTÓNICO (LOS AXIOMAS)

La estabilidad a largo plazo del sistema depende de la adherencia absoluta a los siguientes cuatro axiomas. Cualquier refactorización o propuesta que los viole será automáticamente rechazada por el pipeline de CI/CD.

*   **AXIOMA 1: Monolito Modular Orientado a IA.** El backend central está escrito exclusivamente en **Fastify (Node.js)** bajo una estricta **Arquitectura de Slices Verticales (VSA)** y el **Patrón Microkernel**. Se descartan las arquitecturas de microservicios distribuidos y los patrones de capas (MVC/Hexagonal puro) para preservar y maximizar la ventana de contexto de la IA.
*   **AXIOMA 2: Singularidad del Estado.** **PostgreSQL Gestionado (Supabase)** es la única y absoluta fuente de la verdad. Queda prohibida la introducción de Redis, MongoDB, Elasticsearch o bases de datos vectoriales externas. Todo enrutamiento de trabajos asíncronos (`pg-boss`), búsqueda y estado JSON reside en Postgres.
*   **AXIOMA 3: GitOps Declarativo Imperativo.** La infraestructura se gestiona exclusivamente a través de CLI cruda y logs parseables. Las interfaces gráficas opacas de PaaS (Dokploy, Coolify) están prohibidas por cegar la observabilidad de los agentes autónomos.
*   **AXIOMA 4: Almacenamiento de Binarios.** Queda **estrictamente prohibido** guardar archivos binarios (imágenes de terreno, PDFs médicos, cadenas Base64 o columnas BYTEA) en PostgreSQL para no inflar el almacenamiento transaccional ni degradar el rendimiento (IOPS). Todo archivo pesado debe subirse a **Supabase Storage** (Buckets compatibles con S3). La base de datos relacional almacenará única y exclusivamente la URL pública/privada de referencia del archivo.

---

## 2. TOPOLOGÍA DEL NEGOCIO Y AISLAMIENTO DE PLUGINS

El sistema debe operar como una plataforma genérica invisible, proveyendo instancias modulares (Plugins) que hagan creer a los clientes finales que poseen una "solución 100% a medida".
*   **Core Genérico:** Maneja identidad, autenticación, base de datos multi-tenant, notificaciones push, y facturación.
*   **Módulo Contratista (Plugin A):** Lógica específica de Tracking GPS en terreno y gestión de cuadrillas de limpieza/reparación.
*   **Módulo Clínico (Plugin B):** Lógica de orquestación de pacientes e historial clínico interdisciplinario para terapias de 3 a 6 meses.

### Aislamiento del Módulo WhatsApp
Node.js es *Single-Threaded*. La pesada criptografía del protocolo Signal requerida por la librería **Baileys** bloqueará catastróficamente el Event Loop de Fastify si conviven en el mismo proceso.
*   **Regla de Despliegue:** El Módulo de WhatsApp NO compartirá el proceso de ejecución del Core HTTP. Se desplegará a través de **Kamal 2** como un Worker Dockerizado y totalmente aislado.
*   **Persistencia de Sesión Criptográfica:** Dado que Kamal 2 opera con contenedores inmutables, la IA debe programar un adaptador `AuthState` personalizado para Baileys. Este adaptador guardará el estado de las claves criptográficas directamente en una tabla `JSONB` de Postgres. **Se prohíbe el uso del sistema de archivos local (`fs`) para almacenar sesiones de WhatsApp.**

---

## 3. RESOLUCIÓN OFFLINE, TSUNAMI DE DATOS Y PATRÓN INBOX

El sistema dará soporte a clientes en terrenos sin cobertura (ej. contratistas en sótanos, médicos en zonas rurales), enfrentándose a ráfagas masivas de sincronización cuando la red regrese.

### Resolución Cronológica (UUIDv7)
*   Queda **prohibido** el uso de `UUIDv4` o identificadores auto-incrementales en las entidades de negocio. 
*   Todas las entidades usarán obligatoriamente **UUIDv7** generado en el dispositivo móvil del cliente. Al incorporar de forma nativa el *timestamp Unix*, UUIDv7 garantiza un orden cronológico estricto basado en tiempo, permitiendo una resolución de conflictos offline bajo el modelo *Last-Write-Wins*, sin depender de la hora del servidor y mejorando masivamente el rendimiento de los índices B-Tree de Postgres.

### El Patrón Inbox (Protección de IOPS)
Ante el reingreso a la red, el dispositivo cliente enviará un "tsunami" de acciones cacheadas en local.
*   El Core Fastify **jamás** insertará relacionalmente un lote masivo de sincronización offline de forma síncrona.
*   El servidor simplemente validará el payload contra un *JSON Schema* estricto y volcará el payload crudo en una tabla `sync_inbox` de Postgres. Acto seguido, Fastify retornará inmediatamente un código HTTP `202 Accepted` a la app móvil.
*   Un *background worker* de **pg-boss** extraerá y procesará de forma asíncrona la tabla Inbox a un ritmo constante, drenando la sincronización de manera ordenada para proteger y no saturar los límites de IOPS de la base de datos gestionada.

---

## 4. CONTEXTO MULTI-TENANT Y SEGURIDAD RLS EN COLAS

El sistema consolida la información de la Médica y el Contratista en las mismas tablas mediante un esquema compartido, segregado criptográficamente por Políticas de Seguridad a Nivel de Fila (RLS). 

Dado que el motor de colas (`pg-boss`) opera en segundo plano y fuera del ciclo de vida HTTP normal de Fastify, carece del token JWT del usuario final.
*   **Regla de Encolado:** Todo trabajo encolado asíncronamente DEBE incluir el `tenant_id` en su payload.
*   **Regla de Consumo (Inyección de RLS):** Los workers que procesan las colas en segundo plano deben extraer el ID de inquilino del payload del job e inyectarlo transaccionalmente en la sesión de la base de datos antes de operar; de lo contrario, las políticas RLS denegarán invisiblemente el acceso.

---

## 5. INFRAESTRUCTURA HÍBRIDA Y ORQUESTACIÓN (GITOPS 2026)

Para proteger al Solo-Dev de los *pricing cliffs* de plataformas PaaS puras, la arquitectura divide responsabilidades:
*   **Cómputo Stateless (Oracle Cloud ARM Free Tier):** Procesa exclusivamente la CPU y RAM. Sin estado persistente.
*   **Estado Managed (Supabase Free Tier / Pro):** Delega las tareas de DBA, Backups y Disponibilidad al proveedor gestionado.

### Orquestación GitOps
*   El despliegue se gestiona de forma puramente imperativa vía **Kamal 2**. 
*   Kamal 2 opera con cero-downtime utilizando exclusivamente su proxy nativo de capa 4/7: **kamal-proxy**. Toda mención o intento de configuración con *Traefik* queda descartada del sistema.

### Telemetría Autónoma
La IA debe leer flujos de texto de `mpstat` (para medir *CPU Steal Time*) y `vnstat` (uso de red) para alertar antes de alcanzar el colapso operativo del Free Tier (ej. agotamiento de los 3,000 IOPS o estrangulamiento de CPU).

---

## 6. SEGURIDAD RLS Y TRANSACTION POOLING EN SUPABASE

Los Free Tiers relacionales sufren de un límite duro de conexiones físicas (50-100 conexiones). Fastify y el ecosistema Node.js pueden abrir miles de conexiones y colapsar la base de datos.
*   Para mitigar esto, el sistema se conectará **obligatoriamente a través de Supavisor** (el enrutador y pooler oficial de Supabase), operando estrictamente en modo **Transaction Pooling**. Toda mención antigua a PgBouncer queda descartada.

### ALERTA CRÍTICA: Fuga de Datos en RLS
En el modo *Transaction Pooling*, inyectar variables de contexto (como el `tenant_id`) de forma global causa **fugas de datos masivas y catastróficas** entre inquilinos cruzados, ya que las conexiones de red físicas se reutilizan entre diferentes clientes HTTP.

*   Toda inyección de contexto RLS DEBE envolverse estrictamente en una transacción explícita usando variables temporales y locales a la transacción. 
*   **El uso de la orden `SET` global está terminantemente prohibido.**

**Sintaxis SQL Exigida Literalmente para Inyección RLS:**
```sql
BEGIN;
SET LOCAL request.jwt.claims = '{"tenant_id":"..."}';
-- <query_de_negocio>;
COMMIT;
```

---

## 7. EVOLUCIÓN DEL ESQUEMA Y MIGRACIONES (DECLARATIVE)

*   Se prohíben los ORMs intrusivos para generar scripts de migración manuales asíncronos y propensos a error en entornos multi-tenant.
*   Se utilizará **Atlas (Ariga)**. La IA definirá el esquema final de forma declarativa (*Schema-as-Code*).
*   El linting de Atlas (`sqlcheck`) está configurado para bloquear y abortar migraciones destructivas (DROP COLUMN) o migraciones que bloqueen la escritura en tablas de producción (como crear índices sin usar la sintaxis `CONCURRENTLY`).

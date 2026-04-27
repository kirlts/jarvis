# USER-DECISIONS: Human Agency Record

> This document IS NOT A CHANGELOG. It is the register of user sovereignty.
> It captures the strategic "why" and the explicit intentions that the user communicates.

| Symbol | Meaning |
|---|---|
| 💡 | Strategic user decision |
| 🔗 | Traceable cross-reference to `.HUM` checks |

---

<!--
INPUT FORMAT (Adapted ADR, 5 mandatory fields):

## [UD-NNN] Decision Title

**Date:** YYYY-MM-DD
**Context:** [Situation that motivated the decision]
**Decision:** [What the user decided and why]
**Discarded alternatives:**
- [Alternative 1 and why it was discarded]
**Consequences:**
- [Project impact, accepted tradeoffs]
**Reversion conditions:** [Under what circumstances this decision would be reverted]

RULES:
- The AI drafts based on chat literality.
- The user confirms with "ok" or similar BEFORE saving.
- Every high reversibility-cost decision MUST be logged here.
-->

## [UD-001] Ejecutar auditoría de dependencias via Deep Research antes de implementar

**Date:** 2026-04-26
**Context:** El stack tecnologico de Jarvis estaba definido en el MASTER-SPEC con versiones genericas. El usuario solicito un informe exhaustivo de versiones estables a abril 2026 mediante Gemini Deep Research antes de escribir codigo.
**Decision:** Generar una prompt para Deep Research que investigue versiones, registros de contenedores, y compatibilidad ARM64/x86_64 de cada elemento del stack. Los resultados del informe son la fuente de verdad para pinear versiones.
**Discarded alternatives:**
- Investigar manualmente cada dependencia (demasiado lento, propenso a omisiones)
- Usar versiones "latest" sin pinear (incompatible con reproducibilidad)
**Consequences:**
- Se descubrio que MinIO, Bitnami y Supabase PG cambiaron de modelo de distribucion
- Se identifico la necesidad de conexion directa para pg-boss (no pooler)
- Todas las versiones del stack quedaron pineadas en `package.json` y `docker-compose.yml`
**Reversion conditions:** Si una version pineada presenta CVEs criticos o incompatibilidades con Oracle ARM64 en produccion

## [UD-002] Delegar linting de Atlas a GitHub Actions

**Date:** 2026-04-26
**Context:** Atlas CLI a partir de la versión v0.38 movió el comando `atlas migrate lint` detrás de un muro de autenticación (Atlas Pro). Sin embargo, el MASTER-SPEC (Constraint 6) requiere obligatoriamente Atlas v1.2.0.
**Decision:** Configurar un pipeline de GitHub Actions (`.github/workflows/atlas-ci.yml`) para la validación de migraciones destructivas (`DROP COLUMN`, índices síncronos) en la etapa de PR, manteniendo el entorno local libre de logins.
**Discarded alternatives:**
- Retroceder a la versión v0.37 o anterior (rechazado por introducir deuda técnica y violar el MASTER-SPEC).
- Forzar un `atlas login` manual para cada desarrollador (fricción local innecesaria).
- Cambiar la herramienta de linting por Squawk (viola Constraint 6 y añade herramientas redundantes).
**Consequences:**
- Cumplimiento de la versión v1.2.0 sin necesidad de autenticación local.
- Las validaciones destructivas se delegan al pipeline CI, bloqueando PRs riesgosos.
**Reversion conditions:** Si el modelo de distribución de Ariga elimina la funcionalidad gratuita en GitHub Actions, exigiendo un token comercial.

## [UD-003] Ops Console: Arquitectura Desacoplada con Appsmith como MVP

**Date:** 2026-04-26
**Context:** El monólogo del 2026-04-26 planteó la pregunta de si el panel de administración (monitoreo de tenants, gestión de jobs, estado WhatsApp) pertenece al core o a la capa de personalización. Dos informes Deep Research analizaron 7 plataformas de referencia (Clerk, WorkOS, Vendure, Nango, Medusa, Payload, Strapi).
**Decision:** [REVERTIDA VER UD-007] Arquitectura Desacoplada: el core Fastify expone un Admin API dedicado (`/admin/*`). Un cliente separado (SPA propietaria estática) consume ese API. La decisión original de usar Appsmith fue revertida.
**Discarded alternatives:**
- Pattern A (built-in al core): contamina el event loop de Fastify con rendering de UI; impide reemplazar el frontend sin tocar el backend.
- Pattern B (plugin): sigue ejecutándose en el proceso Fastify; mismas limitaciones de acoplamiento.
- SPA propietaria desde el día 1: meses de desarrollo vs. horas con Appsmith; el Admin API es el contrato estable.
**Consequences:**
- El MASTER-SPEC §6 está definido. El Admin API se implementa y valida dentro de Fase 1 (sandbox local).
- Caddy entra al stack como edge proxy para routing de subdominios (`api.`, `admin.`).
- La SPA se despliega de manera independiente o vía Caddy.
**Reversion conditions:** Ninguna. La migración a SPA propietaria es final.

## [UD-004] Observabilidad Self-Hosted: Loki + Grafana obligatorios

**Date:** 2026-04-26
**Context:** Se evaluaron tres opciones para la capa de observabilidad: (A) Pino → archivo JSON (zero infra), (B) Pino → Loki → Grafana self-hosted, (C) servicio SaaS externo (Axiom, Better Stack). El constraint de soberanía de datos y la necesidad de alertas proactivas ante incidentes multi-tenant a las 3am fueron los factores decisivos.
**Decision:** Pino → Loki (single-binary mode) → Grafana self-hosted. Prohibición explícita de enviar logs a servicios SaaS de terceros. Grafana con alerting proactivo. Uptime Kuma para synthetic checks. Dimensionamiento de RAM de producción se calculará antes de deploy.
**Discarded alternatives:**
- Archivo JSON solo: sin alertas proactivas; inviable para gestión de 100+ tenants.
- SaaS (Axiom, Better Stack): violación del principio de soberanía de datos del proyecto.
**Consequences:**
- Loki y Grafana se agregan al stack en §3 del MASTER-SPEC.
- El sizing de Oracle Cloud ARM debe incluir el overhead de Loki+Grafana (~300-500MB RAM adicionales).
- `pino-loki` transport se añade como dependencia dentro de Fase 1 (sandbox local).
**Reversion conditions:** Si el sizing de producción demuestra que Loki+Grafana consumen RAM que impide escalar los servicios core, se migra a modo archivo JSON con revisión periódica.

## [UD-005] Admin JWT: Emitido por Appsmith, rol jarvis_admin sin RLS

**Date:** 2026-04-26
**Context:** La arquitectura desacoplada requiere un mecanismo de autenticación para el Admin API que sea criptográficamente separado del realm de tenants. Originalmente Appsmith emitía el JWT. Ahora se utilizará un mecanismo de backend o CLI que emita el JWT asimétrico para ser consumido por la SPA.
**Decision:** Opción modificada: El Admin JWT será emitido por un script/backend de administración y provisto a la SPA. Fastify verifica el JWT con un plugin `@fastify/jwt` en namespace `admin`, separado del plugin de tenant (HS256). Algoritmo: RS256 o ES256. El rol PostgreSQL `jarvis_admin` tiene `BYPASSRLS` para visibilidad cross-tenant. Operaciones destructivas requieren confirmación explícita en la SPA. Scope único `super_admin` por ahora.
**Discarded alternatives:**
- CLI local (opción A): más operativo pero desacopla la autenticación de la UI; innecesariamente complejo para escala inicial.
- IdP externo (opción B): over-engineering para un solo operador; introduce dependencia externa de autenticación.
- Scopes granulares desde el inicio: reservado para cuando el operador delegue operaciones a terceros.
**Consequences:**
- El MASTER-SPEC §4.9 documenta la separación de realms como Constraint Inviolable.
- El rol `jarvis_admin` se crea como migración Atlas dentro de Fase 1 (sandbox local).
- Fastify necesita dos plugins JWT registrados con namespaces distintos.
**Reversion conditions:** Si Appsmith abandona la capacidad de emitir JWTs propios, migrar a opción A (CLI) manteniendo el mismo Admin API y el mismo rol PG.

## [UD-006] Aislamiento Físico y Lógico de Uptime Kuma (Prevención SPOF)

**Date:** 2026-04-27
**Context:** Hubo ambigüedad sobre cómo el Superadmin interactuaría con Uptime Kuma. Integrar el monitor dentro del panel operativo crea un Punto Único de Falla (SPOF): si el servidor colapsa, el operador pierde el monitor justo cuando más lo necesita.
**Decision:** Uptime Kuma operará como una entidad de radar completamente independiente. En Fase 1 (Sandbox) corre en un puerto separado (`:3002`). En Fase 2/Producción, DEBE residir en un VPS externo geográficamente o lógicamente separado del clúster de Jarvis (ej. VPS de $4/mes) bajo un subdominio propio (`status.dominio.com`). La SPA solo contendrá un hipervínculo saliente ("Status Page").
**Discarded alternatives:**
- Integración vía iframe/widget en SPA: rechazado categóricamente por crear un SPOF (ceguera del observador).
- Hosting en el mismo VPS de producción que Jarvis: rechazado, una falla a nivel de hypervisor apaga la alarma y el sistema simultáneamente.
**Consequences:**
- La arquitectura gana resiliencia ante caídas catastróficas del datacenter principal.
- Actúa como una página de estado (Status Page) pública u operable por el B2B client para validar el SLA.
**Reversion conditions:** Imposibilidad financiera extrema para costear un VPS de $4, forzando la co-ubicación en el mismo servidor (con aceptación explícita del riesgo de SPOF).

## [UD-007] Abandono de Appsmith en favor de SPA propietaria

**Date:** 2026-04-27
**Context:** Problemas de experiencia de desarrollador con Appsmith (creación manual de usuarios en cold starts, inyección repetitiva de credenciales, hermetismo en configuraciones y fricción en la creación de vistas maestras de monitoreo). Estos síntomas sugieren que Appsmith se comporta como servicio pagado disfrazado de open source.
**Decision:** Eliminar por completo a Appsmith del ecosistema de Jarvis y revocar las decisiones previas que dependían de él (UD-003, parcialmente UD-005). La interfaz de administración se construirá como una Single Page Application (SPA) propietaria pura que consumirá los endpoints del Admin API (`/admin/*`) de Jarvis. Jarvis actúa como el backend definitivo delegando la renderización visual a un frontend ligero y sin las ataduras de un entorno low-code opaco.
**Discarded alternatives:**
- Continuar peleando contra la configuración de Appsmith (perdida de tiempo productivo en cosas de bajo nivel).
- Retool u otras alternativas PaaS low-code (mismos problemas de hermetismo y vendor lock-in).
**Consequences:**
- Se han purgado los manifiestos declarativos y scripts de provisionamiento asociados a Appsmith en `infrastructure` y `scripts`.
- El flujo local (sandbox) es más ágil.
- Se debe desarrollar una UI estática (SPA) a futuro para visualizar métricas, crear tenants y manipular Jarvis.
**Reversion conditions:** Ninguna. La decisión asienta el camino definitivo para interfaces de operaciones en Jarvis.

## [UD-008] Expansión del Admin API antes de construir frontend Refine

**Date:** 2026-04-27
**Context:** El contrato actual (`specs/admin-api.yaml`) solo expone 4 operaciones: GET /admin/tenants (listado plano), GET /admin/jobs (100 jobs hardcoded), GET /admin/whatsapp/status, y DELETE /admin/tenants/:id. No existe endpoint para crear ni editar tenants. No hay paginación ni filtros. Construir una SPA sobre un contrato incompleto genera re-trabajo en cascada (spec → backend → dataProvider → vistas) cada vez que el contrato crezca.
**Decision:** Expandir el Admin API **antes** de iniciar la implementación de Refine. Los nuevos endpoints son: POST /admin/tenants (crear), PATCH /admin/tenants/:id (editar), GET /admin/tenants/:id (detalle), paginación (?page, ?limit con max 100) en GET /admin/tenants, y filtros (?state, ?tenant_id, ?limit) en GET /admin/jobs. Cada endpoint nuevo debe cumplir el mismo estándar de seguridad (401/403 para JWT inválido, schema validation estricta, unique constraints con 409). La spec OpenAPI debe actualizarse primero y validarse con Specmatic para prevenir regresiones de contrato.
**Discarded alternatives:**
- Construir Refine con el contrato actual y expandir después: rechazado por la cascada de re-trabajo predecible.
- Agregar GET /admin/stats (dashboard de resumen): diferido a iteración posterior; no es bloqueante para las vistas CRUD básicas.
- Gestión de API keys de plugins: diferido a Fase 2; no existe esquema SQL ni definición en el PRD actual.
**Consequences:**
- TASK-019 creada en TODO.md con 18 checks nuevos y dependencia directa de TASK-015 (dataProvider) y TASK-016 (vistas).
- VERIFICATION.md expandido: actor ADMIN pasa de 14 a 32 checks.
- `specs/admin-api.yaml` debe actualizarse como primer paso de TASK-019 (contract-first).
- La secuencia de ejecución es: TASK-019 → TASK-011 → TASK-015 → TASK-016 → TASK-017 → TASK-018.
**Reversion conditions:** Si los primeros 10 clientes demuestran que las operaciones de escritura se hacen exclusivamente por SQL/CLI y la SPA solo se usa para monitoreo, los endpoints de escritura (POST, PATCH) se deprecan sin eliminar el código.

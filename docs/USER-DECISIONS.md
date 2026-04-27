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
**Decision:** Arquitectura Desacoplada: el core Fastify expone un Admin API dedicado (`/admin/*`). Un cliente separado (Appsmith Community, self-hosted) consume ese API. Appsmith es el MVP, reemplazable en el futuro por una SPA propietaria que consume el mismo Admin API sin modificar el backend.
**Discarded alternatives:**
- Pattern A (built-in al core): contamina el event loop de Fastify con rendering de UI; impide reemplazar el frontend sin tocar el backend.
- Pattern B (plugin): sigue ejecutándose en el proceso Fastify; mismas limitaciones de acoplamiento.
- SPA propietaria desde el día 1: meses de desarrollo vs. horas con Appsmith; el Admin API es el contrato estable.
**Consequences:**
- El MASTER-SPEC §6 está definido. El Admin API se implementa y valida dentro de Fase 1 (sandbox local).
- Caddy entra al stack como edge proxy para routing de subdominios (`api.`, `admin.`).
- Appsmith se deploea como contenedor Docker adicional en producción.
**Reversion conditions:** Si Appsmith cambia su licencia a modelo comercial sin free tier, o si la SPA propietaria cubre el 100% de las funciones operativas antes de lo anticipado.

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
**Context:** La arquitectura desacoplada requiere un mecanismo de autenticación para el Admin API que sea criptográficamente separado del realm de tenants. Se evaluaron tres opciones de emisión: (A) CLI local con clave privada, (B) IdP externo (Google Workspace, Entra ID), (C) Appsmith emite el JWT tras login propio.
**Decision:** Opción C: Appsmith gestiona la autenticación del operador (email/contraseña) y emite el admin JWT. Fastify verifica el JWT con un plugin `@fastify/jwt` en namespace `admin`, separado del plugin de tenant (HS256). Algoritmo: RS256 o ES256. El rol PostgreSQL `jarvis_admin` tiene `BYPASSRLS` para visibilidad cross-tenant. Operaciones destructivas requieren confirmación explícita en Appsmith. Scope único `super_admin` por ahora.
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
**Context:** Hubo ambigüedad sobre cómo el Superadmin interactuaría con Uptime Kuma (¿un widget en Appsmith, un iframe, un enlace?). Integrar el monitor dentro del panel operativo crea un Punto Único de Falla (SPOF): si el servidor o Appsmith colapsa, el operador pierde el monitor justo cuando más lo necesita.
**Decision:** Uptime Kuma operará como una entidad de radar completamente independiente. En Fase 1 (Sandbox) corre en un puerto separado (`:3002`). En Fase 2/Producción, DEBE residir en un VPS externo geográficamente o lógicamente separado del clúster de Jarvis (ej. VPS de $4/mes) bajo un subdominio propio (`status.dominio.com`). Appsmith solo contendrá un hipervínculo saliente ("Status Page").
**Discarded alternatives:**
- Integración vía iframe/widget en Appsmith: rechazado categóricamente por crear un SPOF (ceguera del observador).
- Hosting en el mismo VPS de producción que Jarvis: rechazado, una falla a nivel de hypervisor apaga la alarma y el sistema simultáneamente.
**Consequences:**
- La arquitectura gana resiliencia ante caídas catastróficas del datacenter principal.
- Actúa como una página de estado (Status Page) pública u operable por el B2B client para validar el SLA.
**Reversion conditions:** Imposibilidad financiera extrema para costear un VPS de $4, forzando la co-ubicación en el mismo servidor (con aceptación explícita del riesgo de SPOF).

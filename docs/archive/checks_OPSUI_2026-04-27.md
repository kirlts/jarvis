# Archived Checks: OPSUI (Appsmith) - 2026-04-27

> Archived due to architectural decision UD-007: Appsmith abandoned in favor of custom SPA (Refine).
> Original location: docs/VERIFICATION.md

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

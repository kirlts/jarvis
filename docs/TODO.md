# TODO: Jarvis v0.1.0

> Direct traceability: each task references checks from `VERIFICATION.md`.

## Kairós Symbol Legend

| Symbol | Meaning |
|---|---|
| 🤖 | Check verifiable by AI/automated tool |
| 🧑 | Check requiring human verification |
| 🤖🧑 | Check pre-verifiable by AI, final human validation |
| ⏳ | In progress |
| 🔲 | Pending |
| 🚨 | Critical block |

---

## Overall Coverage Summary

| Epic | Tasks | Status | 🤖 .LLM | 🧑 .HUM | 🤖🧑 .MIX | Total Checks |
| --- | --- | --- | --- | --- | --- | --- |
| [EPIC-001] Phase 1 Local Sandbox | 6 | 🔲 Pending | 72 | 4 | 1 | 77 |

---

## [EPIC-001] Phase 1 Local Sandbox Validation

### 🔲 `[TASK-001]` Docker Compose & Infrastructure Provisioning
**Intent:** Levantar la red de validación 100% local (Supabase emulator, S3, pg-boss BD) sin dependencias externas.
**Covered checks:** 
- 🤖 `[CORE.AV.01.LLM]`, 🤖 `[CORE.CR.01.LLM]`, 🤖 `[CORE.RS.02.LLM]`
- 🤖 `[DB.AV.01.LLM]`, 🤖 `[DB.CR.02.LLM]`
- 🤖 `[STOR.AV.01.LLM]`

### 🔲 `[TASK-002]` Fastify HTTP Core & Sincronización Cliente
**Intent:** Implementar el endpoint del Sincronizador Offline, validando JSON Schema, UUIDv7 y respondiendo HTTP 202.
**Covered checks:**
- 🤖 `[CLNT.AV.01.LLM]`, 🤖 `[CLNT.AV.02.LLM]`, 🤖 `[CLNT.FN.01.LLM]`, 🤖 `[CLNT.FN.02.LLM]`, 🤖 `[CLNT.CR.01.LLM]`, 🧑 `[CLNT.CR.02.HUM]`, 🤖 `[CLNT.CR.03.LLM]`, 🤖 `[CLNT.IN.01.LLM]`, 🤖 `[CLNT.IN.02.LLM]`, 🤖 `[CLNT.RS.01.LLM]`, 🤖 `[CLNT.RS.03.LLM]`
- 🤖 `[CORE.AV.02.LLM]`, 🤖 `[CORE.FN.01.LLM]`, 🤖 `[CORE.FN.02.LLM]`, 🤖 `[CORE.FN.03.LLM]`, 🤖 `[CORE.CR.02.LLM]`, 🤖 `[CORE.IN.01.LLM]`, 🤖 `[CORE.IN.02.LLM]`, 🤖 `[CORE.IN.03.LLM]`, 🤖 `[CORE.RS.01.LLM]`, 🤖 `[CORE.RS.03.LLM]`

### 🔲 `[TASK-003]` pg-boss Transactional Worker
**Intent:** Implementar el worker que extrae tareas del `sync_inbox` e inyecta transaccionalmente el `tenant_id` preservando el orden UUIDv7.
**Covered checks:**
- 🤖 `[BOSS.AV.01.LLM]`, 🤖 `[BOSS.FN.01.LLM]`, 🤖 `[BOSS.FN.02.LLM]`, 🤖 `[BOSS.FN.03.LLM]`, 🤖 `[BOSS.CR.01.LLM]`, 🤖 `[BOSS.CR.02.LLM]`, 🤖 `[BOSS.CR.03.LLM]`, 🤖 `[BOSS.IN.01.LLM]`, 🤖 `[BOSS.IN.02.LLM]`, 🤖 `[BOSS.IN.03.LLM]`, 🤖 `[BOSS.RS.01.LLM]`, 🤖 `[BOSS.RS.02.LLM]`, 🤖 `[BOSS.RS.03.LLM]`
- 🤖 `[DB.RS.02.LLM]`

### 🔲 `[TASK-004]` WhatsApp Baileys Worker
**Intent:** Desplegar contenedor aislado con Baileys para orquestación de mensajería con persistencia de AuthState en PostgreSQL JSONB.
**Covered checks:**
- 🤖 `[WAPP.AV.01.LLM]`, 🤖🧑 `[WAPP.FN.01.MIX]`, 🤖 `[WAPP.FN.02.LLM]`, 🧑 `[WAPP.CR.01.HUM]`, 🧑 `[WAPP.CR.02.HUM]`, 🤖 `[WAPP.CR.03.LLM]`, 🤖 `[WAPP.IN.01.LLM]`, 🤖 `[WAPP.IN.02.LLM]`, 🤖 `[WAPP.IN.03.LLM]`, 🤖 `[WAPP.RS.01.LLM]`, 🤖 `[WAPP.RS.02.LLM]`, 🧑 `[WAPP.RS.03.HUM]`, 🤖 `[WAPP.RS.04.LLM]`

### 🔲 `[TASK-005]` PostgreSQL RLS & Isolation
**Intent:** Configurar migraciones Atlas para policies de RLS, impidiendo cross-tenant data leaks.
**Covered checks:**
- 🤖 `[DB.FN.01.LLM]`, 🤖 `[DB.FN.02.LLM]`, 🤖 `[DB.CR.01.LLM]`, 🤖 `[DB.CR.03.LLM]`, 🤖 `[DB.IN.01.LLM]`, 🤖 `[DB.IN.02.LLM]`, 🤖 `[DB.IN.03.LLM]`, 🤖 `[DB.IN.04.LLM]`, 🤖 `[DB.RS.01.LLM]`, 🤖 `[DB.RS.03.LLM]`
- 🤖 `[CLNT.RS.02.LLM]`

### 🔲 `[TASK-006]` Supabase Storage Emulator & Binary Sync
**Intent:** Implementar subida de binarios mediante pre-signed URLs apuntando al Storage S3 emulado, con restricciones de Tenant.
**Covered checks:**
- 🤖 `[STOR.FN.01.LLM]`, 🤖 `[STOR.FN.02.LLM]`, 🤖 `[STOR.CR.01.LLM]`, 🤖 `[STOR.CR.02.LLM]`, 🤖 `[STOR.CR.03.LLM]`, 🤖 `[STOR.IN.01.LLM]`, 🤖 `[STOR.IN.02.LLM]`, 🤖 `[STOR.RS.01.LLM]`, 🤖 `[STOR.RS.02.LLM]`, 🤖 `[STOR.RS.03.LLM]`, 🤖 `[STOR.RS.04.LLM]`
- 🤖 `[CLNT.FN.03.LLM]`

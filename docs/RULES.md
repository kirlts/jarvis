# Rules & Best Practices

> Technical references, established patterns, and enforceable constraints for Jarvis operations.

## Frontend Framework (Refine v5)

- **Refine Core Documentation**: [https://refine.dev/core/docs/](https://refine.dev/core/docs/)

### Hook Selection Matrix

| Escenario | Hook Correcto | NO usar |
|---|---|---|
| CRUD estándar (listar, crear, editar, eliminar) | `useList`, `useOne`, `useCreate`, `useUpdate`, `useDelete` | `fetch` manual |
| Lectura no-CRUD (endpoints custom GET) | `useCustom` con `meta.rawUrl` | `useEffect` + `fetch` |
| Mutaciones no-CRUD (POST/PATCH/DELETE custom) | `useCustomMutation` con `meta.rawUrl` | `fetch` manual con `try/catch` |
| Formularios de edición inline o modales | `useForm` / `useModalForm` | `useState` + `useUpdate` manual |
| Login / Autenticación | `useLogin()` del `authProvider` | `fetch` directo a `/admin/dev-login` |
| Invalidación de caché tras SSE | `.refetch()` directo en instancias de query | `useInvalidate` genérico (query keys no siempre coinciden) |

### Reactivity Policy (SSE, No Polling)

1. **Real-time**: La reactividad de la Ops Console se basa en **PG LISTEN/NOTIFY → SSE** (`/admin/whatsapp/status/stream`). Existen dos canales:
   - `wapp_status_change`: Disparado por trigger en `wapp_sessions` UPDATE (cambios de estado de conexión, QR).
   - `tenant_activity`: Disparado por triggers en `pgboss.job` INSERT, `wapp_incoming` INSERT, `sync_inbox` INSERT y `storage_objects` INSERT (nuevos mensajes, jobs, archivos).
2. **Refetch explícito**: El callback del SSE en el frontend invoca `.refetch()` directamente sobre las instancias de `useList` (`auditQuery`, `jobsQuery`, `inboxQuery`). NO se usa `useInvalidate` genérico.
3. **Polling prohibido**: `refetchInterval` está prohibido para feeds de actividad. Solo se permite en dashboards de resumen donde la latencia de 30s es aceptable y no hay canal SSE dedicado.

### S3 Presigned URLs

- Las URLs presignadas se generan con un `S3Client` dinámico cuyo `endpoint` coincide con el hostname que el navegador usará para contactar a MinIO. Esto garantiza que la firma HMAC del presigned URL coincida con el header `Host` que MinIO recibe.
- **Prohibido** reescribir hostnames de URLs presignadas en el frontend (`resolveBrowserUrl` es legacy). La firma se invalida si el hostname cambia post-generación.

### Data Provider (`providers/data.ts`)

El `dataProvider` de Refine ya implementa:
- `getList` / `getOne` / `create` / `update` / `deleteOne` con inyección automática de JWT.
- `custom` con soporte para `meta.rawUrl` (endpoints no-CRUD).

Cualquier endpoint nuevo del Admin API debe ser consumido a través de estos métodos, nunca vía `fetch` directo. El `fetch` directo bypasea la capa de autenticación centralizada y los interceptores de error.

## Development and Verification Guidelines

1. **Browser Subagent Prohibition**: The use of browser subagents for testing, verification, or interaction is strictly prohibited. Always verify using API tests, manual curl commands, or script validations.
2. **Docker Image Rebuilding**: Rebuilding Docker images is mandatory whenever code changes in backend/worker services require packaging updates to visualize or verify in the execution environment (`docker compose down && docker compose up -d --build`).

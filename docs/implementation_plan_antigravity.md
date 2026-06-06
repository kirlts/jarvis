# Plan de Implementación: Integración Real de Antigravity CLI (MVP)

Este documento detalla los pasos para realizar la integración física y la ejecución asíncrona local de **Antigravity CLI** en la arquitectura del sandbox de Jarvis, de acuerdo con el diseño aprobado.

## Objetivo
Reemplazar la simulación estática (stubs) en `src/workers/boss-worker.js` por una ejecución de subproceso real (`child_process.exec`) que invoque un script local (`antigravity-handler.js`) en la raíz del proyecto configurado.

---

## Fases del Plan

### Fase 1: Modificaciones en el Backend Core (`boss-worker.js`)
- [ ] Importar `exec` desde `child_process` y `join` desde `path`.
- [ ] En `handleSyncJob`, antes del procesamiento del payload, realizar una consulta a `wapp_channels` para obtener la configuración del canal (`payload.channelId`).
- [ ] Si `config.processor === 'antigravity'`, resolver la ruta absoluta al script local (`target_project/antigravity-handler.js`).
- [ ] Ejecutar el subproceso local inyectando el payload completo en su `stdin` en formato JSON.
- [ ] Pasar variables de entorno rápidas (`JARVIS_SENDER`, `JARVIS_MESSAGE`, etc.).
- [ ] Capturar la salida estándar (`stdout`) como el texto de respuesta y asociarla al payload.
- [ ] Manejar errores de ejecución y timeouts escribiendo los detalles en `stderr` en el payload de respuesta para que sea legible en el historial de la Ops Console.

### Fase 2: Creación del Script del Desarrollador (`antigravity-handler.js`)
- [ ] Crear un archivo de plantilla ejecutable `antigravity-handler.js` en la raíz del repositorio local (`/home/kirlts/jarvis`).
- [ ] Implementar la lectura asíncrona de `stdin`.
- [ ] Proveer un ejemplo básico de procesamiento interactivo (ej. responder al mensaje `ping` con `pong` y a `status` con detalles del sandbox local).

### Fase 3: Pruebas y Validación E2E
- [ ] Simular la llegada de un mensaje en el sandbox usando los endpoints de prueba o enviando un mensaje al canal local.
- [ ] Verificar en la Ops Console que el historial de actividad muestra la respuesta generada por el script local.
- [ ] Verificar que si el script falla, el error se reporta de forma legible en el timeline de auditoría de la consola.

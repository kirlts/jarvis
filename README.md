# Jarvis v0.1.0

Jarvis es una plataforma multi-tenant para la gestión de personal y operaciones. Sigue una arquitectura de monolito modular (patrón Microkernel). El sistema provee un núcleo genérico que maneja identidad, autenticación y procesamiento en segundo plano, el cual puede ser extendido a través de plugins específicos para diferentes industrias.

## Arquitectura

El proyecto impone varias restricciones arquitectónicas para mantener el aislamiento de datos y la previsibilidad de los procesos:

* Backend en Fastify con validación estricta de payloads mediante JSON Schema.
* PostgreSQL 17 como motor de base de datos. El aislamiento multi-tenant se aplica directamente a nivel de base de datos usando Row-Level Security (RLS).
* Procesamiento asíncrono con pg-boss. Este componente se conecta directamente a PostgreSQL saltando el pooler de conexiones (PgBouncer) para mantener los advisory locks.
* Los canales de comunicación externos, como WhatsApp a través de Baileys, se ejecutan en contenedores Docker aislados sin compartir el event loop de la API principal.
* La consola de operaciones es una Single Page Application (SPA) construida con React, Vite y Refine v5. Se comunica con el backend exclusivamente mediante una API administrativa dedicada (rutas `/admin/*`).
* La telemetría y monitoreo del sistema utilizan Pino, Loki y Grafana en una configuración alojada en los propios servidores (self-hosted).

## Estado actual

El proyecto se encuentra en la Fase 1 (Validación en Sandbox Local). El entorno se ejecuta sobre Docker Compose para emular las condiciones de la infraestructura de producción.

Los componentes implementados hasta la fecha incluyen:
* Inbox de sincronización diferida en la API principal.
* Worker de WhatsApp con soporte para múltiples canales por inquilino.
* Base de datos PostgreSQL con políticas RLS activas en las tablas operativas.
* Almacenamiento de archivos con MinIO, compatible con S3.
* Enrutamiento de subdominios a través de Caddy.
* Consola de operaciones para visualizar inquilinos, revisar registros de auditoría y administrar colas de trabajos.
* Suite de pruebas operativas con Specmatic (pruebas de contrato), Playwright (pruebas E2E en interfaz de usuario), Stryker (pruebas de mutación) y K6 (pruebas de estrés).

## Tareas pendientes

Los siguientes hitos deben cumplirse antes de completar la Fase 1 y planificar el paso a producción:

* Aprobación de la arquitectura y flujo de la consola de operaciones tras sesiones de prueba interactivas.
* Diseño del sistema de enrutamiento para el centro de agentes. Este sistema conectará solicitudes entrantes con herramientas como servidores Model Context Protocol (MCP), procesamiento de lenguaje natural y scripts locales.
* Separación de los pools de conexiones de base de datos para separar las cargas de lectura y escritura.
* Integración de controles automatizados en CI para medir el rendimiento (`EXPLAIN ANALYZE`) en consultas que atraviesan políticas RLS.
* Despliegue del entorno productivo utilizando Kamal 2 en instancias Oracle ARM.

## Stack tecnológico

* Entorno de ejecución: Node.js 24.x LTS
* Framework HTTP: Fastify 5.x
* Base de datos: PostgreSQL 17
* Gestor de migraciones: Atlas CLI
* Gestor de colas: pg-boss 12.x
* Framework Frontend: React, Vite, Refine v5, Tailwind CSS
* Observabilidad: Pino, Loki, Grafana, Uptime Kuma
* Orquestación local: Docker Compose, Caddy

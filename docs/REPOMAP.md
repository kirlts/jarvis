# Repository Map (REPOMAP)

> This document defines the exact structural layout of the repository.

## Physical Structure

```
/home/kirlts/jarvis
├── atlas.hcl
├── build
│   └── reports
│       └── specmatic
│           ├── coverage_report.json
│           ├── html
│           │   ├── assets
│           │   │   ├── badge.svg
│           │   │   ├── blocked.svg
│           │   │   ├── check-badge.svg
│           │   │   ├── clipboard-document-list.svg
│           │   │   ├── clock.svg
│           │   │   ├── download.svg
│           │   │   ├── exclamation-triangle.svg
│           │   │   ├── favicon.svg
│           │   │   ├── main.js
│           │   │   ├── mark-approved.svg
│           │   │   ├── mark-rejected.svg
│           │   │   ├── specmatic-logo.svg
│           │   │   ├── styles.css
│           │   │   ├── summaryUpdater.js
│           │   │   ├── tableFilter.js
│           │   │   ├── test_data.json
│           │   │   ├── trend-up.svg
│           │   │   ├── utils.js
│           │   │   └── x-circle.svg
│           │   └── index.html
│           └── test
│               └── html
│                   └── index.html
├── Caddyfile
├── docker-compose.yml
├── Dockerfile
├── docs
│   ├── archive
│   │   └── checks_OPSUI_2026-04-27.md
│   ├── CHANGELOG.md
│   ├── MASTER-SPEC.md
│   ├── MEMORY.md
│   ├── REPOMAP.md
│   ├── REPOMAP_raw.txt
│   ├── TEST.md
│   ├── TODO.md
│   ├── USER-DECISIONS.md
│   └── VERIFICATION.md
├── Idea
│   ├── 04-25 Estrategia de Producto_ De Soluciones Freelance Aisladas a una Plataforma SaaS Modular y Escalable-Summary.txt
│   ├── 04-25 Estrategia de Producto_ De Soluciones Freelance Aisladas a una Plataforma SaaS Modular y Escalable-transcript.txt
│   └── 04-26 Stabilizing a Multi-tenant Messaging Core_ Contracts, Unhappy-Path Discipline, Testing Doctrine, and Ops Console Decisions-transcript.txt
├── infrastructure
│   ├── observability
│   │   ├── grafana
│   │   │   └── provisioning
│   │   │       ├── alerting
│   │   │       │   └── alerts.yml
│   │   │       ├── dashboards
│   │   │       │   └── dashboards.yml
│   │   │       ├── datasources
│   │   │       │   └── datasource.yml
│   │   │       └── plugins
│   │   │           └── plugins.yml
│   │   └── loki-config.yaml
│   └── security
│       └── keys
│           ├── private.key
│           ├── private.key.pub
│           └── public.key
├── kairos-version.txt
├── ops-console
│   ├── Dockerfile
│   ├── eslint.config.js
│   ├── index.html
│   ├── nginx.conf
│   ├── package.json
│   ├── package-lock.json
│   ├── public
│   │   └── favicon.ico
│   ├── README.MD
│   ├── src
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── components
│   │   │   ├── breadcrumb
│   │   │   │   └── index.tsx
│   │   │   ├── layout
│   │   │   │   └── index.tsx
│   │   │   └── menu
│   │   │       └── index.tsx
│   │   ├── index.tsx
│   │   ├── pages
│   │   │   ├── jobs
│   │   │   │   ├── list.test.tsx
│   │   │   │   └── list.tsx
│   │   │   ├── login.tsx
│   │   │   ├── tenants
│   │   │   │   ├── create.test.tsx
│   │   │   │   ├── create.tsx
│   │   │   │   ├── list.test.tsx
│   │   │   │   └── list.tsx
│   │   │   └── whatsapp
│   │   │       ├── list.test.tsx
│   │   │       └── list.tsx
│   │   ├── providers
│   │   │   ├── auth.ts
│   │   │   ├── constants.ts
│   │   │   └── data.ts
│   │   ├── setupTests.ts
│   │   └── vite-env.d.ts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── vite.config.ts
├── package.json
├── package-lock.json
├── PRD-Constitucion.md
├── private_key.pem
├── private_key_pkcs1.pem
├── public_key.pem
├── reports
│   └── mutation
│       ├── mutation.html
│       └── mutation.json
├── Research
│   ├── 01 - Solo Dev SaaS Testing Strategies.md
│   ├── 02 - SaaS Admin Panel Architecture Research.md
│   └── 03 - Alternativas Open Source para Panel Admin.md
├── scripts
│   ├── audit_storage.js
│   ├── dump-routes.js
│   ├── generate-admin-jwt.js
│   ├── generate_token.js
│   ├── health-check.js
│   ├── jwt_test.js
│   ├── provision_kuma.py
│   ├── run-admin-contract-tests.js
│   ├── run-contract-tests.js
│   ├── stress
│   │   ├── st-001.js
│   │   ├── st-002.js
│   │   ├── st-003.js
│   │   └── st-010-admin-crud.js
│   ├── stress-admin.js
│   ├── stress-caddy.js
│   ├── stress-test.js
│   ├── test-stub.js
│   ├── test_task_005.js
│   ├── test_task_006.js
│   └── validate_coherence.cjs
├── specs
│   ├── admin-api.yaml
│   ├── tenant-api_examples.json
│   └── tenant-api.yaml
├── src
│   ├── config.js
│   ├── db.js
│   ├── db.test.js
│   ├── features
│   │   ├── admin
│   │   │   ├── admin.property.test.js
│   │   │   ├── routes.integration.test.js
│   │   │   ├── routes.js
│   │   │   └── routes.test.js
│   │   ├── storage
│   │   │   ├── routes.js
│   │   │   └── s3-client.js
│   │   └── sync-inbox
│   │       ├── routes.js
│   │       ├── routes.test.js
│   │       └── schema.js
│   ├── middleware
│   │   ├── boss-publisher.js
│   │   ├── event-loop-monitor.js
│   │   └── jwt.js
│   ├── rls.test.js
│   ├── server.js
│   └── workers
│       ├── baileys
│       │   ├── auth-state.js
│       │   └── worker.js
│       └── boss-worker.js
├── stryker.config.json
├── supabase
│   └── migrations
│       ├── 001_extensions.sql
│       ├── 002_tenants.sql
│       ├── 003_sync_inbox.sql
│       ├── 004_wapp_state.sql
│       ├── 005_rls_and_isolation.sql
│       ├── 006_storage_objects.sql
│       ├── 007_seed.sql
│       ├── 008_admin_role.sql
│       ├── 009_tenant_unique_name.sql
│       └── atlas.sum
├── test-jwt.js
├── test-routes.js
├── test-server.js
├── worker2.log
└── worker.log

49 directories, 149 files
```

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Provisionamiento declarativo para Uptime Kuma de Jarvis.

Asegura que Kuma esté configurado con:
1. El usuario de administración inicial.
2. Los monitores (Fastify, PostgreSQL, MinIO, Redis, Loki, Grafana)
   con los parámetros correctos para la topología de contenedores Docker.

Este script es idempotente (se puede ejecutar múltiples veces sin duplicar).
No requiere configuración manual de Kuma.
"""

import os
import sys
import argparse
import time

try:
    from uptime_kuma_api import UptimeKumaApi, MonitorType
except ImportError:
    print("Error: uptime-kuma-api no está instalado. Ejecuta:")
    print("pip install uptime-kuma-api")
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="Provisiona Uptime Kuma para Jarvis.")
    parser.add_argument("--kuma-url", default="http://uptime-kuma:3001", help="URL de Uptime Kuma (defecto: http://uptime-kuma:3001)")
    args = parser.parse_args()

    # Credenciales de admin por defecto para sandbox
    admin_user = "admin"
    admin_pass = "kuma_sandbox"

    kuma_url = args.kuma_url

    print(f"[*] Conectando a Uptime Kuma en {kuma_url}...")
    try:
        api = UptimeKumaApi(kuma_url)
    except Exception as e:
        print(f"Error conectando a Kuma: {e}")
        print("¿Está corriendo el contenedor 'jarvis-uptime-kuma'?")
        sys.exit(1)

    # Fase 1: Setup / Login
    try:
        setup_needed = api.need_setup()
        if setup_needed:
            print("[*] Instancia fresca detectada. Ejecutando setup inicial...")
            api.setup(admin_user, admin_pass)
            print("[✓] Setup completado exitosamente.")
        else:
            print("[*] Instancia ya configurada. Realizando login...")
        
        # SIEMPRE hacer login
        api.login(admin_user, admin_pass)
        print("[✓] Login activo.")
            
        time.sleep(2)  # Dar tiempo al socket.io para poblar el caché interno
    except Exception as e:
        print(f"Error en setup/login: {e}")
        api.disconnect()
        sys.exit(1)

    # Fase 2: Configurar Monitores
    print("\n[*] Provisionando Monitores de Infraestructura...")
    
    monitors_to_ensure = [
        {
            "name": "🚀 HTTP: Core API (Fastify)",
            "type": MonitorType.HTTP,
            "url": "http://core-api:3000/health",
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 3,
            "accepted_statuscodes": ["200-299"],
        },
        {
            "name": "🛢️ TCP: PostgreSQL",
            "type": MonitorType.PORT,
            "hostname": "db",
            "port": 5432,
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 2,
        },
        {
            "name": "🛢️ TCP: PgBouncer (Pooler)",
            "type": MonitorType.PORT,
            "hostname": "pooler",
            "port": 5432,
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 2,
        },
        {
            "name": "📦 HTTP: MinIO (Storage)",
            "type": MonitorType.HTTP,
            "url": "http://storage:9000/minio/health/live",
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 3,
            "accepted_statuscodes": ["200-299"],
        },
        {
            "name": "👁️ HTTP: Loki",
            "type": MonitorType.HTTP,
            "url": "http://loki:3100/ready",
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 3,
            "accepted_statuscodes": ["200-299"],
        },
        {
            "name": "📊 HTTP: Grafana",
            "type": MonitorType.HTTP,
            "url": "http://grafana:3000/api/health",
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 3,
            "accepted_statuscodes": ["200-299"],
        },

        {
            "name": "🛡️ TCP: Caddy (Edge Proxy)",
            "type": MonitorType.PORT,
            "hostname": "caddy",
            "port": 80,
            "interval": 60,
            "retryInterval": 60,
            "maxretries": 2,
        }
    ]

    for attempt in range(3):
        try:
            existing_monitors = api.get_monitors()
            break
        except Exception:
            print(f"  [INFO] get_monitors timeout, reintentando ({attempt+1}/3)...")
            time.sleep(3)
    else:
        existing_monitors = []
    
    for m_def in monitors_to_ensure:
        existing = next((m for m in existing_monitors if m["name"] == m_def["name"]), None)
        
        if existing:
            print(f"  [INFO] Monitor '{m_def['name']}' ya existe. Actualizando...")
            kwargs = m_def.copy()
            res = api.edit_monitor(existing["id"], **kwargs)
        else:
            print(f"  [+] Creando monitor '{m_def['name']}'...")
            kwargs = m_def.copy()
            res = api.add_monitor(**kwargs)

    print("[✓] Provisionamiento completado. Puedes acceder a Uptime Kuma en http://localhost:3002.")
    print("    Usuario: admin / kumas_sandbox")
    
    api.disconnect()

if __name__ == "__main__":
    main()

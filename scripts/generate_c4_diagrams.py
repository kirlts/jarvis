#!/usr/bin/env python3
"""
Jarvis C4 Diagram Generator — v2 (layout-fixed)
Generates 4 C4 model diagrams as high-res PNG files.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, Ellipse
import os

COLORS = {
    'person': '#08427B', 'person_text': '#FFFFFF',
    'system': '#1168BD', 'system_text': '#FFFFFF',
    'external': '#999999', 'external_text': '#FFFFFF',
    'container': '#438DD5', 'cont_text': '#FFFFFF',
    'db': '#2D6CA2', 'db_text': '#FFFFFF',
    'component': '#85BBF0', 'comp_text': '#000000',
    'boundary': '#555555', 'arrow': '#666666', 'arrow_text': '#444444',
    'bg': '#FFFFFF',
    'queue': '#D4882A', 'queue_text': '#FFFFFF',
    'proxy': '#3E8548', 'proxy_text': '#FFFFFF',
    'obs': '#D45B0E', 'obs_text': '#FFFFFF',
    'pooler': '#7B5230', 'pooler_text': '#FFFFFF',
}
FONT = 'Inter'
OUT = '/home/kirlts/jarvis'


def box(ax, x, y, w, h, label, tech, color, tcolor):
    p = FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.015",
                       fc=color, ec='#2A2A2A', lw=1.3, zorder=3)
    ax.add_patch(p)
    if tech:
        ax.text(x, y+h*0.12, label, ha='center', va='center', fontsize=9,
                fontweight='bold', color=tcolor, fontfamily=FONT, zorder=4)
        ax.text(x, y-h*0.18, f'[{tech}]', ha='center', va='center', fontsize=7,
                fontstyle='italic', color=tcolor, fontfamily=FONT, alpha=0.8, zorder=4)
    else:
        ax.text(x, y, label, ha='center', va='center', fontsize=9,
                fontweight='bold', color=tcolor, fontfamily=FONT, zorder=4)


def person(ax, x, y, label, sub=''):
    head = plt.Circle((x, y+0.045), 0.02, color=COLORS['person'], ec='#1A3355', lw=1, zorder=3)
    ax.add_patch(head)
    body = FancyBboxPatch((x-0.06, y-0.025), 0.12, 0.06, boxstyle="round,pad=0.008",
                          fc=COLORS['person'], ec='#1A3355', lw=1, zorder=3)
    ax.add_patch(body)
    ax.text(x, y-0.0, label, ha='center', va='center', fontsize=7.5,
            fontweight='bold', color=COLORS['person_text'], fontfamily=FONT, zorder=4)
    if sub:
        ax.text(x, y-0.055, sub, ha='center', va='center', fontsize=6,
                color='#555', fontfamily=FONT, zorder=4)


def cylinder(ax, x, y, w, h, label, tech, color, tcolor):
    body = FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.005",
                          fc=color, ec='#1A3355', lw=1.3, zorder=3)
    ax.add_patch(body)
    ell = Ellipse((x, y+h/2), w, h*0.35, fc=color, ec='#1A3355', lw=1.3, zorder=4)
    ax.add_patch(ell)
    ax.text(x, y+0.012, label, ha='center', va='center', fontsize=8,
            fontweight='bold', color=tcolor, fontfamily=FONT, zorder=5)
    if tech:
        ax.text(x, y-0.02, f'[{tech}]', ha='center', va='center', fontsize=6.5,
                fontstyle='italic', color=tcolor, fontfamily=FONT, alpha=0.8, zorder=5)


def arrow(ax, x1, y1, x2, y2, label='', offset=(0, 0.015)):
    ax.annotate('', xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle='->', color=COLORS['arrow'], lw=1.2), zorder=2)
    if label:
        mx, my = (x1+x2)/2 + offset[0], (y1+y2)/2 + offset[1]
        ax.text(mx, my, label, ha='center', va='bottom', fontsize=6.5,
                color=COLORS['arrow_text'], fontfamily=FONT, fontstyle='italic', zorder=5,
                bbox=dict(fc='white', ec='none', alpha=0.85, pad=1))


def boundary(ax, x, y, w, h, label):
    r = FancyBboxPatch((x-w/2, y-h/2), w, h, boxstyle="round,pad=0.01",
                       fc='none', ec=COLORS['boundary'], lw=1.5, ls='--', zorder=1)
    ax.add_patch(r)
    ax.text(x-w/2+0.015, y+h/2-0.015, label, ha='left', va='top', fontsize=8,
            fontweight='bold', color=COLORS['boundary'], fontfamily=FONT, zorder=2)


def fig_setup(title, subtitle, figsize=(16, 10)):
    fig, ax = plt.subplots(1, 1, figsize=figsize, dpi=180)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.set_aspect('auto'); ax.axis('off')
    fig.patch.set_facecolor(COLORS['bg']); ax.set_facecolor(COLORS['bg'])
    ax.text(0.5, 0.97, title, ha='center', va='top', fontsize=15,
            fontweight='bold', color='#1A1A1A', fontfamily=FONT)
    ax.text(0.5, 0.94, subtitle, ha='center', va='top', fontsize=8.5,
            color='#666', fontfamily=FONT, fontstyle='italic')
    return fig, ax


def legend(ax, items, y=0.03):
    n = len(items); sx = 0.5 - (n*0.16)/2
    for i, (c, l) in enumerate(items):
        x = sx + i*0.16
        p = FancyBboxPatch((x, y-0.008), 0.022, 0.016, boxstyle="round,pad=0.002",
                           fc=c, ec='#333', lw=0.7, zorder=3)
        ax.add_patch(p)
        ax.text(x+0.03, y, l, va='center', fontsize=6.5, color='#444', fontfamily=FONT, zorder=4)


# ═══════════════════════════════════════════════════════════════════════
# 1. SYSTEM CONTEXT
# ═══════════════════════════════════════════════════════════════════════
def d1():
    fig, ax = fig_setup(
        'Jarvis — System Context Diagram [C4 Level 1]',
        'B2B SaaS platform for multi-tenant operations & personnel management')

    person(ax, 0.18, 0.80, 'Operator', 'Business admin / founder')
    person(ax, 0.82, 0.80, 'Field Worker', 'Coordinated personnel')
    box(ax, 0.50, 0.58, 0.26, 0.11, 'Jarvis Platform',
        'Node.js / Fastify / PostgreSQL', COLORS['system'], COLORS['system_text'])
    box(ax, 0.15, 0.32, 0.18, 0.08, 'WhatsApp', 'Baileys / Meta',
        COLORS['external'], COLORS['external_text'])
    box(ax, 0.50, 0.20, 0.18, 0.08, 'S3 Storage', 'MinIO / Supabase Storage',
        COLORS['external'], COLORS['external_text'])
    box(ax, 0.85, 0.32, 0.18, 0.08, 'Observability', 'Loki + Grafana + Kuma',
        COLORS['external'], COLORS['external_text'])

    arrow(ax, 0.24, 0.76, 0.42, 0.63, 'Manages tenants,\njobs & config')
    arrow(ax, 0.76, 0.76, 0.58, 0.63, 'Syncs offline\ndata')
    arrow(ax, 0.42, 0.53, 0.22, 0.36, 'Sends / receives\nmessages')
    arrow(ax, 0.50, 0.52, 0.50, 0.24, 'Stores / retrieves\nmedia files')
    arrow(ax, 0.58, 0.53, 0.78, 0.36, 'Ships structured\nlogs')

    legend(ax, [(COLORS['person'], 'Person'), (COLORS['system'], 'Jarvis'),
                (COLORS['external'], 'External System')])
    fig.savefig(f'{OUT}/c4-1-system-context.png', bbox_inches='tight', facecolor='w')
    plt.close(fig); print('✓ c4-1-system-context.png')


# ═══════════════════════════════════════════════════════════════════════
# 2. CONTAINER
# ═══════════════════════════════════════════════════════════════════════
def d2():
    fig, ax = fig_setup(
        'Jarvis — Container Diagram [C4 Level 2]',
        'Runtime containers, technologies, and communication paths',
        figsize=(18, 13))

    person(ax, 0.50, 0.92, 'Operator', '')

    boundary(ax, 0.50, 0.46, 0.90, 0.72, 'Jarvis Platform [Docker Compose]')

    # Edge
    box(ax, 0.50, 0.79, 0.14, 0.06, 'Caddy', 'Edge Proxy / TLS',
        COLORS['proxy'], COLORS['proxy_text'])
    # Apps row
    box(ax, 0.20, 0.65, 0.18, 0.07, 'Ops Console SPA', 'React / Refine v5 / Vite',
        COLORS['container'], COLORS['cont_text'])
    box(ax, 0.50, 0.65, 0.18, 0.07, 'Fastify Core API', 'Node.js 24 / VSA',
        COLORS['container'], COLORS['cont_text'])
    box(ax, 0.82, 0.65, 0.14, 0.07, 'Baileys Worker', 'WhatsApp / Isolated',
        COLORS['container'], COLORS['cont_text'])
    # Infra row
    box(ax, 0.30, 0.48, 0.15, 0.06, 'Core Worker', 'pg-boss / Node.js',
        COLORS['queue'], COLORS['queue_text'])
    box(ax, 0.58, 0.48, 0.13, 0.06, 'PgBouncer', 'Transaction :6543',
        COLORS['pooler'], COLORS['pooler_text'])
    # Data row
    cylinder(ax, 0.35, 0.30, 0.16, 0.07, 'PostgreSQL 17', 'RLS / UUIDv7',
             COLORS['db'], COLORS['db_text'])
    box(ax, 0.68, 0.30, 0.14, 0.06, 'MinIO / S3', 'Object Storage',
        COLORS['external'], COLORS['external_text'])
    # Observability row
    box(ax, 0.18, 0.16, 0.11, 0.05, 'Loki', 'Logs',
        COLORS['obs'], COLORS['obs_text'])
    box(ax, 0.36, 0.16, 0.11, 0.05, 'Grafana', 'Dashboards',
        COLORS['obs'], COLORS['obs_text'])
    box(ax, 0.55, 0.16, 0.13, 0.05, 'Uptime Kuma', 'Synthetic',
        COLORS['obs'], COLORS['obs_text'])

    # Arrows
    arrow(ax, 0.50, 0.885, 0.50, 0.82, 'HTTPS')
    arrow(ax, 0.44, 0.76, 0.26, 0.69, 'admin.jarvis.*')
    arrow(ax, 0.56, 0.76, 0.50, 0.69, 'api.jarvis.*')
    arrow(ax, 0.29, 0.63, 0.43, 0.63, 'Admin API /admin/*', (0, 0.012))
    arrow(ax, 0.55, 0.61, 0.57, 0.51, 'SQL via pooler')
    arrow(ax, 0.55, 0.45, 0.42, 0.34, ':5432')
    arrow(ax, 0.30, 0.45, 0.34, 0.34, 'Direct :5432\n(advisory locks)')
    arrow(ax, 0.82, 0.61, 0.42, 0.33, 'AuthState JSONB')
    arrow(ax, 0.82, 0.61, 0.72, 0.33, 'Media upload')
    arrow(ax, 0.56, 0.61, 0.66, 0.33, 'Presigned URLs')
    arrow(ax, 0.45, 0.62, 0.22, 0.19, 'Pino logs')

    legend(ax, [(COLORS['container'], 'Application'), (COLORS['db'], 'Database'),
                (COLORS['queue'], 'Async Worker'), (COLORS['external'], 'Storage'),
                (COLORS['obs'], 'Observability'), (COLORS['proxy'], 'Proxy')], y=0.06)
    fig.savefig(f'{OUT}/c4-2-container.png', bbox_inches='tight', facecolor='w')
    plt.close(fig); print('✓ c4-2-container.png')


# ═══════════════════════════════════════════════════════════════════════
# 3. COMPONENT — Fastify Core API
# ═══════════════════════════════════════════════════════════════════════
def d3():
    fig, ax = fig_setup(
        'Jarvis — Component Diagram: Fastify Core API [C4 Level 3]',
        'Internal structure of the Fastify Core API container (VSA pattern)',
        figsize=(17, 12))

    # External actors — moved away from title
    box(ax, 0.12, 0.85, 0.14, 0.05, 'Ops Console SPA', 'React',
        COLORS['external'], COLORS['external_text'])
    box(ax, 0.88, 0.85, 0.14, 0.05, 'Mobile Client', 'Offline Sync',
        COLORS['external'], COLORS['external_text'])

    boundary(ax, 0.50, 0.47, 0.84, 0.62, 'Fastify Core API [Container]')

    # Middleware row
    box(ax, 0.25, 0.72, 0.16, 0.06, 'Admin JWT Plugin', 'RS256 / @fastify/jwt',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.50, 0.72, 0.16, 0.06, 'Tenant JWT Plugin', 'HS256 / @fastify/jwt',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.75, 0.72, 0.14, 0.06, 'Event Loop Monitor', 'Middleware',
        COLORS['component'], COLORS['comp_text'])

    # Feature modules row
    box(ax, 0.16, 0.56, 0.14, 0.07, 'Admin Feature', 'Tenants / Jobs /\nAudit / Config',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.38, 0.56, 0.14, 0.07, 'Sync Inbox', 'POST /api/v1/\nsync/inbox',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.60, 0.56, 0.14, 0.07, 'Storage Feature', 'Presigned URLs /\nS3 proxy',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.82, 0.56, 0.12, 0.07, 'Health & Logs', 'Loki proxy /\nLogQL',
        COLORS['component'], COLORS['comp_text'])

    # Infra row
    box(ax, 0.28, 0.38, 0.16, 0.06, 'Boss Publisher', 'pg-boss job dispatch',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.58, 0.38, 0.18, 0.06, 'DB Pool (RLS)', 'PgBouncer :6543\nSET LOCAL tenant_id',
        COLORS['component'], COLORS['comp_text'])

    # External infra
    cylinder(ax, 0.32, 0.20, 0.14, 0.06, 'PostgreSQL 17', 'RLS',
             COLORS['db'], COLORS['db_text'])
    box(ax, 0.58, 0.20, 0.12, 0.05, 'MinIO / S3', '',
        COLORS['external'], COLORS['external_text'])
    box(ax, 0.80, 0.20, 0.10, 0.05, 'Loki', '',
        COLORS['obs'], COLORS['obs_text'])

    # Arrows
    arrow(ax, 0.18, 0.82, 0.23, 0.75, '/admin/*')
    arrow(ax, 0.82, 0.82, 0.52, 0.75, '/api/v1/*')
    arrow(ax, 0.25, 0.69, 0.18, 0.60, 'Routes')
    arrow(ax, 0.50, 0.69, 0.38, 0.60, 'Routes')
    arrow(ax, 0.50, 0.69, 0.60, 0.60, 'Routes')
    arrow(ax, 0.16, 0.52, 0.26, 0.41, 'Enqueue')
    arrow(ax, 0.38, 0.52, 0.30, 0.41, 'Enqueue')
    arrow(ax, 0.16, 0.52, 0.52, 0.41, 'SQL queries')
    arrow(ax, 0.38, 0.52, 0.54, 0.41, 'SQL')
    arrow(ax, 0.55, 0.35, 0.38, 0.23, ':6543→:5432')
    arrow(ax, 0.28, 0.35, 0.31, 0.23, 'Direct :5432')
    arrow(ax, 0.60, 0.52, 0.58, 0.23, 'PutObject', (0.06, 0.015))
    arrow(ax, 0.82, 0.52, 0.80, 0.23, 'LogQL')

    legend(ax, [(COLORS['component'], 'Component'), (COLORS['db'], 'Database'),
                (COLORS['external'], 'External'), (COLORS['obs'], 'Observability')], y=0.08)
    fig.savefig(f'{OUT}/c4-3-component-core.png', bbox_inches='tight', facecolor='w')
    plt.close(fig); print('✓ c4-3-component-core.png')


# ═══════════════════════════════════════════════════════════════════════
# 4. COMPONENT — Baileys Worker
# ═══════════════════════════════════════════════════════════════════════
def d4():
    fig, ax = fig_setup(
        'Jarvis — Component Diagram: Baileys Worker [C4 Level 3]',
        'Internal structure of the WhatsApp communication worker (isolated container)',
        figsize=(17, 12))

    # External — positioned below title
    box(ax, 0.12, 0.85, 0.14, 0.05, 'WhatsApp', 'Meta servers',
        COLORS['external'], COLORS['external_text'])
    box(ax, 0.88, 0.85, 0.14, 0.05, 'Admin API', 'Reconnect / Status',
        COLORS['external'], COLORS['external_text'])

    boundary(ax, 0.50, 0.47, 0.80, 0.58, 'Baileys Worker [Container / Docker]')

    # Row 1: Connection
    box(ax, 0.22, 0.68, 0.16, 0.07, 'Baileys Socket', 'makeWASocket\nWebSocket',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.50, 0.68, 0.16, 0.07, 'PG Auth State', 'usePgAuthState\nJSONB keys',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.78, 0.68, 0.14, 0.07, 'QR Generator', 'PG LISTEN/NOTIFY\nSSE stream',
        COLORS['component'], COLORS['comp_text'])

    # Row 2: Processing
    box(ax, 0.22, 0.50, 0.16, 0.07, 'Message Handler', 'Intercept text &\nmedia messages',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.50, 0.50, 0.16, 0.07, 'Media Pipeline', 'downloadMedia →\nSHA-256 → S3',
        COLORS['component'], COLORS['comp_text'])
    box(ax, 0.78, 0.50, 0.14, 0.07, 'pg-boss Client', 'Job dispatch\n& consumption',
        COLORS['component'], COLORS['comp_text'])

    # Row 3: Lifecycle
    box(ax, 0.40, 0.34, 0.16, 0.06, 'Connection Lifecycle', 'Reconnect / Close\n/ Status update',
        COLORS['component'], COLORS['comp_text'])

    # External infra
    cylinder(ax, 0.30, 0.20, 0.14, 0.06, 'PostgreSQL 17', 'AuthState + Jobs',
             COLORS['db'], COLORS['db_text'])
    box(ax, 0.60, 0.20, 0.14, 0.05, 'MinIO / S3', 'jarvis-private',
        COLORS['external'], COLORS['external_text'])

    # Arrows
    arrow(ax, 0.15, 0.82, 0.20, 0.72, 'WebSocket')
    arrow(ax, 0.84, 0.82, 0.79, 0.72, 'Reconnect\ntrigger')
    arrow(ax, 0.30, 0.66, 0.42, 0.66, 'Load/save\ncrypto keys')
    arrow(ax, 0.50, 0.64, 0.33, 0.23, 'JSONB\nread/write')
    arrow(ax, 0.22, 0.64, 0.22, 0.54, 'on message')
    arrow(ax, 0.30, 0.48, 0.42, 0.48, 'If media\ndetected')
    arrow(ax, 0.58, 0.48, 0.71, 0.48, 'Enqueue job')
    arrow(ax, 0.50, 0.46, 0.60, 0.23, 'PutObject\n+ SHA-256')
    arrow(ax, 0.78, 0.46, 0.35, 0.23, 'Direct :5432')
    arrow(ax, 0.40, 0.31, 0.32, 0.23, '')

    legend(ax, [(COLORS['component'], 'Component'), (COLORS['db'], 'Database'),
                (COLORS['external'], 'External System')], y=0.08)
    fig.savefig(f'{OUT}/c4-4-component-baileys.png', bbox_inches='tight', facecolor='w')
    plt.close(fig); print('✓ c4-4-component-baileys.png')


if __name__ == '__main__':
    print('Generating C4 diagrams (v2)...')
    d1(); d2(); d3(); d4()
    print(f'\nAll 4 diagrams saved to {OUT}/')

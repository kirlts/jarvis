#!/usr/bin/env node
/**
 * Provision DinoWiki Flow — Creates the flow graph for the Dino client.
 *
 * This script provisions a flow that:
 *   1. trigger (inbound_channel) — filters by Dino's channel and contact
 *   2. dinowiki — queries/modifies /home/kirlts/DinoWiki/knowledge-base
 *   3. send_message — replies via WhatsApp with the result
 *
 * Usage:
 *   node scripts/provision-dinowiki-flow.js \
 *     --tenant-id <UUID> \
 *     --channel-id <UUID> \
 *     [--contact-id <UUID>] \
 *     [--api-url http://localhost:3000] \
 *     [--admin-token <JWT>]
 *
 * Environment fallbacks:
 *   ADMIN_API_URL (default: http://localhost:3000)
 *   ADMIN_JWT_TOKEN (required if --admin-token not provided)
 */

import { parseArgs } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    'tenant-id':  { type: 'string' },
    'channel-id': { type: 'string' },
    'contact-id': { type: 'string' },
    'api-url':    { type: 'string', default: process.env.ADMIN_API_URL || 'http://localhost:3000' },
    'admin-token': { type: 'string', default: process.env.ADMIN_JWT_TOKEN || '' },
    'wiki-path':  { type: 'string', default: '/home/kirlts/DinoWiki/knowledge-base' },
  },
  strict: true,
});

const tenantId = values['tenant-id'];
const channelId = values['channel-id'];
const contactId = values['contact-id'] || null;
const apiUrl = values['api-url'];
const adminToken = values['admin-token'];
const wikiPath = values['wiki-path'];

if (!tenantId || !channelId) {
  console.error('Usage: node scripts/provision-dinowiki-flow.js --tenant-id <UUID> --channel-id <UUID> [options]');
  process.exit(1);
}

if (!adminToken) {
  // Try to generate a JWT from the private key
  const privateKeyPath = path.resolve(__dirname, '..', 'private_key_pkcs1.pem');
  if (!fs.existsSync(privateKeyPath)) {
    console.error('No --admin-token provided and no private key found at', privateKeyPath);
    process.exit(1);
  }
}

// ── Flow Graph Definition ──────────────────────────────────────────────
const flowGraph = {
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: {
        type: 'trigger',
        label: 'Mensaje Entrante',
        config: {},
      },
    },
    {
      id: 'dinowiki-1',
      type: 'dinowiki',
      position: { x: 250, y: 200 },
      data: {
        type: 'dinowiki',
        label: 'Consultar/Modificar DinoWiki',
        config: {
          wiki_path: wikiPath,
          operation: 'auto',
          max_results: 3,
          max_chars: 1500,
        },
      },
    },
    {
      id: 'send-1',
      type: 'send_message',
      position: { x: 250, y: 400 },
      data: {
        type: 'send_message',
        label: 'Responder por WhatsApp',
        config: {
          text: '{{dinowiki_response}}',
        },
      },
    },
  ],
  edges: [
    {
      id: 'e-trigger-dinowiki',
      source: 'trigger-1',
      target: 'dinowiki-1',
    },
    {
      id: 'e-dinowiki-send',
      source: 'dinowiki-1',
      target: 'send-1',
    },
  ],
};

// ── Trigger Config ─────────────────────────────────────────────────────
const triggerConfig = {
  channel_id: channelId,
};
if (contactId) {
  triggerConfig.allowed_contacts = [contactId];
}

async function main() {
  let token = adminToken;

  // Generate JWT if none provided
  if (!token) {
    const { default: jwt } = await import('jsonwebtoken');
    const privateKeyPath = path.resolve(__dirname, '..', 'private_key_pkcs1.pem');
    const privateKey = fs.readFileSync(privateKeyPath);
    token = jwt.sign({ role: 'super_admin' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Provisioning DinoWiki Flow                             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  console.log(`  Tenant:    ${tenantId}`);
  console.log(`  Channel:   ${channelId}`);
  console.log(`  Contact:   ${contactId || '(all contacts)'}`);
  console.log(`  Wiki path: ${wikiPath}`);
  console.log(`  API:       ${apiUrl}`);
  console.log('');

  // Check if flow already exists
  const listRes = await fetch(`${apiUrl}/admin/tenants/${tenantId}/flows`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    console.error(`Failed to list flows: ${listRes.status} ${await listRes.text()}`);
    process.exit(1);
  }

  const existingFlows = await listRes.json();
  const existingDinoFlow = existingFlows.find(f => f.name === 'DinoWiki Agent');

  if (existingDinoFlow) {
    console.log(`  ⚠ Flow "DinoWiki Agent" already exists (id: ${existingDinoFlow.id}).`);
    console.log('  → Updating existing flow...\n');

    const updateRes = await fetch(`${apiUrl}/admin/tenants/${tenantId}/flows/${existingDinoFlow.id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        trigger_config: triggerConfig,
        graph: flowGraph,
        is_active: true,
      }),
    });

    if (!updateRes.ok) {
      console.error(`Failed to update flow: ${updateRes.status} ${await updateRes.text()}`);
      process.exit(1);
    }

    const updated = await updateRes.json();
    console.log(`  ✓ Flow updated: ${updated.id}`);
  } else {
    console.log('  → Creating new flow...\n');

    const createRes = await fetch(`${apiUrl}/admin/tenants/${tenantId}/flows`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'DinoWiki Agent',
        trigger_type: 'inbound_channel',
        trigger_config: triggerConfig,
        graph: flowGraph,
        is_active: true,
      }),
    });

    if (!createRes.ok) {
      console.error(`Failed to create flow: ${createRes.status} ${await createRes.text()}`);
      process.exit(1);
    }

    const created = await createRes.json();
    console.log(`  ✓ Flow created: ${created.id}`);
    console.log(`    Name:         ${created.name}`);
    console.log(`    Trigger:      ${created.trigger_type}`);
    console.log(`    Active:       ${created.is_active}`);
  }

  console.log('\n  ✓ DinoWiki flow provisioned successfully.\n');
  console.log('  Pipeline:');
  console.log('    WhatsApp → Baileys → sync-inbox → boss-worker → flow-execute → flow-engine');
  console.log('    → trigger → dinowiki (read/write MD) → send_message (WhatsApp reply)\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

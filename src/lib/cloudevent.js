// CloudEvent Module — Jarvis iPaaS
// Shared factory for CloudEvents spec v1.0 compliant envelopes.
//
// Reference: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
// Decision: UD-039 (CloudEvents as interchange contract)
// Constraint: MASTER-SPEC §2 (I/O Channel Isolation — Contrato de Interfaz)
//
// All inter-component messages in Jarvis (adapter→Core, Core→Core, Core→adapter)
// MUST be wrapped in a CloudEvent envelope. This module is the single point of
// creation to enforce structural consistency across all producers.

import { v7 as uuidv7 } from 'uuid';

/**
 * Jarvis CloudEvent type registry.
 * Convention: jarvis.<domain>.<subdomain>.<action>
 *
 * These are the ONLY valid ce-type values in the system.
 * Adding a new event type requires updating this registry and MASTER-SPEC §2.
 */
export const CE_TYPES = Object.freeze({
  // ── Channel: WhatsApp ──────────────────────────────────────────
  CHANNEL_WHATSAPP_MESSAGE_INBOUND:  'jarvis.channel.whatsapp.message.inbound',
  CHANNEL_WHATSAPP_MESSAGE_OUTBOUND: 'jarvis.channel.whatsapp.message.outbound',
  CHANNEL_WHATSAPP_LIFECYCLE:        'jarvis.channel.whatsapp.lifecycle',
  CHANNEL_WHATSAPP_CONTROL:          'jarvis.channel.whatsapp.control',

  // ── API: Sync Inbox ────────────────────────────────────────────
  API_SYNC_INBOUND:                  'jarvis.api.sync.inbound',

  // ── Admin: Lifecycle ───────────────────────────────────────────
  ADMIN_LIFECYCLE:                   'jarvis.admin.lifecycle',

  // ── Flow Engine ────────────────────────────────────────────────
  FLOW_TRIGGER:                      'jarvis.flow.trigger',
  FLOW_NODE_OUTPUT:                  'jarvis.flow.node.output',
  FLOW_CRON_SCAN:                    'jarvis.flow.cron.scan',

  // ── Storage Operations ─────────────────────────────────────────
  STORAGE_PURGE:                     'jarvis.storage.purge',
  STORAGE_ZIP:                       'jarvis.storage.zip',
});

/**
 * Build a CloudEvent envelope compliant with spec v1.0.
 *
 * @param {string} type       - CloudEvent type (use CE_TYPES constants)
 * @param {string} source     - Origin identifier (e.g. 'adapter/baileys', 'api/sync-inbox')
 * @param {object} data       - Payload data
 * @param {object} [extensions] - Jarvis-specific extensions (tenantid, channelid, contactid)
 * @returns {object} CloudEvent-compliant envelope
 * @throws {Error} If type or source are empty
 */
export function createCloudEvent(type, source, data, extensions) {
  if (!type) throw new Error('CloudEvent type is required');
  if (!source) throw new Error('CloudEvent source is required');

  const envelope = {
    specversion: '1.0',
    id: uuidv7(),
    type,
    source,
    time: new Date().toISOString(),
    datacontenttype: 'application/json',
    data: data ?? {},
  };

  // Merge Jarvis-specific extensions (only defined values)
  if (extensions) {
    for (const [key, value] of Object.entries(extensions)) {
      if (value !== undefined && value !== null) {
        envelope[key] = value;
      }
    }
  }

  return envelope;
}

/**
 * Convenience wrapper: wraps a plain payload object into a CloudEvent.
 * Delegates to createCloudEvent. Exists for semantic clarity at call sites.
 *
 * @param {string} type       - CE_TYPES constant
 * @param {string} source     - Origin identifier
 * @param {object} payload    - Raw payload to wrap
 * @param {object} [extensions] - Jarvis extensions
 * @returns {object} CloudEvent envelope with payload as `data`
 */
export function wrapPayload(type, source, payload, extensions) {
  return createCloudEvent(type, source, { ...payload }, extensions);
}

/**
 * Check whether an object is a valid CloudEvent (spec v1.0).
 *
 * @param {*} obj - Object to validate
 * @returns {boolean} True if the object has all required CE fields with specversion 1.0
 */
export function isCloudEvent(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    obj.specversion === '1.0' &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.source === 'string'
  );
}

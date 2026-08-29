// CloudEvent Module — TDD Test Suite
// Tests the shared CloudEvent factory against CloudEvents spec v1.0
// Reference: https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/spec.md
//
// Isolation: Pure unit tests (node:test), no infrastructure dependencies.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCloudEvent, wrapPayload, isCloudEvent, CE_TYPES } from '../cloudevent.js';

describe('CloudEvent Module', () => {

  describe('createCloudEvent()', () => {
    it('produces a spec 1.0 compliant envelope with all required fields', () => {
      const ce = createCloudEvent('jarvis.test.event', 'test/unit', { foo: 'bar' });

      assert.equal(ce.specversion, '1.0', 'specversion must be 1.0');
      assert.equal(typeof ce.id, 'string', 'id must be a string');
      assert.ok(ce.id.length > 0, 'id must not be empty');
      assert.equal(ce.type, 'jarvis.test.event');
      assert.equal(ce.source, 'test/unit');
      assert.equal(ce.datacontenttype, 'application/json');
      assert.deepStrictEqual(ce.data, { foo: 'bar' });

      // time must be a valid ISO 8601 timestamp
      const parsed = new Date(ce.time);
      assert.ok(!isNaN(parsed.getTime()), 'time must be a valid ISO 8601 timestamp');
    });

    it('generates unique ids for consecutive calls', () => {
      const ce1 = createCloudEvent('jarvis.test.event', 'test/unit', {});
      const ce2 = createCloudEvent('jarvis.test.event', 'test/unit', {});
      assert.notEqual(ce1.id, ce2.id);
    });

    it('includes Jarvis extensions when provided', () => {
      const ce = createCloudEvent('jarvis.test.event', 'test/unit', { msg: 'hi' }, {
        tenantid: 'tenant-abc',
        channelid: 'channel-xyz',
        contactid: 'contact-123',
      });

      assert.equal(ce.tenantid, 'tenant-abc');
      assert.equal(ce.channelid, 'channel-xyz');
      assert.equal(ce.contactid, 'contact-123');
    });

    it('does not inject undefined extensions into the envelope', () => {
      const ce = createCloudEvent('jarvis.test.event', 'test/unit', {});

      assert.ok(!('tenantid' in ce), 'tenantid should not be present if not provided');
      assert.ok(!('channelid' in ce), 'channelid should not be present if not provided');
    });

    it('rejects empty type', () => {
      assert.throws(
        () => createCloudEvent('', 'test/unit', {}),
        /type is required/
      );
    });

    it('rejects empty source', () => {
      assert.throws(
        () => createCloudEvent('jarvis.test.event', '', {}),
        /source is required/
      );
    });
  });

  describe('wrapPayload()', () => {
    it('wraps a plain object into a CloudEvent envelope', () => {
      const payload = { sender: '569123', message: 'hola', channelId: 'ch-1' };
      const ce = wrapPayload(CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_INBOUND, 'adapter/baileys', payload, {
        tenantid: 't-1',
        channelid: 'ch-1',
        contactid: 'c-1',
      });

      assert.equal(ce.specversion, '1.0');
      assert.equal(ce.type, 'jarvis.channel.whatsapp.message.inbound');
      assert.equal(ce.source, 'adapter/baileys');
      assert.deepStrictEqual(ce.data, payload);
      assert.equal(ce.tenantid, 't-1');
    });

    it('preserves data immutability (does not mutate input)', () => {
      const payload = { sender: '569123' };
      const original = { ...payload };
      wrapPayload(CE_TYPES.CHANNEL_WHATSAPP_MESSAGE_INBOUND, 'adapter/baileys', payload);

      assert.deepStrictEqual(payload, original);
    });
  });

  describe('isCloudEvent()', () => {
    it('returns true for a valid CloudEvent', () => {
      const ce = createCloudEvent('jarvis.test.event', 'test/unit', {});
      assert.ok(isCloudEvent(ce));
    });

    it('returns false for a plain object', () => {
      assert.ok(!isCloudEvent({ sender: '569123', message: 'hola' }));
    });

    it('returns false for null/undefined', () => {
      assert.ok(!isCloudEvent(null));
      assert.ok(!isCloudEvent(undefined));
    });

    it('returns false if specversion is not 1.0', () => {
      assert.ok(!isCloudEvent({ specversion: '0.3', id: 'x', type: 'y', source: 'z' }));
    });
  });

  describe('CE_TYPES', () => {
    it('contains all expected Jarvis event types', () => {
      const expectedKeys = [
        'CHANNEL_WHATSAPP_MESSAGE_INBOUND',
        'CHANNEL_WHATSAPP_MESSAGE_OUTBOUND',
        'CHANNEL_WHATSAPP_LIFECYCLE',
        'CHANNEL_WHATSAPP_CONTROL',
        'API_SYNC_INBOUND',
        'ADMIN_LIFECYCLE',
        'FLOW_TRIGGER',
        'FLOW_NODE_OUTPUT',
        'FLOW_CRON_SCAN',
        'STORAGE_PURGE',
        'STORAGE_ZIP',
      ];

      for (const key of expectedKeys) {
        assert.ok(key in CE_TYPES, `CE_TYPES must contain ${key}`);
        assert.ok(CE_TYPES[key].startsWith('jarvis.'), `${key} must start with 'jarvis.'`);
      }
    });

    it('all types are unique', () => {
      const values = Object.values(CE_TYPES);
      const unique = new Set(values);
      assert.equal(values.length, unique.size, 'All CE_TYPES values must be unique');
    });
  });
});

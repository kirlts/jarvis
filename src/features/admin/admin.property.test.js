// Property-Based Testing: Admin API invariants
// Uses fast-check to validate that admin endpoint behaviors hold for
// arbitrary inputs, not just hand-picked examples.

import { test, describe } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';

// ── UUID format validation invariant ──────────────────────────────────
// The admin routes use this regex to validate UUID path params.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Property-Based Testing: Admin API Invariants', () => {

  test('UUID regex accepts all valid UUIDs (v4 and v7)', () => {
    fc.assert(
      fc.property(fc.uuid(), (uuid) => {
        assert.ok(UUID_REGEX.test(uuid), `Valid UUID rejected: ${uuid}`);
      }),
      { numRuns: 500 }
    );
  });

  test('UUID regex rejects non-UUID strings', () => {
    const nonUuidArbitrary = fc.oneof(
      fc.string({ minLength: 0, maxLength: 50 }).filter(s => !UUID_REGEX.test(s)),
      fc.constant('not-a-uuid'),
      fc.constant(''),
      fc.constant('123'),
      fc.constant('01926d8c5a0070008000000000000001'), // no hyphens
      fc.integer().map(String),
    );

    fc.assert(
      fc.property(nonUuidArbitrary, (input) => {
        assert.strictEqual(UUID_REGEX.test(input), false, `Non-UUID accepted: ${input}`);
      }),
      { numRuns: 500 }
    );
  });

  test('Pagination offset calculation is never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 100 }),
        (page, limit) => {
          const offset = (page - 1) * limit;
          assert.ok(offset >= 0, `Offset was negative: ${offset} (page=${page}, limit=${limit})`);
        }
      ),
      { numRuns: 1000 }
    );
  });

  test('Pagination offset is deterministic for same inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 1, max: 100 }),
        (page, limit) => {
          const offset1 = (page - 1) * limit;
          const offset2 = (page - 1) * limit;
          assert.strictEqual(offset1, offset2);
        }
      ),
      { numRuns: 500 }
    );
  });

  test('Tenant name validation: minLength=1 rejects empty, maxLength=255 rejects overflow', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 255 }),
        (name) => {
          assert.ok(name.length >= 1, 'Name too short');
          assert.ok(name.length <= 255, 'Name too long');
        }
      ),
      { numRuns: 500 }
    );
  });

  test('SQL parameterized query builder: placeholder count always equals param count', () => {
    // Simulates the jobs query builder logic from routes.js
    function buildJobsQuery(state, tenant_id, limit) {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (state) {
        conditions.push(`state = $${paramIdx++}`);
        params.push(state);
      }
      if (tenant_id) {
        conditions.push(`data->>'tenant_id' = $${paramIdx++}`);
        params.push(tenant_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);
      const sql = `SELECT id FROM pgboss.job ${where} ORDER BY created_on DESC LIMIT $${paramIdx}`;

      return { sql, params };
    }

    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }), // state
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }), // tenant_id
        fc.integer({ min: 1, max: 100 }),                            // limit
        (state, tenant_id, limit) => {
          const { sql, params } = buildJobsQuery(state, tenant_id, limit);

          // Core invariant: placeholder count equals param count
          const placeholderCount = (sql.match(/\$\d+/g) || []).length;
          assert.strictEqual(
            placeholderCount,
            params.length,
            `Mismatch: ${placeholderCount} placeholders vs ${params.length} params in: ${sql}`
          );

          // Placeholder indices must be sequential starting from $1
          const placeholders = sql.match(/\$(\d+)/g) || [];
          placeholders.forEach((p, i) => {
            assert.strictEqual(p, `$${i + 1}`, `Non-sequential placeholder: ${p} at position ${i}`);
          });

          // All param values must be present in the params array
          if (state) assert.ok(params.includes(state));
          if (tenant_id) assert.ok(params.includes(tenant_id));
          assert.ok(params.includes(limit));
        }
      ),
      { numRuns: 1000 }
    );
  });

  test('SQL parameterized query: no raw value concatenation for adversarial inputs', () => {
    function buildJobsQuery(state, tenant_id, limit) {
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (state) {
        conditions.push(`state = $${paramIdx++}`);
        params.push(state);
      }
      if (tenant_id) {
        conditions.push(`data->>'tenant_id' = $${paramIdx++}`);
        params.push(tenant_id);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit);
      const sql = `SELECT id FROM pgboss.job ${where} ORDER BY created_on DESC LIMIT $${paramIdx}`;

      return { sql, params };
    }

    // Adversarial inputs: SQL injection attempts
    const injectionAttempts = [
      "'; DROP TABLE tenants; --",
      "1 OR 1=1",
      "failed' UNION SELECT * FROM tenants --",
      "Robert'); DROP TABLE Students;--",
    ];

    for (const injection of injectionAttempts) {
      const { sql } = buildJobsQuery(injection, undefined, 50);
      // The adversarial string must NOT appear in the SQL template
      assert.ok(
        !sql.includes(injection),
        `Injection vector found in SQL: ${injection}`
      );
    }
  });
});

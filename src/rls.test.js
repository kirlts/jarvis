import { test, describe } from 'node:test';
import assert from 'node:assert';
import fc from 'fast-check';

describe('Property-Based Testing: RLS Context Builder', () => {
  const buildRlsQuery = (tenantId, userId) => {
    return `SET LOCAL request.jwt.claims = '{"tenant_id": "${tenantId}", "sub": "${userId}"}';`;
  };

  test('RLS query always contains the exact tenantId and userId', () => {
    fc.assert(
      fc.property(
        fc.uuid(), fc.uuid(),
        (tenantId, userId) => {
          const query = buildRlsQuery(tenantId, userId);
          assert.ok(query.includes(`"tenant_id": "${tenantId}"`));
          assert.ok(query.includes(`"sub": "${userId}"`));
          assert.ok(query.startsWith('SET LOCAL'));
        }
      )
    );
  });
});

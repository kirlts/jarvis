import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import pool from '../../db.js';

/**
 * Custom Auth State that uses PostgreSQL JSONB (wapp_sessions table).
 * Covers: WAPP.FN.01 - AuthState in JSONB, no fs.
 *
 * @param {string} tenantId 
 * @param {string} sessionId (UUIDv7)
 */
const memCache = new Map();

export function clearAuthCache(sessionId) {
  memCache.delete(sessionId);
}

export async function usePgAuthState(tenantId, sessionId) {
  let creds;
  let keys = {};

  if (memCache.has(sessionId)) {
    const cached = memCache.get(sessionId);
    creds = cached.creds;
    keys = cached.keys;
  } else {
    const { rows } = await pool.query(
      `SELECT credentials FROM wapp_sessions WHERE id = $1 AND tenant_id = $2`,
      [sessionId, tenantId]
    );

    if (rows.length > 0 && rows[0].credentials) {
      const parsed = JSON.parse(JSON.stringify(rows[0].credentials), BufferJSON.reviver);
      creds = parsed.creds || initAuthCreds();
      keys = parsed.keys || {};
    } else {
      creds = initAuthCreds();
      await pool.query(
        `INSERT INTO wapp_sessions (id, tenant_id, credentials, status)
         VALUES ($1, $2, $3, 'qr_pending')
         ON CONFLICT (id) DO NOTHING`,
        [sessionId, tenantId, JSON.stringify({ creds, keys }, BufferJSON.replacer)]
      );
    }
    memCache.set(sessionId, { creds, keys });
  }

  let isSaving = false;
  let pendingResolvers = [];

  const pump = async () => {
    isSaving = true;
    while (pendingResolvers.length > 0) {
      const batch = pendingResolvers;
      pendingResolvers = [];
      try {
        await pool.query(
          `UPDATE wapp_sessions
           SET credentials = $1, updated_at = now()
           WHERE id = $2 AND tenant_id = $3`,
          [JSON.stringify({ creds, keys }, BufferJSON.replacer), sessionId, tenantId]
        );
        batch.forEach(b => b.resolve());
      } catch (err) {
        batch.forEach(b => b.reject(err));
      }
    }
    isSaving = false;
  };

  const saveCreds = () => {
    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      if (!isSaving) {
        pump();
      }
    });
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, ids) => {
          const key = keys[type];
          return ids.reduce((dict, id) => {
            let value = key?.[id];
            if (value) {
              if (type === 'app-state-sync-key') {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              dict[id] = value;
            }
            return dict;
          }, {});
        },
        set: async (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            Object.assign(keys[category], data[category]);
          }
          await saveCreds();
        }
      }
    },
    saveCreds
  };
}

import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import pool from '../../db.js';

/**
 * Custom Auth State that uses PostgreSQL JSONB (wapp_sessions table).
 * Covers: WAPP.FN.01 - AuthState in JSONB, no fs.
 *
 * @param {string} tenantId 
 * @param {string} sessionId (UUIDv7)
 */
export async function usePgAuthState(tenantId, sessionId) {
  // Try to load existing credentials from DB
  const { rows } = await pool.query(
    `SELECT credentials FROM wapp_sessions WHERE id = $1 AND tenant_id = $2`,
    [sessionId, tenantId]
  );

  let creds;
  let keys = {};

  if (rows.length > 0 && rows[0].credentials) {
    const parsed = JSON.parse(JSON.stringify(rows[0].credentials), BufferJSON.reviver);
    creds = parsed.creds || initAuthCreds();
    keys = parsed.keys || {};
  } else {
    creds = initAuthCreds();
    // Insert initial state
    await pool.query(
      `INSERT INTO wapp_sessions (id, tenant_id, credentials, status)
       VALUES ($1, $2, $3, 'qr_pending')
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, tenantId, JSON.stringify({ creds, keys }, BufferJSON.replacer)]
    );
  }

  const saveCreds = async () => {
    await pool.query(
      `UPDATE wapp_sessions
       SET credentials = $1, updated_at = now()
       WHERE id = $2 AND tenant_id = $3`,
      [JSON.stringify({ creds, keys }, BufferJSON.replacer), sessionId, tenantId]
    );
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
        set: (data) => {
          for (const category in data) {
            keys[category] = keys[category] || {};
            Object.assign(keys[category], data[category]);
          }
          saveCreds();
        }
      }
    },
    saveCreds
  };
}

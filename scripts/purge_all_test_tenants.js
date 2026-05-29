import pg from 'pg';

const { Pool } = pg;

async function cleanAllTestTenants() {
  const pool = new Pool({
    connectionString: 'postgres://postgres:postgres_sandbox@localhost:5432/jarvis',
  });

  try {
    console.log('--- Scanning sandbox database for test-related tenants ---');
    const res = await pool.query("SELECT id, name FROM tenants WHERE name LIKE 'Tenant%' OR name LIKE 'Storage%' OR name LIKE 'Integration%' OR name LIKE 'Test%'");
    
    if (res.rows.length === 0) {
      console.log('No test tenants found! Database is already clean.');
      return;
    }

    console.log(`Found ${res.rows.length} test tenants to purge:`, res.rows.map(r => r.name));
    const ids = res.rows.map(r => r.id);

    console.log('\n--- Disabling prevent_hard_delete triggers ---');
    await pool.query('ALTER TABLE wapp_sessions DISABLE TRIGGER trg_wapp_sessions_prevent_delete');
    await pool.query('ALTER TABLE wapp_incoming DISABLE TRIGGER trg_wapp_incoming_prevent_delete');
    await pool.query('ALTER TABLE sync_inbox DISABLE TRIGGER trg_sync_inbox_prevent_delete');
    await pool.query('ALTER TABLE tenants DISABLE TRIGGER trg_tenants_prevent_delete');

    console.log('Purging dependent data...');
    await pool.query('DELETE FROM wapp_sessions WHERE tenant_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM wapp_incoming WHERE tenant_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM sync_inbox WHERE tenant_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM storage_objects WHERE tenant_id = ANY($1)', [ids]);

    console.log('Purging tenants...');
    const deleteRes = await pool.query('DELETE FROM tenants WHERE id = ANY($1)', [ids]);
    console.log(`Successfully purged ${deleteRes.rowCount} tenants.`);

    console.log('\n--- Re-enabling prevent_hard_delete triggers ---');
    await pool.query('ALTER TABLE wapp_sessions ENABLE TRIGGER trg_wapp_sessions_prevent_delete');
    await pool.query('ALTER TABLE wapp_incoming ENABLE TRIGGER trg_wapp_incoming_prevent_delete');
    await pool.query('ALTER TABLE sync_inbox ENABLE TRIGGER trg_sync_inbox_prevent_delete');
    await pool.query('ALTER TABLE tenants ENABLE TRIGGER trg_tenants_prevent_delete');

    console.log('✨ Clean-up completed successfully!');
  } catch (err) {
    console.error('❌ Clean-up failed:', err);
  } finally {
    await pool.end();
  }
}

cleanAllTestTenants();

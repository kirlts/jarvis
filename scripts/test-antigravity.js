#!/usr/bin/env node
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { v7 as uuidv7 } from 'uuid';

const CONNECTION_STRING = process.env.BOSS_DATABASE_URL || 'postgresql://postgres:postgres_sandbox@localhost:5432/jarvis';
const TENANT_ID = '019e76dd-a8d7-7990-b3c4-91177f011d77';
const CHANNEL_ID = '01900000-0000-7000-8000-000000000777';

async function main() {
  const args = process.argv.slice(2);
  const question = args.join(' ') || '¿Qué es la base de datos de Jarvis y qué constraints tiene?';

  console.log(`🤖 *[Jarvis Antigravity Tester]*`);
  console.log(`Pregunta: "${question}"\n`);

  const inboxId = uuidv7();
  const pool = new pg.Pool({ connectionString: CONNECTION_STRING });

  try {
    // 1. Insertar el mensaje simulado en sync_inbox
    const payload = {
      channelId: CHANNEL_ID,
      sender: '56994172921@s.whatsapp.net',
      message: question,
      type: 'text'
    };

    console.log(`1. Insertando mensaje en sync_inbox (ID: ${inboxId})...`);
    await pool.query(
      `INSERT INTO sync_inbox (id, tenant_id, payload, status)
       VALUES ($1, $2, $3, 'pending')`,
      [inboxId, TENANT_ID, payload]
    );

    // 2. Encolar el job en pg-boss
    console.log(`2. Publicando tarea en pg-boss (sync-inbox-process)...`);
    const boss = new PgBoss(CONNECTION_STRING);
    await boss.start();
    await boss.send('sync-inbox-process', {
      inboxId,
      tenantId: TENANT_ID,
      payload
    });
    await boss.stop();

    console.log(`3. Procesando asíncronamente (esperando respuesta)...`);

    // 3. Monitorear el resultado en la base de datos
    let attempts = 0;
    const maxAttempts = 15;
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const res = await pool.query(
        `SELECT status, payload FROM sync_inbox WHERE id = $1`,
        [inboxId]
      );
      
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (row.status === 'done') {
          console.log(`\n✅ ¡Respuesta recibida con éxito!\n`);
          console.log(`*Resultado (Transcripción/Respuesta de Antigravity):*`);
          console.log(`--------------------------------------------------`);
          console.log(row.payload.transcription);
          console.log(`--------------------------------------------------`);
          break;
        } else if (row.status === 'failed') {
          console.log(`\n❌ El procesamiento falló. Revisa los logs del worker.`);
          break;
        }
      }
      
      attempts++;
      process.stdout.write('.');
    }

    if (attempts === maxAttempts) {
      console.log(`\n⏳ Timeout esperando respuesta. Asegúrate de que el core-worker esté activo.`);
    }

  } catch (err) {
    console.error('\n❌ Error durante el test:', err.message);
  } finally {
    await pool.end();
  }
}

main();

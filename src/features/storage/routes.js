import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { s3 } from './s3-client.js';
import config from '../../config.js';
import pool from '../../db.js';
import { v7 as uuidv7 } from 'uuid';

export async function registerStorage(fastify) {
  fastify.post('/storage/presign', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['filename', 'mimeType', 'size'],
        properties: {
          filename: { type: 'string' },
          mimeType: { type: 'string' },
          size: { type: 'number' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { filename, mimeType, size } = request.body;
    const tenantId = request.user.tenant_id;
    
    // STOR.RS.02.LLM: Rechazar archivos >20MB
    if (size > 20 * 1024 * 1024) {
      return reply.status(413).send({ error: 'Payload Too Large (Limit: 20MB)' });
    }
    
    // Implementar versionado logico ante colision de llaves
    const fileId = uuidv7();
    const key = `${tenantId}/${fileId}_${filename}`;
    
    try {
      const { url, fields } = await createPresignedPost(s3, {
        Bucket: config.storage.bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 0, 20 * 1024 * 1024], // Max 20MB en el POST
          ['starts-with', '$Content-Type', ''] // Permite el content type o podemos limitarlo
        ],
        Fields: {
          'Content-Type': mimeType,
        },
        Expires: 3600 // 1 hour
      });
      
      // Guardar en BD para trazabilidad (Orphan detection)
      const query = `
        INSERT INTO storage_objects (id, tenant_id, file_name, size, mime_type, storage_key)
        VALUES ($1, $2, $3, $4, $5, $6)
      `;
      
      const dbClient = await pool.connect();
      try {
        await dbClient.query('BEGIN');
        await dbClient.query(`SELECT set_config('request.jwt.claims.tenant_id', $1, true)`, [tenantId]);
        await dbClient.query(query, [fileId, tenantId, filename, size, mimeType, key]);
        await dbClient.query('COMMIT');
      } catch (dbErr) {
        await dbClient.query('ROLLBACK');
        throw dbErr;
      } finally {
        dbClient.release();
      }
      
      return reply.send({ url, fields, key });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Failed to generate presigned URL' });
    }
  });
}

import { s3 } from '../src/features/storage/s3-client.js';
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import pool from '../src/db.js';
import config from '../src/config.js';

export async function detectOrphans(cleanup = false) {
  const data = await s3.send(new ListObjectsV2Command({ Bucket: config.storage.bucket }));
  const s3Keys = (data.Contents || []).map(c => c.Key);
  const dbRes = await pool.query('SELECT storage_key FROM storage_objects');
  const dbKeys = new Set(dbRes.rows.map(r => r.storage_key));
  
  const orphans = s3Keys.filter(k => !dbKeys.has(k));
  if (orphans.length > 0) {
    console.log(`⚠️ Detected ${orphans.length} orphaned files in S3`);
    if (cleanup) {
      for (const key of orphans) {
        await s3.send(new DeleteObjectCommand({ Bucket: config.storage.bucket, Key: key }));
        console.log(`🧹 Cleaned up orphan: ${key}`);
      }
    }
    return orphans;
  }
  
  console.log('✅ No orphaned files detected in S3');
  return [];
}

if (process.argv[1] === import.meta.url || process.argv[1].endsWith('audit_storage.js')) {
  detectOrphans(process.argv.includes('--cleanup'))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

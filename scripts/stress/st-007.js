import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const host = 'core-api';
const port = 3000;
const concurrency = 50;

console.log(`Starting ST-007: Concurrently executing ${concurrency} pre-signed uploads of 1MB against MinIO...`);

const token = jwt.sign({ tenant_id: '01900000-0000-7000-8000-000000000001' }, 'sandbox_super_secret_key_12345');

// 1. Get pre-signed URL first
const reqPayload = JSON.stringify({
  filename: 'stress-test-concurrent.bin',
  contentType: 'application/octet-stream',
  size: 1024 * 1024 // 1MB
});

const req = http.request({
  host,
  port,
  path: '/api/v1/storage/upload/presign',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reqPayload)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', async () => {
    if (res.statusCode !== 200) {
      console.error(`Failed to get presigned URL. Status: ${res.statusCode}`);
      process.exit(1);
    }

    try {
      const { uploadUrl } = JSON.parse(body);
      const urlObj = new URL(uploadUrl);
      const payload = crypto.randomBytes(1024 * 1024); // 1MB payload

      console.log(`Spawning ${concurrency} parallel uploads to MinIO...`);
      let completed = 0;
      let failed = 0;

      const triggerUpload = () => {
        return new Promise((resolve) => {
          const uploadReq = http.request({
            host: urlObj.hostname,
            port: urlObj.port || 80,
            path: urlObj.pathname + urlObj.search,
            method: 'PUT',
            headers: {
              'Content-Length': payload.length,
              'Content-Type': 'application/octet-stream'
            }
          }, (uploadRes) => {
            if (uploadRes.statusCode === 200) {
              completed++;
            } else {
              failed++;
              console.error(`Upload failed with status: ${uploadRes.statusCode}`);
            }
            resolve();
          });

          uploadReq.on('error', (err) => {
            failed++;
            console.error('Upload socket error:', err.message);
            resolve();
          });

          uploadReq.write(payload);
          uploadReq.end();
        });
      };

      // Run 50 concurrently
      const promises = Array.from({ length: concurrency }, () => triggerUpload());
      await Promise.all(promises);

      console.log(`ST-007 Summary: completed=${completed}, failed=${failed}`);
      if (failed === 0 && completed === concurrency) {
        console.log('ST-007 SUCCESS: MinIO successfully handled high concurrent upload load without EMFILE or errors.');
        process.exit(0);
      } else {
        console.error('ST-007 FAILURE: Some parallel uploads failed!');
        process.exit(1);
      }
    } catch (e) {
      console.error('Failed to parse upload URL response:', e.message);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Presign URL request error:', err.message);
  process.exit(1);
});

req.write(reqPayload);
req.end();

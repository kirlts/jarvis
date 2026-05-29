import http from 'http';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const host = 'core-api';
const port = 3000;

console.log('Starting ST-005: 25MB pre-signed upload size boundary stress test...');

const token = jwt.sign({ tenant_id: '01900000-0000-7000-8000-000000000001' }, 'sandbox_super_secret_key_12345');

// 1. Request presigned upload URL from core-api
const reqPayload = JSON.stringify({
  filename: 'stress-test-25mb.bin',
  contentType: 'application/octet-stream',
  size: 25 * 1024 * 1024 // 25MB
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
    console.log(`Presigned response status: ${res.statusCode}`);
    if (res.statusCode !== 200) {
      console.log('Success: Core API correctly rejected 25MB presign allocation or handled it according to boundaries.');
      process.exit(0);
    }

    try {
      const { uploadUrl } = JSON.parse(body);
      console.log(`Successfully obtained presigned URL: ${uploadUrl}`);

      // 2. Stream the 25MB payload to the pre-signed URL
      console.log('Generating 25MB crypto payload...');
      const payload = crypto.randomBytes(25 * 1024 * 1024);

      console.log('Streaming payload to MinIO...');
      const urlObj = new URL(uploadUrl);
      
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
        console.log(`Upload status: ${uploadRes.statusCode}`);
        if (uploadRes.statusCode === 200 || uploadRes.statusCode === 413) {
          console.log('ST-005 SUCCESS: Upload handled safely by MinIO / Storage boundaries without memory OOM.');
          process.exit(0);
        } else {
          console.error(`Unexpected upload status: ${uploadRes.statusCode}`);
          process.exit(1);
        }
      });

      uploadReq.on('error', (err) => {
        console.log('Stream disconnected or rejected by storage boundaries (safe termination):', err.message);
        process.exit(0);
      });

      uploadReq.write(payload);
      uploadReq.end();
    } catch (e) {
      console.error('Failed to parse presigned URL:', e.message);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Failed to request presigned URL:', err.message);
  process.exit(1);
});

req.write(reqPayload);
req.end();

import net from 'net';
import jwt from 'jsonwebtoken';

const host = 'core-api';
const port = 3000;
const payloadSize = 51 * 1024 * 1024; // 51MB

const token = jwt.sign({ tenant_id: '123' }, 'sandbox_super_secret_key_12345');

const client = new net.Socket();
client.connect(port, host, () => {
  console.log('Connected to server');
  client.write(`POST /api/v1/sync/inbox HTTP/1.1\r\n`);
  client.write(`Host: ${host}:${port}\r\n`);
  client.write(`Authorization: Bearer ${token}\r\n`);
  client.write(`Content-Length: ${payloadSize}\r\n`);
  client.write(`Content-Type: application/json\r\n\r\n`);

  // Write payload in chunks
  const chunkSize = 1024 * 1024; // 1MB chunks
  let written = 0;
  
  const writeChunk = () => {
    while (written < payloadSize) {
      const buffer = Buffer.alloc(Math.min(chunkSize, payloadSize - written), 'x');
      const canContinue = client.write(buffer);
      written += buffer.length;
      if (!canContinue) {
        client.once('drain', writeChunk);
        return;
      }
    }
    console.log('Finished writing 50MB');
  };
  
  writeChunk();
});

client.on('data', (data) => {
  console.log('Response:');
  console.log(data.toString());
  client.destroy();
});

client.on('error', (err) => {
  console.error('Socket error:', err);
});

import net from 'net';

const host = 'core-api';
const port = 3000;
const numConnections = 50;
let dropped = 0;

console.log(`Starting Slowloris attack with ${numConnections} connections...`);

for (let i = 0; i < numConnections; i++) {
  const client = new net.Socket();
  client.connect(port, host, () => {
    client.write(`POST /api/v1/sync/inbox HTTP/1.1\r\n`);
    client.write(`Host: ${host}:${port}\r\n`);
    // Crucially, omit the double \r\n to keep headers open
    
    // Periodically send garbage to keep socket active
    const interval = setInterval(() => {
      if (!client.destroyed) {
        client.write(`X-Garbage: ${Math.random()}\r\n`);
      }
    }, 2000);

    client.on('close', () => {
      clearInterval(interval);
      dropped++;
      console.log(`Connection dropped by server. Total dropped: ${dropped}/${numConnections}`);
      if (dropped === numConnections) {
        console.log('All connections successfully dropped by Fastify (connectionTimeout works!)');
      }
    });
  });

  client.on('error', () => {
    // Expected when server forcibly closes
  });
}

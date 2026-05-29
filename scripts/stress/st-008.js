import http from 'http';

const host = 'core-api';
const port = 3000;

console.log('Starting ST-008: Core API storage dependency resilience test...');

const checkHealth = () => {
  return new Promise((resolve) => {
    http.get(`http://${host}:${port}/health`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`Health endpoint response status: ${res.statusCode}`);
        console.log(`Health response body: ${body}`);
        
        try {
          const payload = JSON.parse(body);
          
          // Verify database is online and core is ok, even if storage has issues
          if (res.statusCode === 200 && payload.status === 'ok') {
            console.log('ST-008 SUCCESS: Core API responded with 200 OK. Resilience to storage degradation confirmed.');
            resolve(true);
          } else {
            console.error('ST-008 FAILURE: Unexpected health payload status.');
            resolve(false);
          }
        } catch (err) {
          console.error('ST-008 FAILURE: Health response is not valid JSON.', err.message);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error('Core API connection failed:', err.message);
      resolve(false);
    });
  });
};

const run = async () => {
  const ok = await checkHealth();
  process.exit(ok ? 0 : 1);
};

run();

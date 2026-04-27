import { buildApp } from '../src/server.js';
async function run() {
  const app = await buildApp();
  console.log(app.printRoutes());
}
run();

import { buildApp } from './src/server.js';
async function test() {
  const app = await buildApp();
  console.log(app.printRoutes());
}
test();

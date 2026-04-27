import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const app = Fastify();
app.register(jwt, { secret: 'secret1', namespace: 'tenant' });
app.register(jwt, { secret: 'secret2', namespace: 'admin' });

app.ready(() => {
  console.log(Object.keys(app.tenant));
  console.log(Object.keys(app.admin));
});

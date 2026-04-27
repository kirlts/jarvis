import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const app = Fastify();

app.register(jwt, {
  secret: 'secret1',
  namespace: 'tenant',
});

app.register(jwt, {
  secret: 'secret2',
  namespace: 'admin',
});

app.ready(err => {
  if (err) throw err;
  console.log(app.jwt ? 'has jwt' : 'no jwt');
  console.log(app.tenantJwt ? 'has tenantJwt' : 'no tenantJwt');
  console.log(app.adminJwt ? 'has adminJwt' : 'no adminJwt');
});

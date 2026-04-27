import jwt from 'jsonwebtoken';
import fs from 'fs';

const privateKey = fs.readFileSync('./private_key_pkcs1.pem');

const token = jwt.sign({ role: 'super_admin' }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
console.log(token);

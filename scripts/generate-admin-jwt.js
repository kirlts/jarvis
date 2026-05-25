import jwt from 'jsonwebtoken';
import fs from 'fs';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const privateKey = fs.readFileSync(path.join(__dirname, '..', 'private_key_pkcs1.pem'));

const token = jwt.sign({ role: 'super_admin' }, privateKey, { algorithm: 'RS256', expiresIn: '1h' });
console.log(token);

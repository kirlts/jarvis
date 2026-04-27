import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar llave privada desde infraestructura
const privateKeyPath = path.join(__dirname, '../infrastructure/security/keys/private.key');
if (!fs.existsSync(privateKeyPath)) {
  console.error("❌ Error: No se encontró la llave privada en " + privateKeyPath);
  console.error("Asegúrate de haber corrido los scripts de inicialización.");
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');

const payload = {
  role: 'super_admin',
  tenant_id: 'SYSTEM',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 días de expiración
};

const token = jwt.sign(payload, privateKey, { algorithm: 'RS256' });

console.log("\n🔑 JWT Admin Token (RS256) generado exitosamente:\n");
console.log(token);
console.log("\n⚠️ Cópialo y pégalo en el Datasource de Appsmith como 'Bearer Token'.\n");

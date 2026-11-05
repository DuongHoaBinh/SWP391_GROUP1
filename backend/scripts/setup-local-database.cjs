// Initializes only the dedicated portable MySQL instance started on port 3307.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const backend = path.resolve(__dirname, '..');
const root = path.resolve(backend, '..');

async function main() {
  const envFile = path.join(backend, '.env');
  if (fs.existsSync(envFile)) throw new Error('backend/.env already exists; use migrations instead of reinitializing.');
  const rootPassword = crypto.randomBytes(32).toString('hex');
  const appPassword = crypto.randomBytes(32).toString('hex');
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password: '', multipleStatements: true });
  try {
    await db.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [rootPassword]);
    const privateDir = path.join(backend, '.local/mysql');
    fs.mkdirSync(privateDir, { recursive: true });
    fs.writeFileSync(path.join(privateDir, 'admin.env'), `DB_HOST=127.0.0.1\nDB_PORT=3307\nDB_USER=root\nDB_PASSWORD=${rootPassword}\n`, { mode: 0o600, flag: 'wx' });
    const [[exists]] = await db.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = 'horse_transport_system'");
    if (Number(exists.count) !== 0) throw new Error('Database already contains tables; refusing to overwrite existing data.');
    await db.query(fs.readFileSync(path.join(root, 'database/schema.mysql.sql'), 'utf8'));
    await db.query(fs.readFileSync(path.join(root, 'database/seed.sql'), 'utf8'));
    await db.query("CREATE USER 'equitransit'@'localhost' IDENTIFIED BY ?", [appPassword]);
    await db.query("GRANT ALL PRIVILEGES ON horse_transport_system.* TO 'equitransit'@'localhost'");
    const loginPassword = crypto.randomBytes(15).toString('base64url') + '1a';
    await db.query('UPDATE `user` SET password_hash = ?', [await bcrypt.hash(loginPassword, 12)]);
    fs.writeFileSync(path.join(privateDir, 'local-accounts.txt'), `Local development accounts only\nCustomer: customer@example.com\nManager: manager@example.com\nPassword: ${loginPassword}\n`, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(envFile, `PORT=5000\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_NAME=horse_transport_system\nDB_USER=equitransit\nDB_PASSWORD=${appPassword}\nJWT_SECRET=${crypto.randomBytes(48).toString('hex')}\nFRONTEND_ORIGIN=http://localhost:3000\nSMTP_REQUIRED=true\nAUTH_EXPOSE_DEV_OTP=false\n`, { mode: 0o600, flag: 'wx' });
    console.log('Portable local database initialized. Credentials saved locally; no existing database was replaced.');
    console.log('Next: node database/apply-local-prerequisites.cjs, node database/apply-tracking-migration.cjs, node database/apply-sepay-migration.cjs (from the repository root).');
  } finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

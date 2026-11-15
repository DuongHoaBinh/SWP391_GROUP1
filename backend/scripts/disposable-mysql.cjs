const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const mysql = require('mysql2/promise');
const run = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function unusedPort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

// Always owns a fresh server and data directory/container. Never accepts application DB credentials.
async function startDisposableMysql() {
  const password = randomBytes(24).toString('hex');
  const base = process.env.TEST_MYSQL_BASEDIR;
  if (!base) {
    const name = `swp-payment-test-${randomBytes(6).toString('hex')}`;
    const cleanup = () => run('docker', ['rm', '-f', '-v', name], { timeout: 15000, windowsHide: true });
    try {
      await run('docker', ['run', '-d', '--name', name, '-e', 'MYSQL_ROOT_PASSWORD', '-p', '127.0.0.1::3306', 'mysql:8.0'], {
        env: { ...process.env, MYSQL_ROOT_PASSWORD: password }, timeout: 120000, windowsHide: true,
      });
      const result = await run('docker', ['inspect', '--format', '{{(index (index .NetworkSettings.Ports "3306/tcp") 0).HostPort}}', name], { timeout: 15000, windowsHide: true });
      return { port: Number(result.stdout.trim()), password, cleanup };
    } catch (error) { await cleanup().catch(() => {}); throw error; }
  }

  const basedir = fs.realpathSync(base);
  const executable = path.join(basedir, 'bin', process.platform === 'win32' ? 'mysqld.exe' : 'mysqld');
  if (!fs.existsSync(executable)) throw new Error('TEST_MYSQL_BASEDIR must contain bin/mysqld');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swp-isolated-mysql-'));
  const datadir = path.join(directory, 'data');
  const port = await unusedPort();
  let server;
  const cleanup = async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      let connection;
      try {
        connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password, connectTimeout: 2000 });
        await connection.query('SHUTDOWN');
      } catch {} finally { connection?.destroy(); }
      for (let i = 0; i < 100 && server.exitCode === null && server.signalCode === null; i++) await pause(100);
      if (server.exitCode === null && server.signalCode === null) {
        server.kill();
        for (let i = 0; i < 50 && server.exitCode === null && server.signalCode === null; i++) await pause(100);
      }
    }
    if (server && server.exitCode === null && server.signalCode === null) throw new Error(`Disposable MySQL did not stop: ${directory}`);
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('swp-isolated-mysql-')) throw new Error('Unexpected disposable data directory');
    fs.rmSync(resolved, { recursive: true, force: true });
  };
  try {
    await run(executable, ['--no-defaults', '--initialize-insecure', `--basedir=${basedir}`, `--datadir=${datadir}`], { timeout: 120000, windowsHide: true });
    const log = fs.openSync(path.join(directory, 'server.log'), 'a');
    server = spawn(executable, ['--no-defaults', `--basedir=${basedir}`, `--datadir=${datadir}`, '--bind-address=127.0.0.1', `--port=${port}`, '--mysqlx=OFF', '--local-infile=OFF', '--innodb-buffer-pool-size=64M'], { windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    let startupError;
    server.once('error', error => { startupError = error; });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (startupError) throw startupError;
      if (server.exitCode !== null) throw new Error(fs.readFileSync(path.join(directory, 'server.log'), 'utf8'));
      let connection;
      try {
        connection = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '', connectTimeout: 1000 });
        const [[identity]] = await connection.query('SELECT @@datadir AS datadir');
        if (path.resolve(identity.datadir).toLowerCase() !== path.resolve(datadir).toLowerCase()) {
          throw new Error('Refusing a MySQL server outside the owned temporary data directory');
        }
        await connection.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [password]);
        ready = true;
        break;
      } catch { await pause(100); } finally { if (connection) await connection.end(); }
    }
    if (!ready) throw new Error('Disposable native MySQL did not become ready');
    console.log(`Started isolated native MySQL on 127.0.0.1:${port}; temporary data only.`);
    return { port, password, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

module.exports = { startDisposableMysql };

import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolDir, '../..');
const databaseDir = resolve(toolDir, `clusters/${randomUUID()}`);
if (!databaseDir.startsWith(resolve(toolDir, 'clusters') + sep)) throw new Error('Invalid test directory');
const password = randomUUID();
const cluster = new EmbeddedPostgres({ databaseDir, port: 55439, user: 'postgres', password, persistent: true,
  authMethod: 'scram-sha-256', createPostgresUser: false, postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {}, onError: message => { if (String(message).includes('FATAL')) process.stderr.write('PostgreSQL test startup error.\n'); },
});
let started = false;
let stopped = false;
if (process.platform === 'win32') cluster.stop = async () => {
  if (!started || stopped) return;
  const pgCtl = resolve(toolDir, 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
  await new Promise((done, reject) => {
    const child = spawn(pgCtl, ['-D', databaseDir, '-m', 'fast', '-w', '-t', '15', 'stop'], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? done() : reject(new Error('Test PostgreSQL did not stop cleanly.')));
  });
  stopped = true;
};
try {
  await cluster.initialise(); await cluster.start(); started = true; await cluster.createDatabase('prepvista_integration_test');
  const python = process.platform === 'win32' ? resolve(root, '.venv/Scripts/python.exe') : 'python';
  const args = ['-m', 'pytest', '-q', 'tests/test_coding_database.py', `--basetemp=.pytest-coding-db-${randomUUID()}`];
  process.exitCode = await new Promise((resolveCode, reject) => {
    const child = spawn(python, args, { cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, CODING_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:55439/prepvista_integration_test` } });
    child.on('error', reject); child.on('exit', code => resolveCode(code ?? 1));
  });
} finally {
  await cluster.stop();
}

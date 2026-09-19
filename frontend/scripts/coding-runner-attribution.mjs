import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const contained = (root, candidate) => {
  const path = relative(root, candidate);
  return path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path);
};

export async function runnerAttribution(root, inputs, workerBytes) {
  root = await realpath(root);
  const lockBytes = await readFile(resolve(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const packagePaths = new Set();
  for (const input of inputs) {
    const inputPath = resolve(root, input);
    if (!contained(root, inputPath)) throw new Error('Runner input is outside its build root');
    const parts = relative(root, inputPath).replaceAll('\\', '/').split('/');
    const nodeModules = parts.lastIndexOf('node_modules');
    if (nodeModules < 0) continue;
    const end = nodeModules + (parts[nodeModules + 1]?.startsWith('@') ? 3 : 2);
    packagePaths.add(parts.slice(0, end).join('/'));
  }
  if (!packagePaths.size) throw new Error('Runner package inventory is empty');
  const packages = [];
  const notices = ['PrepVista browser coding runner: package notices',
    'Scope: external packages included in this worker bundle. This is not a whole-product license inventory.', ''];
  for (const packagePath of [...packagePaths].sort()) {
    const directory = await realpath(resolve(root, packagePath));
    if (!contained(root, directory)) throw new Error('Runner package path is outside its build root');
    const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    const locked = lock.packages?.[packagePath];
    if (!metadata.name || !metadata.version || locked?.version !== metadata.version || !locked.integrity) {
      throw new Error('Runner package does not match its locked version and integrity record');
    }
    const files = (await readdir(directory, { withFileTypes: true }))
      .filter(entry => entry.isFile() && /^(licen[cs]e|copying|notice)(?:\..+)?$/i.test(entry.name))
      .map(entry => entry.name).sort();
    if (!files.length) throw new Error('Runner package license/notice files are missing');
    const licenseFiles = [];
    notices.push(`${metadata.name}@${metadata.version}`, `Declared license: ${typeof metadata.license === 'string' ? metadata.license : 'UNDECLARED'}`);
    for (const name of files) {
      const path = await realpath(resolve(directory, name));
      if (!contained(directory, path)) throw new Error('Runner notice path is outside its package');
      const bytes = await readFile(path);
      if (!bytes.length || bytes.length > 512000 || !bytes.toString('utf8').trim()) throw new Error('Runner notice file is empty or oversized');
      notices.push(`--- ${name} ---`, bytes.toString('utf8'), '');
      licenseFiles.push({ name, sha256: hash(bytes) });
    }
    packages.push({ name: metadata.name, version: metadata.version,
      declared_license: typeof metadata.license === 'string' ? metadata.license : 'UNDECLARED',
      lock_integrity: locked.integrity, license_files: licenseFiles });
  }
  const text = notices.join('\n');
  return { notices: text, manifest: { schema_version: 1, scope: 'browser_coding_worker_external_packages',
    bundle: 'runner-v1.js', bundle_sha256: hash(workerBytes), notices: 'runner-v1.NOTICES.txt',
    notices_sha256: hash(text), lockfile_sha256: hash(lockBytes), packages,
    limitations: 'Package metadata and file hashes establish this bundle inventory; they do not establish authored CodeForge ownership or whole-product license clearance.' } };
}

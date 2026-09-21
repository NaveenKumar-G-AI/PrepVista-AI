// Optional development audit only. Never invoked by install, build, or runtime.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
const root = resolve('..');
const snapshot = JSON.parse(readFileSync('docs/source-snapshot.json', 'utf8'));
let failed = 0;
for (const file of snapshot.files) {
  const path = resolve(root, file.path);
  if (relative(root, path).startsWith('..')) throw new Error('Invalid snapshot path');
  if (!existsSync(path) || createHash('sha256').update(readFileSync(path)).digest('hex') !== file.sha256) { console.error(`Changed or missing original: ${file.path}`); failed++; }
}
const originals = new Set(snapshot.files.map(f => f.path.replaceAll('\\', '/')));
const ignored = new Set(['node_modules', '.git', '.next', '.venv', '__pycache__', '.pytest_cache']);
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) walk(child);
    else if (!originals.has(relative(root, child).replaceAll('\\', '/'))) { console.error(`Unexpected original file: ${relative(root, child)}`); failed++; }
  }
}
for (const part of snapshot.parts) walk(resolve(root, part));
console.log(`${snapshot.parts.length} original folders; ${snapshot.files.length} original file hashes; ${failed} differences.`);
if (failed) process.exitCode = 1;

import { evaluate } from './evaluate.mjs';
// No files, environment credentials or network supplied to this process.
const chunks = []; let size = 0;
try {
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 120000) throw new Error('Too large');
    chunks.push(chunk);
  }
  const result = await evaluate(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  process.stdout.write(JSON.stringify(result));
} catch {
  process.exitCode = 1; // Infrastructure/invalid-input failure is unavailable.
}

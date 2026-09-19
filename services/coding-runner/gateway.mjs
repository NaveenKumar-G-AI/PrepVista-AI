import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { executeContainer } from './container.mjs';
import { validateInput } from './evaluate.mjs';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const digest = value => createHash('sha256').update(value).digest();
export function createGateway({ token, image, concurrency = 2, execute = executeContainer }) {
  if (typeof token !== 'string' || token.length < 32 || !/^[a-z0-9][a-z0-9._:/-]+@sha256:[a-f0-9]{64}$/.test(image) ||
      !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error('Runner configuration required');
  const expected = digest('Bearer ' + token);
  let active = 0;
  const server = createServer({ maxHeaderSize: 4096, requestTimeout: 5000, headersTimeout: 5000 }, async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'connection': 'close' });
      res.end(JSON.stringify(data));
    };
    if (!timingSafeEqual(expected, digest(req.headers.authorization || ''))) return send(401, { error: 'Unauthorized' });
    if (req.method !== 'POST' || req.url !== '/v1/validate') return send(404, { error: 'Not found' });
    if (active >= concurrency) return send(429, { error: 'Runner busy' });
    if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' });
    active++;
    let timer;
    try {
      const chunks = []; let size = 0;
      timer = setTimeout(() => req.destroy(), 5000);
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 120000) { send(413, { error: 'Request too large' }); req.destroy(); return; }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      let request;
      try {
        request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        validateInput(request);
        if (Object.keys(request).sort().join(',') !== ['schema_version','job_id','lease_token','code_sha256','suite_sha256','runner_image','code','entry','tests'].sort().join(',') ||
            request.schema_version !== 1 || !UUID.test(request.job_id) || !UUID.test(request.lease_token) ||
            !HASH.test(request.code_sha256) || !HASH.test(request.suite_sha256) || request.runner_image !== image ||
            createHash('sha256').update(request.code).digest('hex') !== request.code_sha256) throw new Error('Invalid request');
      } catch { send(422, { error: 'Invalid request' }); return; }
      const result = await execute(request, image);
      // Never forward arbitrary container output. IDs/order/counts must match.
      const allowed = new Set(['PASSED','WRONG_ANSWER','RUNTIME_ERROR','TIME_LIMIT','OUTPUT_LIMIT']);
      if (!result || !Array.isArray(result.checks) || result.checks.length !== request.tests.length ||
          result.checks.some((c, i) => c.id !== request.tests[i].id || !allowed.has(c.status)) ||
          result.passed !== result.checks.filter(c => c.status === 'PASSED').length) throw new Error('Invalid result');
      send(200, { schema_version: 1, job_id: request.job_id, lease_token: request.lease_token,
        code_sha256: request.code_sha256, suite_sha256: request.suite_sha256, runner_image: image,
        checks: result.checks.map(c => ({ id: c.id, status: c.status })), passed: result.passed });
    } catch { if (!res.headersSent && !res.destroyed) send(503, { error: 'Runner unavailable' }); }
    finally { clearTimeout(timer); active--; }
  });
  server.maxConnections = 32;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.platform !== 'linux') throw new Error('Dedicated Linux runner host required');
  const server = createGateway({ token: process.env.RUNNER_SERVICE_TOKEN, image: process.env.RUNNER_IMAGE,
    concurrency: Number(process.env.RUNNER_CONCURRENCY || 2) });
  // Authenticated TLS ingress on the dedicated host terminates HTTPS. No public
  // bind or insecure remote gateway is supplied by default.
  server.listen(8081, '127.0.0.1', () => process.stdout.write('Isolated runner gateway listening on loopback\n'));
}

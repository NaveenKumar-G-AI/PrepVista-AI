export class RequestError extends Error { constructor(public status: number, message: string) { super(message); } }
const buckets = new Map<string, { count: number; until: number }>();
export async function readInput(request: Request, scope: string, limit = 12): Promise<unknown> {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  // Next.js can normalize request.url to localhost even when a browser used
  // 127.0.0.1. Host is the actual request authority; forwarded-host is untrusted.
  const host = request.headers.get('host');
  const authority = host && /^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(host) ? `${url.protocol}//${host}` : undefined;
  const allowed = [url.origin, authority, process.env.APP_ORIGIN, process.env.RENDER_EXTERNAL_URL].filter(Boolean);
  if (!origin || !allowed.includes(origin)) throw new RequestError(403, 'Open PrepVista at its configured address and try again.');
  if (!request.headers.get('content-type')?.includes('application/json')) throw new RequestError(415, 'Send a JSON request.');
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  // Global bound is intentional: forwarded client IP headers are not trusted.
  const bucket = buckets.get(scope) ?? { count: 0, until: now + 60000 };
  if (bucket.count >= limit) throw new RequestError(429, 'PrepVista is receiving many requests. Wait a minute and retry.');
  bucket.count++; buckets.set(scope, bucket);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'Enter a question or code first.');
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 64000) { await reader.cancel(); throw new RequestError(413, 'Shorten this request to less than 64 KB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'This request contains invalid JSON.'); }
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof RequestError ? error.message : 'PrepVista could not complete this request. Please retry.' }, { status: error instanceof RequestError ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
}

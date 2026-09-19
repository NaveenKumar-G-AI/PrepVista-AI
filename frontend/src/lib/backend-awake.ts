type Probe = { configured: boolean; ok: boolean; status: string; http_status?: number; service?: string; timestamp?: string | null; target?: string };

// Liveness only. Database readiness remains /health/ready on the API.
// Coalescing is per process; callers cannot choose the probe destination.
export function createAwakeProbe(fetcher: typeof fetch = fetch, timeoutMs = 4000, ttlMs = 15000) {
  let cached: { target: string; until: number; result: Probe } | undefined;
  let pending: { target: string; promise: Promise<Probe> } | undefined;
  return async (base: string): Promise<Probe> => {
    let target: string;
    try {
      if (!base) return { configured: false, ok: false, status: 'not_configured' };
      const url = new URL(base.replace(/\/$/, '') + '/health/awake');
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid backend configuration');
      target = url.toString();
    } catch { return { configured: false, ok: false, status: 'invalid_configuration' }; }
    if (cached?.target === target && cached.until > Date.now()) return cached.result;
    if (pending?.target === target) return pending.promise;
    const promise = (async (): Promise<Probe> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(target, { cache: 'no-store', redirect: 'error', signal: controller.signal, headers: { 'x-prepvista-awake': '1', 'x-prepvista-awake-source': 'frontend-awake-route' } });
        const payload = await response.json();
        const ok = response.ok && payload?.status === 'awake' && payload?.service === 'prepvista-backend';
        return { configured: true, ok, status: ok ? 'awake' : 'unreachable', http_status: response.status, service: 'prepvista-backend', timestamp: typeof payload?.timestamp === 'string' ? payload.timestamp : null, target };
      } catch { return { configured: true, ok: false, status: 'unreachable', target }; }
      finally { clearTimeout(timer); }
    })();
    pending = { target, promise };
    try {
      const result = await promise;
      cached = { target, result, until: Date.now() + ttlMs };
      return result;
    } finally { if (pending?.promise === promise) pending = undefined; }
  };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  'X-Robots-Tag': 'noindex',
};

const BACKEND_AWAKE_TIMEOUT_MS = 10000;
const BACKEND_AWAKE_RETRY_DELAY_MS = 1500;

type BackendProbeResult = {
  configured: boolean;
  ok: boolean;
  status: string;
  http_status?: number;
  service?: unknown;
  timestamp?: unknown;
  target?: string;
};

function getBackendAwakeUrl() {
  const backendBaseUrl = (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    ''
  ).replace(/\/$/, '');

  return backendBaseUrl ? `${backendBaseUrl}/health/awake` : '';
}

function getBackendCandidateUrls() {
  const awakeUrl = getBackendAwakeUrl();
  if (!awakeUrl) {
    return [];
  }

  const backendBaseUrl = awakeUrl.replace(/\/health\/awake$/, '');
  return [
    awakeUrl,
    `${backendBaseUrl}/health`,
    `${backendBaseUrl}/`,
  ];
}

async function pingBackendAwake(url: string): Promise<BackendProbeResult> {
  if (!url) {
    return {
      configured: false,
      ok: false,
      status: 'not_configured',
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), BACKEND_AWAKE_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'x-prepvista-awake': '1',
        'x-prepvista-awake-source': 'frontend-awake-route',
      },
      signal: controller?.signal,
    });

    let payload: Record<string, unknown> | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      configured: true,
      ok: response.ok,
      status: response.ok ? 'awake' : 'unreachable',
      http_status: response.status,
      service: payload?.service || 'prepvista-backend',
      timestamp: payload?.timestamp || null,
      target: url,
    };
  } catch {
    return {
      configured: true,
      ok: false,
      status: 'unreachable',
      target: url,
    };
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function probeBackendWithFallbacks(): Promise<BackendProbeResult> {
  const candidateUrls = getBackendCandidateUrls();
  if (!candidateUrls.length) {
    return {
      configured: false,
      ok: false,
      status: 'not_configured',
    };
  }

  let lastResult: BackendProbeResult = {
    configured: true,
    ok: false,
    status: 'unreachable',
  };

  for (let round = 0; round < 2; round += 1) {
    for (const url of candidateUrls) {
      const result = await pingBackendAwake(url);
      if (result.ok) {
        return result;
      }
      lastResult = result;
    }

    if (round === 0) {
      await new Promise(resolve => setTimeout(resolve, BACKEND_AWAKE_RETRY_DELAY_MS));
    }
  }

  return lastResult;
}

export async function GET() {
  const backend = await probeBackendWithFallbacks();

  return Response.json(
    {
      status: 'awake',
      service: 'prepvista-frontend',
      timestamp: new Date().toISOString(),
      backend,
    },
    {
      headers: NO_STORE_HEADERS,
    },
  );
}
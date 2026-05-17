'use client';

import { useEffect } from 'react';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const KEEPALIVE_TIMEOUT_MS = 12000;

function getKeepaliveIntervalMs() {
  const rawValue = Number(process.env.NEXT_PUBLIC_AWAKE_INTERVAL_MS || TEN_MINUTES_MS);
  if (!Number.isFinite(rawValue)) {
    return TEN_MINUTES_MS;
  }
  return Math.max(rawValue, FIVE_MINUTES_MS);
}

async function pingEndpoint(url: string) {
  if (!url || typeof window === 'undefined' || navigator.onLine === false) {
    return;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutHandle = controller
    ? window.setTimeout(() => controller.abort(), KEEPALIVE_TIMEOUT_MS)
    : null;

  try {
    await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      keepalive: true,
      headers: {
        'x-prepvista-awake': '1',
      },
      signal: controller?.signal,
    });
  } catch {
    /* warmup failures should stay silent */
  } finally {
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  }
}

export function AwakeKeeper() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DISABLE_AWAKE === 'true') {
      return;
    }

    let lastPingTime = 0;
    const COOLDOWN_MS = 60_000; // Don't ping more than once per 60s on focus/visibility

    const pingAll = () => {
      void pingEndpoint('/api/awake');
    };

    const pingWithCooldown = () => {
      const now = Date.now();
      if (now - lastPingTime < COOLDOWN_MS) return;
      lastPingTime = now;
      pingAll();
    };

    const initialWarmupDelayMs = 2500 + Math.round(Math.random() * 2500);
    const initialWarmup = window.setTimeout(() => {
      lastPingTime = Date.now();
      pingAll();
    }, initialWarmupDelayMs);

    const intervalHandle = window.setInterval(() => {
      lastPingTime = Date.now();
      pingAll();
    }, getKeepaliveIntervalMs());

    const handleFocus = () => { pingWithCooldown(); };
    const handleOnline = () => { pingWithCooldown(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') { pingWithCooldown(); }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearTimeout(initialWarmup);
      window.clearInterval(intervalHandle);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
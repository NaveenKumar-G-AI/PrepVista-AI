'use client';
/**
 * PrepVista — College Admin: Student Leaderboard
 * Route: /org-admin/leaderboard
 *
 * The Student Scoreboard is served as a self-contained static asset
 * (/scoreboard.html) and embedded here in an iframe. We fetch the org's REAL
 * cohort from /org/my/leaderboard and inject it into the board via its data
 * seam (window.PVSB.load), so the podium, charts and ranked table all render on
 * live data. The asset's own chart engine is untouched.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface LeaderboardPayload {
  college: string;
  depts: Array<{ code: string; name: string }>;
  years: number[];
  students: unknown[];
}

export default function LeaderboardPage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dataRef = useRef<LeaderboardPayload | null>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Push the real data into the iframe once both sides are ready.
    const trySend = () => {
      const win = iframeRef.current?.contentWindow;
      if (win && readyRef.current && dataRef.current) {
        win.postMessage({ __pvsb: 'load', payload: dataRef.current }, '*');
      }
    };

    // The embedded scoreboard posts {__pvsb:'ready'} once its script has run.
    const onMessage = (e: MessageEvent) => {
      if (e?.data && e.data.__pvsb === 'ready') {
        readyRef.current = true;
        trySend();
      }
    };
    window.addEventListener('message', onMessage);

    api
      .getLeaderboard<LeaderboardPayload>()
      .then((d) => {
        if (!alive) return;
        dataRef.current = d;
        setLoading(false);
        trySend();
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load the leaderboard.');
        setLoading(false);
      });

    return () => {
      alive = false;
      window.removeEventListener('message', onMessage);
    };
  }, []);

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#b91c1c' }}>
        <p style={{ fontWeight: 600, marginBottom: 8 }}>Could not load the Leaderboard</p>
        <p style={{ fontSize: 14, color: '#6b7280' }}>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 1px)', background: '#090A0E' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#AFB4C2', font: '500 14px Inter, sans-serif', zIndex: 2, pointerEvents: 'none' }}>
          Loading your cohort…
        </div>
      )}
      <iframe
        ref={iframeRef}
        src="/scoreboard.html?embed=1"
        title="Student Leaderboard"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}

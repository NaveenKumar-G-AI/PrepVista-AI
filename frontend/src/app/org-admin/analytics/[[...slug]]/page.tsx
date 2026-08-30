'use client';
/**
 * PrepVista — College Admin: Placement Command Centre
 * Route: /org-admin/analytics
 *
 * The full 67-chart Command Centre is served as a self-contained static asset
 * (/command-centre.html) and embedded here in an iframe. We fetch the org's REAL
 * cohort from /org/my/command-centre and inject it into the dashboard via its
 * data seam (window.PVCC.load), so every chart renders on live data. The asset's
 * own chart engine is untouched — guaranteeing the interface is exact.
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface CommandCentrePayload {
  college: string;
  batch: string;
  seats: number;
  annualFee: number | null;
  billingType: string | null;
  cycleStart: string | null;
  renewalDate: string | null;
  history: {
    labels: string[];
    readiness: Array<number | null>;
    interviews: number[];
    atRisk: number[];
  };
  depts: Array<{ code: string; name: string }>;
  students: unknown[];
}

export default function AnalyticsCommandCentrePage() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const dataRef = useRef<CommandCentrePayload | null>(null);
  const readyRef = useRef(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Push the real data into the iframe once both sides are ready.
    const trySend = () => {
      const win = iframeRef.current?.contentWindow;
      if (win && readyRef.current && dataRef.current) {
        win.postMessage({ __pvcc: 'load', payload: dataRef.current }, window.location.origin);
      }
    };

    // The embedded dashboard posts {__pvcc:'ready'} once its script has run.
    const onMessage = (e: MessageEvent) => {
      const trusted = (
        (e.origin === 'null' || e.origin === window.location.origin)
        && e.source === iframeRef.current?.contentWindow
        && e?.data
      );
      if (!trusted) return;
      if (e.data.__pvcc === 'ready') {
        readyRef.current = true;
        trySend();
        return;
      }
      if (
        e.data.__pvcc === 'download'
        && e.data.bytes instanceof ArrayBuffer
        && e.data.bytes.byteLength <= 100 * 1024 * 1024
      ) {
        const filename = String(e.data.filename || 'PrepVista_Placement_Report.pdf')
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .slice(0, 180);
        const url = URL.createObjectURL(new Blob([e.data.bytes], { type: 'application/pdf' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }
    };
    window.addEventListener('message', onMessage);

    api
      .getCommandCentre<CommandCentrePayload>()
      .then((d) => {
        if (!alive) return;
        dataRef.current = d;
        setLoading(false);
        trySend();
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load analytics.');
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
        <p style={{ fontWeight: 600, marginBottom: 8 }}>Could not load the Command Centre</p>
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
        src="/command-centre.html?embed=1"
        title="Placement Command Centre"
        sandbox="allow-scripts allow-downloads"
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

// Parent keys this component by owner and snapshot, so an account change or
// navigation invalidates an in-flight private download before creating a Blob.
export function ReadinessExport({ snapshotId }: { snapshotId: string }) {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function download(format: 'json' | 'html') {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const report = await api.request<{ filename: string; media_type: string; content: string }>(
        `/journey/snapshots/${encodeURIComponent(snapshotId)}/export?format=${format}`);
      if (!active.current) return;
      if (report.filename !== `prepvista-readiness-${snapshotId}.${format}` ||
          report.media_type !== (format === 'json' ? 'application/json' : 'text/html') || typeof report.content !== 'string') {
        throw new Error('The report response could not be read. Please try again.');
      }
      const url = URL.createObjectURL(new Blob([report.content], { type: `${report.media_type};charset=utf-8` }));
      const link = document.createElement('a');
      link.href = url; link.download = report.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (active.current) setError('The saved report could not be downloaded. Your snapshot is preserved; try again when the service is available.');
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return <div className="space-y-2">
    <p className="text-sm">Download a private copy of this saved snapshot. The HTML file opens offline and can be printed or saved as PDF in your browser. Copies you download or send cannot be recalled by changing sharing settings.</p>
    <div className="flex flex-wrap gap-3">
      <button className="btn-secondary" disabled={busy} onClick={() => void download('html')}>Download printable report</button>
      <button className="underline" disabled={busy} onClick={() => void download('json')}>Download report JSON</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </div>;
}

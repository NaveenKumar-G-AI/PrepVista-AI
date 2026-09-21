import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, UploadCloud } from 'lucide-react';
import type { createSkillGraphClient } from '../api/skillGraphClient';
import type { GraphVersionSummary, ValidationReport } from '../api/types';

export interface AdminSkillGraphConsoleProps {
  client: ReturnType<typeof createSkillGraphClient>;
}

export function AdminSkillGraphConsole({ client }: AdminSkillGraphConsoleProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [versions, setVersions] = useState<GraphVersionSummary[]>([]);
  const [busy, setBusy] = useState<'validate' | 'publish' | null>(null);
  const [publishMessage, setPublishMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadVersions() {
    try {
      const res = await client.adminListVersions();
      setVersions(res.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runValidate() {
    setBusy('validate');
    setError(null);
    try {
      const res = await client.adminValidate();
      setReport(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function runPublish() {
    setBusy('publish');
    setError(null);
    setPublishMessage(null);
    try {
      const res = await client.adminPublish();
      setReport(res.report);
      setPublishMessage(res.published ? 'Published successfully.' : 'Publish blocked — critical issues below must be resolved first.');
      if (res.published) await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const hasCritical = (report?.criticalCount ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 font-display text-lg font-semibold text-ink">Graph administration</h2>
        <p className="text-sm text-ink-soft">Validate, then publish. Publishing is blocked automatically while critical issues remain (section 59).</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={runValidate} disabled={busy !== null} className="flex items-center gap-1.5 rounded-full border border-line bg-white/60 px-4 py-2 text-sm font-medium text-ink hover:border-ink disabled:opacity-50">
          <RefreshCw size={14} className={busy === 'validate' ? 'animate-spin' : ''} /> Run validation
        </button>
        <button
          type="button"
          onClick={runPublish}
          disabled={busy !== null || hasCritical}
          title={hasCritical ? 'Resolve critical issues before publishing' : undefined}
          className="flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <UploadCloud size={14} /> Publish
        </button>
      </div>

      {error && <p className="rounded-card border border-warn/40 bg-warn-soft p-3 text-sm text-warn">{error}</p>}
      {publishMessage && <p className={`rounded-card p-3 text-sm ${hasCritical ? 'border border-warn/40 bg-warn-soft text-warn' : 'border border-verbal/40 bg-verbal-soft text-verbal'}`}>{publishMessage}</p>}

      {report && (
        <div className="rounded-card border border-line bg-white/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            {report.isValid ? <CheckCircle2 size={18} className="text-verbal" /> : <AlertTriangle size={18} className="text-warn" />}
            <p className="font-display text-sm font-semibold text-ink">
              {report.issueCount === 0 ? 'No integrity issues found.' : `${report.criticalCount} critical, ${report.warningCount} warning issue${report.warningCount === 1 ? '' : 's'}`}
            </p>
          </div>
          <ul className="space-y-2">
            {report.issues.map((issue, i) => (
              <li key={i} className={`rounded-card border px-3 py-2 text-sm ${issue.severity === 'CRITICAL' ? 'border-warn/40 bg-warn-soft text-warn' : 'border-focus/40 bg-focus-soft text-focus'}`}>
                <span className="mr-2 rounded-full bg-white/60 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">{issue.severity}</span>
                <span className="font-mono text-xs">{issue.type}</span>
                <p className="mt-0.5 text-ink">{issue.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="mb-2 font-display text-sm font-semibold text-ink">Version history</h3>
        <ul className="space-y-1.5">
          {versions.map((v) => (
            <li key={v.id} className="flex items-center justify-between rounded-card border border-line bg-white/60 px-3 py-2 text-sm">
              <span className="font-mono text-xs text-ink-soft">{v.versionLabel}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.status === 'PUBLISHED' ? 'bg-verbal-soft text-verbal' : v.status === 'ARCHIVED' ? 'bg-line text-ink-soft' : 'bg-focus-soft text-focus'}`}>{v.status}</span>
            </li>
          ))}
          {versions.length === 0 && <p className="text-sm text-ink-soft">No versions yet.</p>}
        </ul>
      </div>
    </div>
  );
}

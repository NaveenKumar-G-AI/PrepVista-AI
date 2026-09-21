import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { readinessClient } from '../api/readinessClient';
import type { CapabilityStatus, EvidenceItem } from '../types';
import { EvidenceLadder } from './EvidenceLadder';

const SOURCE_LABEL: Record<EvidenceItem['sourceType'], string> = {
  SELF_REPORT: 'Self-report',
  TRAINING: 'Training',
  CERTIFICATE: 'Certificate',
  ASSESSMENT: 'Assessment',
  CODING_TEST: 'Coding test',
  PROJECT: 'Project',
  SIMULATION: 'Simulation',
  MOCK_INTERVIEW: 'Mock interview',
  INTERVIEW: 'Interview',
  RESUME: 'Resume',
  PORTFOLIO: 'Portfolio',
  OPPORTUNITY_OUTCOME: 'Real opportunity outcome',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function resultText(item: EvidenceItem): string {
  if (item.score !== null) return `${item.score}/100`;
  if (item.outcome) return item.outcome.charAt(0) + item.outcome.slice(1).toLowerCase();
  if (item.claimedLevel) return `Self-described as ${item.claimedLevel.toLowerCase()}`;
  return 'Recorded, no score';
}

function strengthenSuggestion(status: CapabilityStatus): string {
  if (status.hasConflict) return 'A realistic, applied simulation would help resolve the disagreement between sources.';
  if (status.label === 'UNKNOWN') return 'Any recorded evidence — even a self-report — would give this a starting point.';
  if (status.freshnessState === 'STALE' || status.freshnessState === 'REVALIDATION_RECOMMENDED') {
    return 'This evidence is aging — a fresh attempt would restore confidence.';
  }
  if (status.independentSourceCount < 2) return 'A second, independent source would raise confidence in this result.';
  return 'This capability is already well supported by multiple independent sources.';
}

export function EvidenceDetailModal({
  studentId,
  roleId,
  status,
  onClose,
}: {
  studentId: string;
  roleId: string;
  status: CapabilityStatus;
  onClose: () => void;
}) {
  const [items, setItems] = useState<EvidenceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    readinessClient
      .getCapabilityEvidence(studentId, roleId, status.capabilityId)
      .then((res) => {
        if (!cancelled) setItems(res.evidence);
      })
      .catch(() => {
        if (!cancelled) setError('Evidence detail is temporarily unavailable.');
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, roleId, status.capabilityId]);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-detail-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-card bg-paper p-6 shadow-xl outline-none sm:rounded-card sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wide text-ink/45">Evidence detail</p>
            <h2 id="evidence-detail-title" className="mt-1 text-xl font-semibold text-ink">
              {status.capabilityName}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close evidence detail"
            className="rounded-full p-1.5 text-ink/50 transition-colors hover:bg-paper-dim hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4">
          <EvidenceLadder achievedClass={status.achievedClass} hasConflict={status.hasConflict} />
        </div>

        {status.hasConflict && status.conflictExplanation && (
          <div className="mt-4 rounded-md bg-pending-soft px-3.5 py-3 text-sm text-pending" role="note">
            <p className="font-medium">Evidence conflict</p>
            <p className="mt-1 text-pending/90">{status.conflictExplanation}</p>
          </div>
        )}

        <div className="mt-5 border-t border-paper-line pt-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ink/45">Contributing evidence</p>

          {error && <p className="mt-3 text-sm text-gap">{error}</p>}

          {!error && items === null && (
            <ul className="mt-3 space-y-2" aria-hidden="true">
              {[0, 1].map((i) => (
                <li key={i} className="h-14 animate-pulse rounded-md bg-paper-dim" />
              ))}
            </ul>
          )}

          {items !== null && items.length === 0 && <p className="mt-3 text-sm text-ink/60">No evidence recorded yet for this capability.</p>}

          {items !== null && items.length > 0 && (
            <ul className="mt-3 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-md border border-paper-line bg-white/60 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-ink">{SOURCE_LABEL[item.sourceType]}</span>
                    <span className="font-mono text-[11px] text-ink/50">{formatDate(item.occurredAt)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/75">
                    <span>Result: {resultText(item)}</span>
                    {item.validationState === 'VALIDATED' && <span className="text-evidence">Validated</span>}
                    {item.validationState === 'DISPUTED' && <span className="text-gap">Disputed</span>}
                  </div>
                  {item.context && <p className="mt-1.5 text-sm italic text-ink/60">"{item.context}"</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 border-t border-paper-line pt-4">
          <p className="font-mono text-xs uppercase tracking-wide text-ink/45">What would strengthen it</p>
          <p className="mt-2 text-sm text-ink/80">{strengthenSuggestion(status)}</p>
        </div>
      </div>
    </div>
  );
}

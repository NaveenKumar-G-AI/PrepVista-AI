import type { SubmissionStatus, Verdict } from '../domain/enums.js';

export interface SubmissionHistoryRow {
  id: string;
  submissionNumber: number;
  language: string;
  createdAt: string;
  status: SubmissionStatus;
  verdict: Verdict | null;
  score: number | null;
}

export interface SubmissionHistoryPanelProps {
  rows: SubmissionHistoryRow[];
  onSelect?: (submissionId: string) => void;
}

const VERDICT_SHORT: Partial<Record<Verdict, string>> = {
  ACCEPTED: 'AC',
  WRONG_ANSWER: 'WA',
  COMPILATION_ERROR: 'CE',
  RUNTIME_ERROR: 'RE',
  TIME_LIMIT_EXCEEDED: 'TLE',
  MEMORY_LIMIT_EXCEEDED: 'MLE',
  OUTPUT_LIMIT_EXCEEDED: 'OLE',
  SYSTEM_ERROR: 'SE',
  JUDGE_ERROR: 'JE',
};

export function SubmissionHistoryPanel({ rows, onSelect }: SubmissionHistoryPanelProps) {
  if (rows.length === 0) {
    return <p className="cf-history-empty">No submissions yet for this attempt.</p>;
  }

  return (
    <table className="cf-history-table">
      <style>{`
        .cf-history-empty { color: #9a9fab; font-size: 13px; font-family: ui-sans-serif, sans-serif; }
        .cf-history-table { width: 100%; border-collapse: collapse; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; color: #e8e6e1; }
        .cf-history-table th { text-align: left; font-weight: 600; color: #9a9fab; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; padding: 6px 10px; border-bottom: 1px solid #2a2e37; }
        .cf-history-table td { padding: 8px 10px; border-bottom: 1px solid #22252c; }
        .cf-history-row { cursor: pointer; }
        .cf-history-row:hover { background: #20232a; }
        .cf-history-row:focus-visible { outline: 2px solid #ff6a3d; outline-offset: -2px; }
      `}</style>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Language</th>
          <th scope="col">Submitted</th>
          <th scope="col">Status</th>
          <th scope="col">Verdict</th>
          <th scope="col">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className="cf-history-row"
            tabIndex={onSelect ? 0 : undefined}
            role={onSelect ? 'button' : undefined}
            onClick={() => onSelect?.(row.id)}
            onKeyDown={(e: { key: string }) => {
              if (onSelect && (e.key === 'Enter' || e.key === ' ')) onSelect(row.id);
            }}
          >
            <td>{row.submissionNumber}</td>
            <td>{row.language}</td>
            <td>{new Date(row.createdAt).toLocaleString()}</td>
            <td>{row.status}</td>
            <td>{row.verdict ? (VERDICT_SHORT[row.verdict] ?? row.verdict) : '—'}</td>
            <td>{row.score !== null ? `${row.score}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

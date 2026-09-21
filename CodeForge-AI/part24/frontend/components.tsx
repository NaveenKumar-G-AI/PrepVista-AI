import { useState } from 'react';
import {
  AlertOctagon, AlertTriangle, Info, CircleDot, CheckCircle2,
  MessageSquare, ChevronDown, ChevronRight,
} from 'lucide-react';

// Local, portable type slice mirroring src/domain/types.ts — duplicated
// deliberately so this folder can be dropped into the real CodeForge
// frontend without a cross-package import dependency on the engine.
export type Severity = 'BLOCKER' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type Priority = 'MUST_FIX' | 'SHOULD_FIX' | 'CONSIDER' | 'OPTIONAL';
export type FindingStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'FIXED' | 'RESOLVED' | 'REOPENED' | 'WONT_FIX' | 'SUPERSEDED';
export type ResponseType = 'ACKNOWLEDGE' | 'FIXED' | 'EXPLAIN' | 'DISAGREE' | 'REQUEST_CLARIFICATION' | 'WONT_FIX';

export interface UIEvidence {
  source: string;
  description: string;
  deterministic: boolean;
}
export interface UIFinding {
  id: string;
  category: string;
  severity: Severity;
  priority: Priority;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  whyItMatters: string;
  evidence: UIEvidence[];
  sourceLocation?: { file: string; startLine: number; endLine: number };
  sourceSnippet?: string;
  status: FindingStatus;
  isPositive: boolean;
}
export interface UIMessage {
  id: string;
  author: 'reviewer' | 'developer';
  responseType?: ResponseType;
  content: string;
  createdAt: string;
}
export interface UIDecision {
  decision: 'APPROVE' | 'APPROVE_WITH_SUGGESTIONS' | 'CHANGES_REQUESTED' | 'BLOCKED' | 'NEEDS_REVIEW';
  readiness: 'READY' | 'READY_WITH_SUGGESTIONS' | 'NOT_READY' | 'BLOCKED';
  rationale: string;
}

const SEVERITY_STYLE: Record<Severity, { text: string; bg: string; ring: string; icon: typeof AlertOctagon }> = {
  BLOCKER: { text: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200', icon: AlertOctagon },
  HIGH: { text: 'text-orange-700', bg: 'bg-orange-50', ring: 'ring-orange-200', icon: AlertTriangle },
  MEDIUM: { text: 'text-amber-700', bg: 'bg-amber-50', ring: 'ring-amber-200', icon: AlertTriangle },
  LOW: { text: 'text-blue-700', bg: 'bg-blue-50', ring: 'ring-blue-200', icon: CircleDot },
  INFO: { text: 'text-slate-600', bg: 'bg-slate-50', ring: 'ring-slate-200', icon: Info },
};

const DECISION_STYLE: Record<UIDecision['decision'], { text: string; bg: string; label: string }> = {
  APPROVE: { text: 'text-emerald-800', bg: 'bg-emerald-50 ring-emerald-200', label: 'Approved' },
  APPROVE_WITH_SUGGESTIONS: { text: 'text-emerald-800', bg: 'bg-emerald-50 ring-emerald-200', label: 'Approved, with suggestions' },
  CHANGES_REQUESTED: { text: 'text-amber-800', bg: 'bg-amber-50 ring-amber-200', label: 'Changes requested' },
  BLOCKED: { text: 'text-red-800', bg: 'bg-red-50 ring-red-200', label: 'Blocked' },
  NEEDS_REVIEW: { text: 'text-slate-700', bg: 'bg-slate-100 ring-slate-200', label: 'Needs review' },
};

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function DecisionBanner({ decision }: { decision: UIDecision }) {
  const style = DECISION_STYLE[decision.decision];
  return (
    <div className={`rounded-lg ring-1 ring-inset p-4 ${style.bg}`}>
      <div className={`text-sm font-semibold ${style.text}`}>{style.label}</div>
      <div className="mt-1 text-sm text-slate-600">{decision.rationale}</div>
    </div>
  );
}

export function ReviewSummaryBar({ counts }: {
  counts: { filesChanged: number; linesChanged: number; blockers: number; highPriority: number; suggestions: number; positive: number };
}) {
  const items = [
    { label: 'files changed', value: counts.filesChanged },
    { label: 'lines changed', value: counts.linesChanged },
    { label: 'blockers', value: counts.blockers, tone: counts.blockers > 0 ? 'text-red-700' : 'text-slate-500' },
    { label: 'must-fix', value: counts.highPriority, tone: counts.highPriority > 0 ? 'text-orange-700' : 'text-slate-500' },
    { label: 'suggestions', value: counts.suggestions, tone: 'text-blue-700' },
    { label: 'positive notes', value: counts.positive, tone: 'text-emerald-700' },
  ];
  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-1.5">
          <span className={`text-lg font-semibold tabular-nums ${'tone' in item ? item.tone : 'text-slate-800'}`}>{item.value}</span>
          <span className="text-xs text-slate-500">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: UIEvidence[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {evidence.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
          <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-500">{e.source}</span>
          <span>{e.description}</span>
        </li>
      ))}
    </ul>
  );
}

export function FindingCard({ finding, messages, onRespond }: {
  finding: UIFinding;
  messages: UIMessage[];
  onRespond: (responseType: ResponseType, content: string) => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(finding.severity === 'BLOCKER');
  const style = SEVERITY_STYLE[finding.severity];
  const Icon = finding.isPositive ? CheckCircle2 : style.icon;

  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${finding.status === 'RESOLVED' ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${finding.isPositive ? 'text-emerald-600' : style.text}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {!finding.isPositive && <Badge className={`${style.text} ${style.bg} ${style.ring}`}>{finding.severity}</Badge>}
            <Badge className="text-slate-600 bg-slate-50 ring-slate-200">{finding.category}</Badge>
            <Badge className="text-slate-500 bg-white ring-slate-200">{finding.status}</Badge>
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">{finding.title}</div>
          {finding.sourceLocation && (
            <div className="mt-0.5 font-mono text-xs text-slate-400">
              {finding.sourceLocation.file}:{finding.sourceLocation.startLine}-{finding.sourceLocation.endLine}
            </div>
          )}
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          <p className="text-sm text-slate-700">{finding.description}</p>
          <div className="rounded bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why it matters</div>
            <p className="mt-0.5 text-sm text-slate-600">{finding.whyItMatters}</p>
          </div>
          {finding.sourceSnippet && (
            <pre className="overflow-x-auto rounded bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">{finding.sourceSnippet}</pre>
          )}
          <EvidenceList evidence={finding.evidence} />

          {!finding.isPositive && (
            <ReviewThread findingId={finding.id} messages={messages} onRespond={onRespond} />
          )}
        </div>
      )}
    </div>
  );
}

const RESPONSE_ACTIONS: { type: ResponseType; label: string }[] = [
  { type: 'ACKNOWLEDGE', label: 'Acknowledge' },
  { type: 'FIXED', label: 'Mark fixed' },
  { type: 'EXPLAIN', label: 'Explain' },
  { type: 'DISAGREE', label: 'Disagree' },
  { type: 'REQUEST_CLARIFICATION', label: 'Ask for clarification' },
  { type: 'WONT_FIX', label: "Won't fix" },
];

export function ReviewThread({ messages, onRespond }: {
  findingId: string;
  messages: UIMessage[];
  onRespond: (responseType: ResponseType, content: string) => void | Promise<void>;
}) {
  const [content, setContent] = useState('');
  const [responseType, setResponseType] = useState<ResponseType>('EXPLAIN');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onRespond(responseType, content.trim());
      setContent('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-slate-100 pt-3">
      {messages.length > 0 && (
        <ul className="mb-3 space-y-2">
          {messages.map((m) => (
            <li key={m.id} className="flex gap-2 text-sm">
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
              <div>
                <span className="font-medium text-slate-700">{m.author === 'developer' ? 'You' : 'Reviewer'}</span>
                {m.responseType && <span className="ml-1.5 text-xs text-slate-400">{m.responseType.replace('_', ' ').toLowerCase()}</span>}
                <p className="text-slate-600">{m.content}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {RESPONSE_ACTIONS.map((a) => (
          <button
            key={a.type}
            type="button"
            onClick={() => setResponseType(a.type)}
            className={`rounded px-2 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
              responseType === a.type ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Explain your reasoning, cite what you changed, or ask a question…"
        rows={2}
        className="mt-2 w-full resize-none rounded border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!content.trim() || submitting}
        className="mt-1.5 rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
      >
        {submitting ? 'Sending…' : 'Send response'}
      </button>
    </div>
  );
}

export function FindingsList({ findings, messagesByFinding, onRespond }: {
  findings: UIFinding[];
  messagesByFinding: Record<string, UIMessage[]>;
  onRespond: (findingId: string, responseType: ResponseType, content: string) => void | Promise<void>;
}) {
  const rank: Record<Severity, number> = { BLOCKER: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
  const sorted = [...findings].sort((a, b) => (a.isPositive === b.isPositive ? rank[a.severity] - rank[b.severity] : a.isPositive ? 1 : -1));

  return (
    <div className="space-y-2">
      {sorted.map((f) => (
        <FindingCard
          key={f.id}
          finding={f}
          messages={messagesByFinding[f.id] ?? []}
          onRespond={(type, content) => onRespond(f.id, type, content)}
        />
      ))}
    </div>
  );
}

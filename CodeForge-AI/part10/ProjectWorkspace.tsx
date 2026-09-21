'use client';

/**
 * Project Workspace (Phase 45/46/76) — the primary screen for one project
 * session. Written but not compiled against a real build toolchain (no
 * React/Next.js/Tailwind pipeline in the sandbox this was built in) — read
 * it carefully before dropping it in. See ../TRUTH_REPORT.md.
 *
 * Type pairing this was designed for: IBM Plex Mono for anything
 * code/data/status/labels, IBM Plex Sans for prose (requirements text,
 * feedback). Wire that via your tailwind.config's fontFamily.sans/mono —
 * this file only uses the font-sans / font-mono utilities, it doesn't
 * hardcode a font name, so it'll pick up whatever those resolve to.
 *
 * Integration seams (intentional, not missing work):
 *  - CodePlaceholderPanel: mount your EXISTING code editor here (Phase 2)
 *  - handleRun(): replace the demo block with a call to your real
 *    evaluation endpoint (which calls evaluateSubmission() server-side)
 *  - ArchitecturePanel: wire to your architecture/decision workspace if
 *    you build Phase 8 out further than this slice does
 */

import { useState } from 'react';
import type { ProjectDefinition, AcceptanceCriterion, EvaluationFeedbackItem } from '../src/types';

// ------------------------------------------------------------
// Design tokens — warm-graphite workspace, brass "instrument panel"
// accent. Chosen over a pure-black/neon dark theme deliberately: engineers
// living in dark editors for hours is earned, but the accent references an
// analog instrument panel rather than a hacker-movie glow, and status
// colors are muted rather than saturated so a wall of red/green never
// reads as an alarm panel.
// ------------------------------------------------------------
const tokens: Record<string, string> = {
  '--ink-950': '#14161C',
  '--ink-900': '#1B1E27',
  '--line': '#363D4D',
  '--paper': '#E8E6DE',
  '--muted': '#8B92A6',
  '--brass': '#E3A857',
  '--sage': '#6FBF8B',
  '--clay': '#D97C6B',
};

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brass)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink-950)]';

type TabKey = 'requirements' | 'architecture' | 'code' | 'tests' | 'docs';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'requirements', label: 'Requirements' },
  { key: 'architecture', label: 'Architecture' },
  { key: 'code', label: 'Code' },
  { key: 'tests', label: 'Tests' },
  { key: 'docs', label: 'Docs' },
];

interface LedgerEvent {
  id: string;
  label: string;
  status: 'met' | 'unmet' | 'note';
  timestamp: string;
}

export interface ProjectWorkspaceProps {
  project: ProjectDefinition;
  /** Why the adaptive engine picked this project for this student (Phase 44/74/75) — never a black box. */
  recommendationReason?: string;
  /** Wire this to your real evaluation endpoint; handleRun() below only simulates it. */
  onRunEvaluation?: () => Promise<{
    breakdown: Array<{ key: string; label: string; rawScore: number }>;
    feedback: EvaluationFeedbackItem[];
  }>;
}

export default function ProjectWorkspace({ project, recommendationReason, onRunEvaluation }: ProjectWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('requirements');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [running, setRunning] = useState(false);
  const [ledger, setLedger] = useState<LedgerEvent[]>(
    project.acceptanceCriteria
      .filter((c) => c.testType === 'visible')
      .map((c) => ({ id: c.id, label: c.description, status: 'unmet', timestamp: '—' }))
  );

  const visibleCriteria = project.acceptanceCriteria.filter((c) => c.testType === 'visible');
  const hiddenCount = project.acceptanceCriteria.filter((c) => c.testType === 'hidden').length;

  async function handleRun() {
    setRunning(true);
    try {
      // DEMO ONLY — replace with onRunEvaluation() calling your real
      // evaluation endpoint. This just marks visible criteria "met" and
      // logs it, so the ledger has something to show.
      const now = new Date().toLocaleTimeString();
      setLedger((prev) =>
        prev.map((e) => (visibleCriteria.some((c) => c.id === e.id) ? { ...e, status: 'met' as const, timestamp: now } : e))
      );
      setLedger((prev) => [
        ...prev,
        { id: `note-${Date.now()}`, label: `${hiddenCount} hidden criteria remain — held back until submission`, status: 'note', timestamp: now },
      ]);
      if (onRunEvaluation) await onRunEvaluation();
    } finally {
      setRunning(false);
    }
  }

  return (
    <div
      style={tokens as React.CSSProperties}
      className="flex h-full min-h-[640px] w-full flex-col bg-[var(--ink-950)] font-sans text-[var(--paper)]"
    >
      {/* Ticket header — the page's thesis: a real assignment, not a quiz */}
      <header className="border-b border-[var(--line)] px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              {project.role} · {project.difficulty.replace(/_/g, ' ')} · ~{project.timeEstimateMinutes} min
            </p>
            <h1 className="mt-1 font-mono text-xl font-semibold text-[var(--paper)]">{project.title}</h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {project.skills.map((skill) => (
              <span key={skill} className="rounded-sm border border-[var(--line)] px-2 py-0.5 font-mono text-[11px] text-[var(--muted)]">
                {skill.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
        {recommendationReason && (
          <p className="mt-3 border-l-2 border-[var(--brass)] pl-3 font-mono text-[13px] leading-relaxed text-[var(--muted)]">
            <span className="text-[var(--brass)]">recommended because</span> — {recommendationReason}
          </p>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main work surface */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <nav className="flex border-b border-[var(--line)] px-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 font-mono text-[13px] transition-colors ${FOCUS_RING} ${
                  activeTab === tab.key
                    ? 'border-b-2 border-[var(--brass)] text-[var(--paper)]'
                    : 'border-b-2 border-transparent text-[var(--muted)] hover:text-[var(--paper)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activeTab === 'requirements' && <RequirementsPanel project={project} />}
            {activeTab === 'architecture' && <ArchitecturePanel />}
            {activeTab === 'code' && <CodePlaceholderPanel />}
            {activeTab === 'tests' && <TestsPanel criteria={project.acceptanceCriteria} ledger={ledger} />}
            {activeTab === 'docs' && <DocsPanel requirements={project.documentationRequirements} />}
          </div>

          {/* Terminal / run panel — collapsible, quiet until used (Phase 47:
              don't continuously interrupt with AI suggestions) */}
          <div className="border-t border-[var(--line)]">
            <button
              onClick={() => setTerminalOpen((v) => !v)}
              className={`flex w-full items-center justify-between px-6 py-2 font-mono text-[11px] uppercase tracking-wide text-[var(--muted)] hover:text-[var(--paper)] ${FOCUS_RING}`}
            >
              <span>terminal</span>
              <span>{terminalOpen ? '▾' : '▸'}</span>
            </button>
            {terminalOpen && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] bg-[var(--ink-900)] px-6 py-3">
                <p className="font-mono text-[12px] text-[var(--muted)]">
                  {visibleCriteria.length} visible checks · {hiddenCount} hidden checks held back until submission
                </p>
                <button
                  onClick={handleRun}
                  disabled={running}
                  className={`rounded-sm bg-[var(--brass)] px-3 py-1.5 font-mono text-[12px] font-medium text-[var(--ink-950)] disabled:opacity-60 ${FOCUS_RING}`}
                >
                  {running ? 'running…' : 'run visible checks'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Signature element: the Evidence Ledger. Not a progress bar or a
            percentage ring — a timestamped log of what's actually been
            demonstrated, because completion here is evidence-based, not
            click-based (Phase 46). */}
        <aside className="hidden w-72 shrink-0 flex-col border-l border-[var(--line)] bg-[var(--ink-900)] md:flex">
          <div className="border-b border-[var(--line)] px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">evidence ledger</p>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {ledger.length === 0 && (
              <p className="font-mono text-[12px] text-[var(--muted)]">Nothing logged yet — run the visible checks to start.</p>
            )}
            {ledger.map((event) => (
              <div key={event.id} className="border-l-2 pl-2" style={{ borderColor: statusColor(event.status) }}>
                <p className="font-mono text-[11px] text-[var(--muted)]">{event.timestamp}</p>
                <p className="font-mono text-[12px] leading-snug text-[var(--paper)]">{event.label}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function statusColor(status: LedgerEvent['status']) {
  if (status === 'met') return 'var(--sage)';
  if (status === 'unmet') return 'var(--clay)';
  return 'var(--brass)';
}

function RequirementsPanel({ project }: { project: ProjectDefinition }) {
  const r = project.requirements;
  const sections: Array<[string, string[]]> = [
    ['Functional requirements', r.functionalRequirements],
    ['Non-functional requirements', r.nonFunctionalRequirements],
    ['Assumptions', r.assumptions],
    ['Ambiguities — worth a question before you build', r.ambiguities],
    ['Constraints', r.constraints],
    ['Edge cases', r.edgeCases],
  ];
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">business goal</p>
        <p className="mt-1 font-sans text-[15px] leading-relaxed text-[var(--paper)]">{r.businessGoal}</p>
      </div>
      {sections.map(([title, items]) => (
        <div key={title}>
          <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">{title}</p>
          <ul className="mt-1 space-y-1">
            {items.map((item, i) => (
              <li key={i} className="font-sans text-[14px] leading-relaxed text-[var(--paper)]">
                <span className="text-[var(--muted)]">—</span> {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ArchitecturePanel() {
  return (
    <div className="max-w-2xl">
      <p className="font-sans text-[14px] leading-relaxed text-[var(--muted)]">
        Wire this tab to your architecture/decision workspace (Phase 8). It should let a student declare components
        and data flow, and capture the reasoning behind them through{' '}
        <code className="font-mono text-[13px] text-[var(--paper)]">project_decisions</code> in the schema — so "why
        Postgres, not a document store" gets evaluated as engineering judgment, not a guess.
      </p>
    </div>
  );
}

function CodePlaceholderPanel() {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center rounded-sm border border-dashed border-[var(--line)]">
      <p className="max-w-sm text-center font-mono text-[13px] leading-relaxed text-[var(--muted)]">
        Mount your existing code editor here (Phase 2, 12). This tab is deliberately not a second editor — multi-file
        editing and execution should stay the one environment CodeForge already has.
      </p>
    </div>
  );
}

function TestsPanel({ criteria, ledger }: { criteria: AcceptanceCriterion[]; ledger: LedgerEvent[] }) {
  const ledgerById = Object.fromEntries(ledger.map((e) => [e.id, e]));
  return (
    <div className="max-w-2xl space-y-2">
      {criteria.map((c) => {
        const event = ledgerById[c.id];
        const isHidden = c.testType === 'hidden';
        const badgeColor = isHidden ? 'var(--muted)' : statusColor(event?.status ?? 'unmet');
        return (
          <div key={c.id} className="flex items-start justify-between gap-4 border-b border-[var(--line)] py-2.5">
            <div>
              <p className="font-mono text-[13px] text-[var(--paper)]">{c.description}</p>
              <p className="mt-0.5 font-mono text-[11px] text-[var(--muted)]">{c.requirementRef}</p>
            </div>
            <span
              className="shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[11px]"
              style={{ borderColor: badgeColor, color: badgeColor }}
            >
              {isHidden ? 'hidden' : event?.status === 'met' ? 'met' : 'not yet'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function DocsPanel({ requirements }: { requirements: string[] }) {
  return (
    <div className="max-w-2xl space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted)]">what this project expects</p>
      <ul className="space-y-1">
        {requirements.map((req, i) => (
          <li key={i} className="font-sans text-[14px] leading-relaxed text-[var(--paper)]">
            <span className="text-[var(--muted)]">—</span> {req}
          </li>
        ))}
      </ul>
    </div>
  );
}

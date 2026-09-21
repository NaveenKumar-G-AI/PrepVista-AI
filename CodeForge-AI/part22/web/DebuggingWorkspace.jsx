import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Circle,
  FlaskConical,
  Lightbulb,
  Terminal,
  ChevronRight,
  ListChecks,
  Activity
} from "lucide-react";

/**
 * Reference implementation of the Debugging Mode workspace panel described
 * in the product spec's ASCII wireframe. This is a design/integration
 * reference, not the production surface - in the real CodeForge app, the
 * code editor pane below would be the actual CodeForge editor component,
 * and every panel would be wired to the API in src/api/app.ts instead of
 * the sample data below.
 *
 * Design plan (frontend-design skill):
 *  Subject: an evidence-driven diagnostic instrument, not a chat window or
 *  a generic IDE clone - the whole point of Debugging Mode is that the
 *  *process* is the artifact being assessed, so the UI treats hypotheses,
 *  experiments, and root-cause links as physical evidence on an
 *  instrument, not as chat bubbles.
 *  Color: ink-900 #12151C (housing) / ink-700 #1D212B (panel) / paper-100
 *  #E7E6DD (evidence-card surface, deliberately cool-toned, not the
 *  common warm cream) / signal-500 #E2A33B (unresolved / attention) /
 *  verified-500 #3FA793 (evidenced / passed) / muted-500 #7C6E93
 *  (rejected or inconclusive - neutral, not "bad": the spec is explicit
 *  that a rejected hypothesis is not a worse outcome).
 *  Type: monospace as the primary voice throughout labels and data (the
 *  "instrument readout" identity), a humanist sans only for prose the
 *  student writes/reads at length (hypothesis text, hint text).
 *  Signature: the Diagnostic Chain - a vertical rail of five connected
 *  evidence nodes (Symptom -> Location -> Cause -> Root Cause -> Fix)
 *  whose connecting lines only solidify once that link has supporting
 *  evidence attached, making the "no invented chains" rule visible rather
 *  than asserted.
 */

const TOKENS = `
  .cf-scope {
    --ink-900: #12151c;
    --ink-800: #171b24;
    --ink-700: #1d212b;
    --ink-600: #262b37;
    --rule: #313848;
    --paper-100: #e7e6de;
    --paper-200: #dad8ce;
    --text-hi: #f2f1ea;
    --text-lo: #8991a6;
    --ink-on-paper: #20232b;
    --ink-on-paper-soft: #5b5f6b;
    --signal-500: #e2a33b;
    --signal-200: #f4d9a8;
    --verified-500: #3fa793;
    --verified-200: #a9d9d0;
    --muted-500: #7c6e93;
    --muted-200: #c9c0da;
    --mono: ui-monospace, "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
    --sans: ui-sans-serif, "Inter", "Segoe UI", system-ui, sans-serif;
    font-family: var(--mono);
    background: var(--ink-900);
    color: var(--text-hi);
  }
  .cf-scope * { box-sizing: border-box; }
  .cf-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-lo);
  }
  .cf-card {
    background: var(--paper-100);
    color: var(--ink-on-paper);
    border-radius: 3px;
  }
  .cf-prose { font-family: var(--sans); }
  .cf-led {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  @keyframes cf-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  .cf-pulse { animation: cf-pulse 1.8s ease-in-out infinite; }
  .cf-tab {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .cf-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
  .cf-scrollbar::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 3px; }
`;

const SESSION = {
  challenge: "Window Sum — off-by-one",
  language: "python",
  state: "ROOT_CAUSE_IDENTIFIED",
  startedAgo: "14m ago"
};

const FINGERPRINT = {
  failureType: "WRONG_ANSWER",
  input: "5",
  expected: "10",
  actual: "6",
  location: "main.py:4 · calculateWindow",
  reproduced: true
};

const HYPOTHESES = [
  { id: "h1", text: "Loop excludes the last index in the range.", status: "SUPPORTED", confidence: 80 },
  { id: "h2", text: "Input is parsed as a string, not an int.", status: "REJECTED", confidence: 40 },
  { id: "h3", text: "Accumulator resets inside the loop body.", status: "INCONCLUSIVE", confidence: 20 }
];

const EXPERIMENTS = [
  {
    id: "e1",
    hypothesis: "h1",
    action: "Ran with n=1, inspected loop bound",
    expected: "total stays 0",
    actual: "total = 0, loop body never executed",
    conclusion: "SUPPORTED"
  },
  {
    id: "e2",
    hypothesis: "h2",
    action: "Printed type(n) before the loop",
    expected: "would show <class 'str'>",
    actual: "<class 'int'> — already correct",
    conclusion: "REJECTED"
  }
];

const CHAIN = [
  { key: "symptom", label: "Symptom", value: "Returns 6, expected 10 for n=5", evidence: 1 },
  { key: "location", label: "Location", value: "calculateWindow, main.py:4", evidence: 1 },
  { key: "cause", label: "Cause", value: "Loop body runs one fewer time than needed", evidence: 1 },
  { key: "rootCause", label: "Root cause", value: "range(n - 1) should be range(n)", evidence: 0 },
  { key: "fix", label: "Fix", value: "Not yet applied", evidence: 0 }
];

const SKILL_DIMENSIONS = [
  { label: "Failure recognition", score: 92 },
  { label: "Reproduction", score: 88 },
  { label: "Localization", score: 81 },
  { label: "Hypothesis formation", score: 74 },
  { label: "Evidence gathering", score: 69 },
  { label: "Experiment design", score: 71 },
  { label: "Root-cause analysis", score: 0, insufficientEvidence: true },
  { label: "Fix quality", score: 0, insufficientEvidence: true },
  { label: "Regression verification", score: 0, insufficientEvidence: true },
  { label: "Debugging efficiency", score: 66 }
];

const STATUS_STYLE = {
  PROPOSED: { color: "var(--text-lo)", icon: Circle, label: "Proposed" },
  TESTING: { color: "var(--signal-500)", icon: HelpCircle, label: "Testing" },
  SUPPORTED: { color: "var(--verified-500)", icon: CheckCircle2, label: "Supported" },
  REJECTED: { color: "var(--muted-500)", icon: XCircle, label: "Rejected" },
  INCONCLUSIVE: { color: "var(--muted-500)", icon: HelpCircle, label: "Inconclusive" }
};

function StatusTag({ status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.PROPOSED;
  const Icon = s.icon;
  return (
    <span
      className="cf-tab inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border"
      style={{ color: s.color, borderColor: s.color, background: "rgba(0,0,0,0.04)" }}
    >
      <Icon size={11} strokeWidth={2.5} />
      {s.label}
    </span>
  );
}

function ChainRail({ chain }) {
  return (
    <div>
      <div className="cf-eyebrow mb-3 flex items-center gap-2">
        <Activity size={12} />
        Diagnostic chain
      </div>
      <div className="relative pl-1">
        {chain.map((node, i) => {
          const has = node.evidence > 0;
          const isLast = i === chain.length - 1;
          return (
            <div key={node.key} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && (
                <div
                  className="absolute left-[5px] top-[16px] bottom-0 w-px"
                  style={{
                    background: has ? "var(--verified-500)" : "var(--rule)",
                    backgroundImage: has ? "none" : "repeating-linear-gradient(to bottom, var(--rule) 0 4px, transparent 4px 8px)"
                  }}
                />
              )}
              <span
                className={"cf-led mt-1.5 " + (has ? "" : "cf-pulse")}
                style={{ background: has ? "var(--verified-500)" : "var(--rule)", border: has ? "none" : "1px solid var(--text-lo)" }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="cf-eyebrow" style={{ color: has ? "var(--verified-200)" : "var(--text-lo)" }}>
                    {node.label}
                  </span>
                  {has ? (
                    <span className="cf-tab" style={{ color: "var(--verified-500)" }}>
                      {node.evidence} evidence
                    </span>
                  ) : (
                    <span className="cf-tab" style={{ color: "var(--signal-500)" }}>
                      needs evidence
                    </span>
                  )}
                </div>
                <p className="cf-prose text-[13px] leading-snug mt-1" style={{ color: has ? "var(--text-hi)" : "var(--text-lo)" }}>
                  {node.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SkillBar({ dim }) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="cf-tab" style={{ color: "var(--text-lo)" }}>
          {dim.label}
        </span>
        <span className="cf-tab" style={{ color: dim.insufficientEvidence ? "var(--muted-500)" : "var(--text-hi)" }}>
          {dim.insufficientEvidence ? "— no evidence yet" : dim.score}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ink-600)" }}>
        <div
          className="h-full rounded-full"
          style={{
            width: dim.insufficientEvidence ? "6%" : `${dim.score}%`,
            background: dim.insufficientEvidence
              ? "repeating-linear-gradient(45deg, var(--rule) 0 4px, transparent 4px 8px)"
              : "var(--verified-500)"
          }}
        />
      </div>
    </div>
  );
}

export default function DebuggingWorkspace() {
  const [tab, setTab] = useState("hypotheses");
  const [hintLevel, setHintLevel] = useState(0);
  const hintLadder = ["Observe", "Locate", "Question", "Conceptual hint", "Specific hint", "Root-cause guidance", "Solution"];

  return (
    <div className="cf-scope w-full rounded-md overflow-hidden" style={{ border: "1px solid var(--rule)" }}>
      <style>{TOKENS}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--rule)", background: "var(--ink-800)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="cf-eyebrow" style={{ color: "var(--text-lo)" }}>
            CodeForge · Debugging Mode
          </span>
          <span className="hidden sm:inline text-[13px] truncate" style={{ color: "var(--text-hi)" }}>
            {SESSION.challenge}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="cf-led" style={{ background: "var(--signal-500)" }} />
          <span className="cf-tab" style={{ color: "var(--signal-500)" }}>
            {SESSION.state.replaceAll("_", " ")}
          </span>
          <span className="cf-tab hidden sm:inline" style={{ color: "var(--text-lo)" }}>
            · {SESSION.startedAgo}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
        {/* Left: failure console + hypotheses/experiments tabs */}
        <div className="p-4 flex flex-col gap-4 min-w-0" style={{ borderRight: "1px solid var(--rule)" }}>
          {/* Failure console */}
          <div className="cf-card p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="cf-eyebrow flex items-center gap-2" style={{ color: "var(--ink-on-paper-soft)" }}>
                <Terminal size={12} />
                Failure console
              </div>
              <span
                className="cf-tab px-1.5 py-0.5 rounded-sm"
                style={{ color: "var(--ink-900)", background: FINGERPRINT.reproduced ? "var(--verified-200)" : "var(--signal-200)" }}
              >
                {FINGERPRINT.failureType} · {FINGERPRINT.reproduced ? "reproduced" : "not reproduced"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <div className="cf-eyebrow mb-0.5" style={{ color: "var(--ink-on-paper-soft)" }}>
                  Input
                </div>
                <div>{FINGERPRINT.input}</div>
              </div>
              <div>
                <div className="cf-eyebrow mb-0.5" style={{ color: "var(--ink-on-paper-soft)" }}>
                  Expected
                </div>
                <div style={{ color: "#1f7a68" }}>{FINGERPRINT.expected}</div>
              </div>
              <div>
                <div className="cf-eyebrow mb-0.5" style={{ color: "var(--ink-on-paper-soft)" }}>
                  Actual
                </div>
                <div style={{ color: "#a15b1f" }}>{FINGERPRINT.actual}</div>
              </div>
            </div>
            <div className="mt-2 pt-2 flex items-center gap-1.5 text-[12px]" style={{ borderTop: "1px solid var(--paper-200)", color: "var(--ink-on-paper-soft)" }}>
              <AlertTriangle size={12} />
              {FINGERPRINT.location}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1" style={{ borderBottom: "1px solid var(--rule)" }}>
            {[
              { id: "hypotheses", label: "Hypotheses", icon: FlaskConical, count: HYPOTHESES.length },
              { id: "experiments", label: "Experiments", icon: ListChecks, count: EXPERIMENTS.length }
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="cf-tab flex items-center gap-1.5 px-3 py-2 -mb-px"
                  style={{
                    color: active ? "var(--text-hi)" : "var(--text-lo)",
                    borderBottom: active ? "2px solid var(--signal-500)" : "2px solid transparent"
                  }}
                >
                  <Icon size={13} />
                  {t.label}
                  <span className="cf-eyebrow" style={{ color: "var(--text-lo)" }}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {tab === "hypotheses" && (
            <div className="flex flex-col gap-2">
              {HYPOTHESES.map((h) => (
                <div key={h.id} className="cf-card p-3 flex items-start justify-between gap-3">
                  <p className="cf-prose text-[13px] leading-snug">{h.text}</p>
                  <StatusTag status={h.status} />
                </div>
              ))}
              <button
                className="cf-tab text-left px-3 py-2 rounded-sm mt-1"
                style={{ color: "var(--text-lo)", border: "1px dashed var(--rule)" }}
              >
                + Propose a hypothesis
              </button>
            </div>
          )}

          {tab === "experiments" && (
            <div className="flex flex-col gap-2">
              {EXPERIMENTS.map((e) => (
                <div key={e.id} className="cf-card p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="cf-eyebrow" style={{ color: "var(--ink-on-paper-soft)" }}>
                      testing {HYPOTHESES.find((h) => h.id === e.hypothesis)?.id}
                    </span>
                    <StatusTag status={e.conclusion} />
                  </div>
                  <p className="cf-prose text-[13px] mb-1">{e.action}</p>
                  <div className="grid grid-cols-2 gap-2 text-[12px]" style={{ color: "var(--ink-on-paper-soft)" }}>
                    <div>
                      <span className="cf-eyebrow">Expected </span>
                      {e.expected}
                    </div>
                    <div>
                      <span className="cf-eyebrow">Observed </span>
                      {e.actual}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hint ladder */}
          <div className="cf-card p-3 mt-1">
            <div className="flex items-center justify-between mb-2">
              <div className="cf-eyebrow flex items-center gap-2" style={{ color: "var(--ink-on-paper-soft)" }}>
                <Lightbulb size={12} />
                Debugging coach
              </div>
              <button
                onClick={() => setHintLevel((l) => Math.min(l + 1, hintLadder.length - 1))}
                className="cf-tab px-2 py-1 rounded-sm flex items-center gap-1"
                style={{ background: "var(--ink-900)", color: "var(--text-hi)" }}
              >
                Ask for a hint
                <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1 mb-2">
              {hintLadder.map((rung, i) => (
                <span
                  key={rung}
                  className="h-1 flex-1 rounded-full"
                  style={{ background: i <= hintLevel ? "var(--signal-500)" : "var(--paper-200)" }}
                  title={rung}
                />
              ))}
            </div>
            <p className="cf-prose text-[13px]" style={{ color: "var(--ink-on-paper-soft)" }}>
              <span className="cf-eyebrow" style={{ color: "var(--ink-on-paper-soft)" }}>
                {hintLadder[hintLevel]} ·{" "}
              </span>
              {hintLevel === 0 && "Look closely at the actual output versus what you expected. What's different, exactly?"}
              {hintLevel === 1 && "The failure surfaces at main.py:4. Is that where the problem starts, or just where it becomes visible?"}
              {hintLevel >= 2 && "What assumption does the loop make about its own boundary, and is that assumption still true on the last iteration?"}
            </p>
          </div>
        </div>

        {/* Right rail */}
        <div className="p-4 flex flex-col gap-6 cf-scrollbar" style={{ background: "var(--ink-800)" }}>
          <ChainRail chain={CHAIN} />
          <div>
            <div className="cf-eyebrow mb-3">Debugging skill profile</div>
            {SKILL_DIMENSIONS.map((d) => (
              <SkillBar key={d.label} dim={d} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

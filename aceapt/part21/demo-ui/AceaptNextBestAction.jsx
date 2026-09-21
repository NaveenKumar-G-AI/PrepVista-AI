import { useState, useEffect } from "react";
import { ChevronDown, ArrowRight, CircleCheck } from "lucide-react";

// ============================================================
// Content below mirrors actual output from the Feature 21 engine
// (src/demo.ts) for the same three students — nothing here is
// invented for the mockup that the engine doesn't actually produce.
// ============================================================

const STUDENTS = {
  priya: {
    name: "Priya",
    goalLabel: "Placement readiness",
    daysToAssessment: 10,
    state: "Practicing",
    fatigued: true,
    fatigueNote: "Today's session shows some rushed guessing, so we're keeping this short.",
    rootCause: {
      root: "Percentage",
      downstream: ["Probability", "Discount"],
      note: "Your biggest current blocker may not be the topic you most recently got wrong.",
    },
    primary: {
      label: "Repair Prerequisite",
      target: "Percentage",
      duration: 15,
      confidence: "HIGH",
      evidence: [
        "3 of 3 wrong attempts on Percentage share the same pattern: using the new value as the denominator instead of the original.",
        "The same pattern shows up in Discount, and Probability inherits it too — Percentage sits underneath both.",
      ],
      verify: "Re-check after prerequisite mastery on Percentage crosses 70%.",
    },
    recoveryPath: ["Repair Prerequisite → Percentage", "Verify → Probability"],
    diagnoses: [
      { skill: "Percentage", category: "Concept misunderstanding", confidence: "HIGH", evidence: ["3 of 3 wrong attempts share the denominator-selection pattern."] },
      { skill: "Probability", category: "Prerequisite gap", confidence: "HIGH", evidence: ["Percentage mastery is 45%, Ratio is 50% — both below the 60% threshold this skill depends on."] },
      { skill: "Ratio & Proportion", category: "Inconsistent performance", confidence: "LOW", evidence: ["Correctness alternates across recent attempts without matching a known pattern yet — worth watching, not acting on hard."] },
      { skill: "Discount", category: "Prerequisite gap", confidence: "MEDIUM", evidence: ["Percentage mastery is 45%, below the 60% threshold Discount depends on."] },
      { skill: "Number Series", category: "Not enough evidence yet", confidence: "UNKNOWN", evidence: ["Only 2 evidence items so far — not enough to diagnose responsibly."] },
      { skill: "Profit & Loss", category: "Stable", confidence: null, evidence: [] },
    ],
    verifiedHistory: [{ skill: "Profit & Loss", before: 42, after: 78, action: "Contrastive practice", outcome: "improved" }],
  },
  arjun: {
    name: "Arjun",
    goalLabel: "Maintain mastery",
    daysToAssessment: null,
    state: "Weakening",
    fatigued: false,
    rootCause: null,
    primary: {
      label: "Quick Recall Check",
      target: "Probability",
      duration: 3,
      confidence: "HIGH",
      evidence: [
        "Mastered 14 days ago — independent recall is now weak (45%, predicted 78%).",
        "Got it right once a hint was given, so the knowledge is there — access to it is the blocker, not the knowledge itself.",
      ],
      verify: "Unassisted delayed recall in 2–3 days.",
    },
    recoveryPath: null,
    diagnoses: [
      { skill: "Probability", category: "Retrieval weakness", confidence: "HIGH", evidence: ["Mastered 14 days ago; recall dropped to 45% against a predicted 78%.", "Reasoning was correct once hinted."] },
      { skill: "Ratio & Proportion", category: "Stable", confidence: null, evidence: [] },
    ],
    verifiedHistory: [],
  },
  meera: {
    name: "Meera",
    goalLabel: "Speed improvement",
    daysToAssessment: 30,
    state: "Practicing",
    fatigued: false,
    rootCause: null,
    primary: {
      label: "Timed Micro-Drill",
      target: "Time & Work",
      duration: 15,
      confidence: "HIGH",
      evidence: [
        "Untimed accuracy 95% vs. timed accuracy 61% — a 34-point drop.",
        "Reasoning and retention both check out fine outside the timed condition — this looks like execution under pressure, not a knowledge gap.",
      ],
      verify: "Compare timed vs. untimed accuracy again after a timed-practice cycle.",
    },
    recoveryPath: null,
    diagnoses: [
      { skill: "Time & Work", category: "Pressure performance degradation", confidence: "HIGH", evidence: ["95% untimed vs. 61% timed.", "Reasoning traces and retention both check out fine untimed."] },
      { skill: "Profit & Loss", category: "Procedural error", confidence: "HIGH", evidence: ["3 wrong attempts show the right idea applied in the wrong order.", "Escalated to deep remediation — recall, review, and guided practice were all tried already."] },
      { skill: "Percentage", category: "Stable", confidence: null, evidence: [] },
    ],
    verifiedHistory: [],
    escalation: {
      skill: "Profit & Loss",
      tried: ["Quick recall check", "Light review", "Guided practice"],
      note: "None led to lasting improvement, so we're stepping up to deep remediation rather than trying a fourth light-touch fix.",
    },
  },
};

const CONF_STYLE = {
  HIGH: { dot: "var(--teal)", bg: "var(--teal-soft)", fg: "var(--teal)", label: "High confidence" },
  MEDIUM: { dot: "var(--ochre)", bg: "var(--ochre-soft)", fg: "var(--ochre-dark)", label: "Medium confidence" },
  LOW: { dot: "var(--slate)", bg: "var(--slate-soft)", fg: "var(--slate-dark)", label: "Low confidence" },
  UNKNOWN: { dot: "transparent", bg: "var(--slate-soft)", fg: "var(--slate-dark)", label: "Not enough evidence" },
};

function ConfidencePill({ level }) {
  if (!level) {
    return (
      <span className="pill pill-stable">
        <CircleCheck size={12} strokeWidth={2.4} />
        Stable
      </span>
    );
  }
  const s = CONF_STYLE[level];
  return (
    <span className="pill" style={{ background: s.bg, color: s.fg }}>
      <span className="pill-dot" style={{ background: s.dot, borderColor: s.fg, borderStyle: level === "UNKNOWN" ? "dashed" : "solid" }} />
      {s.label}
    </span>
  );
}

function DiagnosisRow({ item, isOpen, onToggle }) {
  const stable = !item.confidence;
  return (
    <div className={"diag-row" + (stable ? " diag-row-stable" : "")}>
      <button className="diag-row-head" onClick={() => item.evidence.length > 0 && onToggle()}>
        <span className="diag-skill">{item.skill}</span>
        <span className="diag-category">{item.category}</span>
        <ConfidencePill level={item.confidence} />
        {item.evidence.length > 0 && (
          <ChevronDown size={16} className={"diag-chevron" + (isOpen ? " diag-chevron-open" : "")} strokeWidth={2} />
        )}
      </button>
      {isOpen && item.evidence.length > 0 && (
        <ul className="diag-evidence">
          {item.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RootCauseTrace({ rootCause }) {
  return (
    <div className="trace">
      <p className="trace-note">{rootCause.note}</p>
      <div className="trace-diagram">
        <div className="trace-root">
          <span className="trace-node trace-node-root">{rootCause.root}</span>
        </div>
        <div className="trace-branch-line" />
        <div className="trace-leaves">
          {rootCause.downstream.map((skill) => (
            <div className="trace-leaf" key={skill}>
              <div className="trace-leaf-connector" />
              <span className="trace-node trace-node-leaf">{skill}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="trace-caption">
        Repairing <strong>{rootCause.root}</strong> is likely to help {rootCause.downstream.join(" and ")} at once.
      </p>
    </div>
  );
}

export default function AceaptNextBestAction() {
  const [studentId, setStudentId] = useState("priya");
  const [whyOpen, setWhyOpen] = useState(true);
  const [openSkill, setOpenSkill] = useState(null);

  useEffect(() => {
    setWhyOpen(true);
    setOpenSkill(null);
  }, [studentId]);

  const s = STUDENTS[studentId];
  const conf = CONF_STYLE[s.primary.confidence];

  return (
    <div className="aceapt-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .aceapt-root {
          --bg: #EEF1EC;
          --surface: #FCFDFB;
          --surface-2: #F4F6F2;
          --line: #DBE2D8;
          --ink: #16231D;
          --ink-soft: #4E5A52;
          --ink-faint: #8B958D;
          --teal: #1B5E56;
          --teal-soft: #E1EFEC;
          --ochre: #C2703A;
          --ochre-dark: #93502A;
          --ochre-soft: #F6E7DA;
          --slate: #9AA096;
          --slate-dark: #5E6660;
          --slate-soft: #ECEFEA;

          font-family: 'Space Grotesk', sans-serif;
          background: var(--bg);
          color: var(--ink);
          max-width: 440px;
          margin: 0 auto;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid var(--line);
          box-shadow: 0 1px 2px rgba(22,35,29,0.04);
        }
        .aceapt-root * { box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .serif { font-family: 'Source Serif 4', serif; }

        .fade-up {
          opacity: 0;
          transform: translateY(8px);
          animation: aceaptFadeUp 0.5s ease forwards;
        }
        @keyframes aceaptFadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fade-up { animation: none; opacity: 1; transform: none; }
        }

        /* ---- top bar ---- */
        .topbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 18px 12px;
        }
        .wordmark {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px; letter-spacing: 0.16em; font-weight: 600;
          color: var(--ink-faint); text-transform: uppercase;
        }
        .tabs { display: flex; gap: 4px; background: var(--surface-2); padding: 3px; border-radius: 999px; }
        .tab {
          font-family: 'Space Grotesk', sans-serif; font-size: 12.5px; font-weight: 500;
          padding: 5px 12px; border-radius: 999px; border: none; cursor: pointer;
          background: transparent; color: var(--ink-soft); transition: all 0.15s ease;
        }
        .tab-active { background: var(--ink); color: var(--surface); }

        .context-line {
          padding: 0 18px 14px;
          font-size: 12.5px; color: var(--ink-faint);
          display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
        }
        .context-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--ink-faint); }
        .state-chip {
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.04em;
          padding: 2px 7px; border-radius: 5px; background: var(--surface-2); color: var(--ink-soft);
        }

        /* ---- hero ---- */
        .hero { background: var(--surface); margin: 0 10px; border-radius: 16px; padding: 20px 20px 18px; border: 1px solid var(--line); }
        .eyebrow {
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em;
          color: var(--teal); text-transform: uppercase; font-weight: 600; margin: 0 0 10px;
        }
        .hero-title {
          font-family: 'Source Serif 4', serif; font-size: 26px; line-height: 1.15;
          margin: 0 0 6px; color: var(--ink); font-weight: 500;
        }
        .hero-meta {
          display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
          font-size: 13.5px; color: var(--ink-soft);
        }
        .hero-target { font-weight: 600; color: var(--ink); }
        .hero-duration { font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: var(--ink-faint); }

        .btn-row { display: flex; gap: 8px; margin-bottom: 14px; }
        .btn {
          font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 13.5px;
          padding: 10px 18px; border-radius: 10px; border: none; cursor: pointer; transition: transform 0.12s ease, opacity 0.12s ease;
        }
        .btn:active { transform: scale(0.97); }
        .btn-primary { background: var(--ochre); color: #fff; }
        .btn-primary:hover { opacity: 0.92; }
        .btn-ghost { background: transparent; color: var(--ink-soft); border: 1px solid var(--line); }
        .btn-ghost:hover { background: var(--surface-2); }

        .fatigue-note {
          font-size: 12px; color: var(--ochre-dark); background: var(--ochre-soft);
          padding: 8px 10px; border-radius: 8px; margin-bottom: 14px; line-height: 1.4;
        }

        .why-toggle {
          display: flex; align-items: center; gap: 6px; background: none; border: none; cursor: pointer;
          font-family: 'Space Grotesk', sans-serif; font-size: 12.5px; font-weight: 500; color: var(--ink-soft);
          padding: 0; width: 100%;
        }
        .why-body {
          font-family: 'Source Serif 4', serif; font-size: 14.5px; line-height: 1.6; color: var(--ink);
          margin-top: 10px; padding-top: 12px; border-top: 1px solid var(--line);
        }
        .why-body ul { margin: 0 0 10px; padding-left: 18px; }
        .why-body li { margin-bottom: 6px; }
        .why-verify { font-size: 12.5px; color: var(--ink-faint); font-family: 'Space Grotesk', sans-serif; }
        .why-verify strong { color: var(--ink-soft); font-weight: 600; }

        /* ---- section shell ---- */
        .section { padding: 18px 20px 4px; }
        .section-label {
          font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em;
          text-transform: uppercase; color: var(--ink-faint); font-weight: 600; margin: 0 0 12px;
        }

        /* ---- root cause trace ---- */
        .trace-note { font-family: 'Source Serif 4', serif; font-size: 14px; color: var(--ink-soft); margin: 0 0 16px; line-height: 1.5; }
        .trace-diagram { display: flex; flex-direction: column; align-items: center; padding: 6px 0 4px; }
        .trace-node {
          font-family: 'JetBrains Mono', monospace; font-size: 12.5px; font-weight: 600;
          padding: 7px 14px; border-radius: 8px; white-space: nowrap;
        }
        .trace-node-root { background: var(--teal); color: #fff; }
        .trace-node-leaf { background: var(--surface-2); color: var(--ink-soft); border: 1px solid var(--line); }
        .trace-branch-line { width: 1px; height: 14px; background: var(--line); }
        .trace-leaves { display: flex; gap: 28px; position: relative; padding-top: 14px; }
        .trace-leaves::before {
          content: ''; position: absolute; top: 0; left: 50%; right: 50%; height: 1px; background: var(--line);
        }
        .trace-leaf { display: flex; flex-direction: column; align-items: center; position: relative; }
        .trace-leaf-connector { width: 1px; height: 14px; background: var(--line); }
        .trace-caption { font-size: 12.5px; color: var(--ink-faint); text-align: center; margin: 14px 0 2px; }
        .trace-caption strong { color: var(--teal); font-weight: 600; }

        /* ---- diagnosis rows ---- */
        .diag-row { border-top: 1px solid var(--line); }
        .diag-row:last-child { border-bottom: 1px solid var(--line); }
        .diag-row-head {
          width: 100%; background: none; border: none; cursor: pointer; text-align: left;
          display: flex; align-items: center; gap: 10px; padding: 11px 0;
        }
        .diag-row-stable .diag-row-head { cursor: default; }
        .diag-skill { font-size: 13.5px; font-weight: 600; color: var(--ink); flex: 0 0 auto; min-width: 108px; }
        .diag-category { font-size: 12.5px; color: var(--ink-faint); flex: 1; }
        .diag-chevron { color: var(--ink-faint); transition: transform 0.18s ease; flex: 0 0 auto; }
        .diag-chevron-open { transform: rotate(180deg); }
        .diag-evidence {
          font-family: 'Source Serif 4', serif; font-size: 13px; color: var(--ink-soft); line-height: 1.55;
          margin: 0 0 12px; padding-left: 16px;
        }
        .diag-evidence li { margin-bottom: 5px; }

        .pill {
          display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 999px; white-space: nowrap; flex: 0 0 auto;
        }
        .pill-dot { width: 6px; height: 6px; border-radius: 50%; border-width: 1.4px; }
        .pill-stable { background: var(--teal-soft); color: var(--teal); }

        /* ---- recovery path ---- */
        .recovery-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
        .recovery-step {
          display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-soft);
          background: var(--surface-2); padding: 8px 12px; border-radius: 9px;
        }
        .recovery-index {
          font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; color: var(--teal);
          background: var(--teal-soft); width: 18px; height: 18px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; flex: 0 0 auto;
        }

        /* ---- history / escalation ---- */
        .history-card {
          background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
          padding: 14px 16px; margin-bottom: 16px;
        }
        .history-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .history-skill { font-size: 13px; font-weight: 600; }
        .history-outcome { font-size: 11px; font-weight: 700; color: var(--teal); text-transform: uppercase; letter-spacing: 0.05em; }
        .history-bar-row { display: flex; align-items: center; gap: 10px; }
        .history-figure { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 600; }
        .history-figure-before { color: var(--ink-faint); }
        .history-figure-after { color: var(--teal); }
        .history-caption { font-size: 11.5px; color: var(--ink-faint); margin-top: 6px; }

        .escalation-card {
          background: var(--ochre-soft); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px;
        }
        .escalation-tried { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 10px; }
        .escalation-chip {
          font-size: 11px; padding: 3px 9px; border-radius: 999px; background: #fff;
          color: var(--ink-faint); text-decoration: line-through; text-decoration-color: var(--ochre); text-decoration-thickness: 1.5px;
        }
        .escalation-note { font-family: 'Source Serif 4', serif; font-size: 13px; color: var(--ochre-dark); line-height: 1.5; margin: 0; }

        .footer {
          padding: 16px 20px 20px; font-size: 11.5px; color: var(--ink-faint); line-height: 1.5;
          border-top: 1px solid var(--line); margin-top: 8px;
        }
      `}</style>

      <div className="topbar fade-up" style={{ animationDelay: "0ms" }}>
        <span className="wordmark">ACEAPT · Feature 21</span>
        <div className="tabs">
          {Object.keys(STUDENTS).map((id) => (
            <button key={id} className={"tab" + (id === studentId ? " tab-active" : "")} onClick={() => setStudentId(id)}>
              {STUDENTS[id].name}
            </button>
          ))}
        </div>
      </div>

      <div className="context-line fade-up" style={{ animationDelay: "40ms" }}>
        <span>{s.goalLabel}</span>
        {s.daysToAssessment !== null && (
          <>
            <span className="context-dot" />
            <span>{s.daysToAssessment} days to assessment</span>
          </>
        )}
        <span className="context-dot" />
        <span className="state-chip">{s.state.toUpperCase()}</span>
      </div>

      <div className="hero fade-up" key={studentId + "-hero"} style={{ animationDelay: "80ms" }}>
        <p className="eyebrow">Today's best action</p>
        <h2 className="hero-title">{s.primary.label}</h2>
        <div className="hero-meta">
          <span className="hero-target">{s.primary.target}</span>
          <span className="hero-duration mono">~{s.primary.duration} min</span>
          <ConfidencePill level={s.primary.confidence} />
        </div>

        <div className="btn-row">
          <button className="btn btn-primary">Start</button>
          <button className="btn btn-ghost">Later</button>
        </div>

        {s.fatigued && <p className="fatigue-note">{s.fatigueNote}</p>}

        <button className="why-toggle" onClick={() => setWhyOpen(!whyOpen)}>
          <ChevronDown size={14} className={whyOpen ? "diag-chevron-open" : ""} style={{ transition: "transform 0.18s ease" }} />
          Why this, not something else?
        </button>
        {whyOpen && (
          <div className="why-body">
            <ul>
              {s.primary.evidence.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
            <p className="why-verify">
              <strong>We'll verify with:</strong> {s.primary.verify}
            </p>
          </div>
        )}
      </div>

      {s.rootCause && (
        <div className="section fade-up" key={studentId + "-root"} style={{ animationDelay: "120ms" }}>
          <p className="section-label">Root-cause insight</p>
          <RootCauseTrace rootCause={s.rootCause} />
        </div>
      )}

      {s.recoveryPath && (
        <div className="section fade-up" style={{ animationDelay: "150ms" }}>
          <p className="section-label">Recovery path</p>
          <div className="recovery-list">
            {s.recoveryPath.map((step, i) => (
              <div className="recovery-step" key={i}>
                <span className="recovery-index">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="section fade-up" key={studentId + "-diag"} style={{ animationDelay: "180ms" }}>
        <p className="section-label">Diagnosis map</p>
        {s.diagnoses.map((item) => (
          <DiagnosisRow
            key={item.skill}
            item={item}
            isOpen={openSkill === item.skill}
            onToggle={() => setOpenSkill(openSkill === item.skill ? null : item.skill)}
          />
        ))}
      </div>

      {s.verifiedHistory.length > 0 && (
        <div className="section fade-up" style={{ animationDelay: "210ms" }}>
          <p className="section-label">Recent win</p>
          {s.verifiedHistory.map((h, i) => (
            <div className="history-card" key={i}>
              <div className="history-head">
                <span className="history-skill">{h.skill}</span>
                <span className="history-outcome">{h.outcome}</span>
              </div>
              <div className="history-bar-row">
                <span className="history-figure history-figure-before mono">{h.before}%</span>
                <ArrowRight size={14} color="var(--ink-faint)" />
                <span className="history-figure history-figure-after mono">{h.after}%</span>
              </div>
              <p className="history-caption">After {h.action.toLowerCase()} — performance improved after the intervention.</p>
            </div>
          ))}
        </div>
      )}

      {s.escalation && (
        <div className="section fade-up" style={{ animationDelay: "210ms" }}>
          <p className="section-label">Escalation</p>
          <div className="escalation-card">
            <span className="history-skill">{s.escalation.skill}</span>
            <div className="escalation-tried">
              {s.escalation.tried.map((t, i) => (
                <span className="escalation-chip" key={i}>
                  {t}
                </span>
              ))}
            </div>
            <p className="escalation-note">{s.escalation.note}</p>
          </div>
        </div>
      )}

      <p className="footer fade-up" style={{ animationDelay: "240ms" }}>
        Every recommendation here cites the evidence behind it and states its confidence — nothing is presented as certain unless the evidence earns it.
      </p>
    </div>
  );
}

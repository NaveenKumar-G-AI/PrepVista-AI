import React, { useState, useRef } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Lightbulb,
  RotateCcw,
  Target,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Loader2,
  HelpCircle,
  Clock,
  Zap,
  Layers,
  Send,
  BarChart3,
  Award,
} from "lucide-react";

/* ============================================================================
   ACEAPT · FEATURE 18 — INTELLIGENT SOLUTION REASONING & MULTI-PATH COACH
   ----------------------------------------------------------------------------
   WHAT THIS FILE IS

   This is a standalone, self-contained vertical-slice prototype of the
   Feature 18 loop described in the build spec:

     attempt -> reasoning evidence -> error classification -> targeted
     explanation -> guided repair -> reattempt -> transfer verification ->
     evidence back to the wider ACEAPT intelligence graph.

   No existing ACEAPT codebase, repo, or Feature 10-17 services were present
   in this session, so this was NOT built by editing/integrating real files —
   there weren't any to inspect. Instead this runs entirely on its own, with:

     - deterministic logic owning: the math, answer validation, error
       classification, step-by-step evidence, and all state transitions
     - a live call to Claude (via the built-in artifact API bridge, no key
       needed) owning: free-form "why" answers grounded in this one problem
     - everywhere Feature 10/11/12/13/14/15/16/17 would normally sit, a
       clearly labelled SIMULATED evidence panel stands in — see the
       "INTEGRATION POINT" comments below for exactly what a real wire-up
       would replace.

   Search this file for "INTEGRATION POINT" to find every seam.
   ========================================================================= */

/* ----------------------------------------------------------------------------
   CONFIG — intentionally left blank. Fill these in when this plugs into the
   real ACEAPT backend. Nothing in this prototype requires them to run.
   -------------------------------------------------------------------------- */
const CONFIG = {
  STUDENT_ID: null, // TODO: inject the authenticated student id
  BACKEND_BASE_URL: "", // TODO: ACEAPT API base URL
  QUESTION_SERVICE_ENDPOINT: "", // TODO: Feature 17 — fetch attempt question + transfer question
  EVENT_ENDPOINT: "", // TODO: existing event pipeline (section 49 event list)
  AUTH_TOKEN: null, // TODO: session/auth token for the above calls
};

/* ----------------------------------------------------------------------------
   DATA — the flagship scenario content.
   In production this text (question, distractor diagnoses, transfer
   question) is authored by Feature 17 / assessment science, not hardcoded.
   -------------------------------------------------------------------------- */

const QUESTION = {
  text: "A shopkeeper increases the price of an item from ₹800 to ₹960. By what percentage did the price increase?",
  skill: "Percentages · Application",
};

const OPTIONS = [
  { id: "opt1", label: "16.67%" },
  { id: "opt2", label: "18%" },
  { id: "opt3", label: "20%" },
  { id: "opt4", label: "30%" },
];

const OPTION_TO_BRANCH = {
  opt1: "wrongBase",
  opt2: "slip",
  opt3: "correct",
  opt4: "conceptual",
};

const STEP_LABELS = [
  "Identify the original (reference) value",
  "Calculate the change between old and new",
  "Choose the correct base for the percentage",
  "Compute the final percentage",
];

const BRANCHES = {
  correct: {
    key: "correct",
    isCorrect: true,
    headline: "Clean solve.",
    sub: "Right answer, right reference value, right execution.",
    errorType: null,
    errorIconKey: null,
    steps: ["correct", "correct", "correct", "correct"],
    reps: {
      formula: "(₹960 − ₹800) ÷ ₹800 × 100 = 20%. Original price on the bottom, every time.",
      plain: "You measured the jump against where you started. That's the reference point for every \u201cpercent increase\u201d question.",
      example: "Same idea at any scale: ₹10 → ₹12 is also a 20% increase, because 2 ÷ 10 = 0.2.",
    },
  },
  wrongBase: {
    key: "wrongBase",
    isCorrect: false,
    headline: "We found the break.",
    sub: "Your calculation was consistent with your method. The issue was which value you measured against.",
    errorType: "Strategy selection \u00b7 wrong reference value",
    errorIconKey: "target",
    steps: ["correct", "correct", "first_error", "consequent"],
    reps: {
      formula: "You used ₹960 (the new price) as the denominator. For \u201cpercent increase,\u201d the denominator is always the value you started with — ₹800.",
      plain: "Percentage change measures a jump against where you started, not where you landed. You measured it against the landing point instead.",
      example: "Quick check: a ₹10 item that becomes ₹20 is a 100% increase (10 ÷ 10), not 50% (10 ÷ 20). The starting price is always the reference.",
    },
  },
  slip: {
    key: "slip",
    isCorrect: false,
    headline: "Almost — a small slip, not a strategy problem.",
    sub: "Your approach and your reference value were both right.",
    errorType: "Execution \u00b7 arithmetic slip",
    errorIconKey: "zap",
    steps: ["correct", "first_error", "correct", "consequent"],
    reps: {
      formula: "₹960 − ₹800 is ₹160, not ₹144. Everything else in your method — including using ₹800 as the base — was right.",
      plain: "This isn't a concept problem. The plan was correct; one subtraction just came out wrong.",
      example: "Try the subtraction on its own, away from the percentage: 960 − 800. Then bring that number back into the method you already had.",
    },
  },
  conceptual: {
    key: "conceptual",
    isCorrect: false,
    headline: "Let's rebuild this from the relationship.",
    sub: "The two prices weren't connected the way this question needs.",
    errorType: "Conceptual \u00b7 relationship not established",
    errorIconKey: "layers",
    steps: ["correct", "first_error", "consequent", "consequent"],
    reps: {
      formula: "Percent increase has exactly one relationship: (new \u2212 old) \u00f7 old \u00d7 100. There's no separate rule to recall for this kind of question.",
      plain: "The two prices weren't run through that relationship yet — the answer came from somewhere else. Worth rebuilding the connection from scratch.",
      example: "₹800 → ₹960 is a jump of ₹160. ₹160 is what fraction of the ₹800 you started with? That fraction, as a percentage, is the answer.",
    },
  },
};

const REP_ORDER = ["formula", "plain", "example"];
const REP_LABEL = { formula: "Formula view", plain: "Plain language", example: "Worked example" };

const SOLVE_STEPS = [
  {
    prompt: "What should we identify first?",
    type: "choice",
    options: [
      { id: "a", text: "The final price (₹960)" },
      { id: "b", text: "The original price (₹800)", correct: true },
      { id: "c", text: "The percentage sign" },
    ],
    correctFeedback: "Right. The original price is always our reference point \u2014 the \u201cbefore\u201d value.",
    incorrectFeedback: "Not quite \u2014 we need the value we're measuring FROM, not the result.",
  },
  {
    prompt: "What do we calculate next?",
    type: "choice",
    options: [
      { id: "a", text: "New \u2212 Old", correct: true },
      { id: "b", text: "Old \u2212 New" },
      { id: "c", text: "New \u00d7 Old" },
    ],
    correctFeedback: "₹960 \u2212 ₹800 = ₹160. That's the size of the change.",
    incorrectFeedback: "That's not quite the relationship we need \u2014 think about the size of the jump.",
  },
  {
    prompt: "Which value is the base \u2014 the bottom of the fraction?",
    type: "choice",
    options: [
      { id: "a", text: "₹960, the new price" },
      { id: "b", text: "₹800, the original price", correct: true },
    ],
    correctFeedback: "Exactly. We always measure the change against where we started.",
    incorrectFeedback: "This is the exact spot the earlier attempt broke \u2014 try the original price instead.",
  },
  {
    prompt: "Now compute it: 160 \u00f7 800 \u00d7 100 = ?",
    type: "numeric",
    accept: (val) => val.replace(/\s/g, "").replace(/%$/, "") === "20",
    correctFeedback: "20%. You just rebuilt the full solution \u2014 on your own.",
    incorrectFeedback: "Close \u2014 double check the division, then try again.",
  },
];

const ALT_METHODS = [
  {
    name: "Your method \u2014 direct formula",
    steps: ["Find the change: 960 \u2212 800 = 160", "Divide by the original: 160 \u00f7 800 = 0.2", "Convert to percent: 20%"],
    time: "~25 sec",
    bestFor: "Full written working, shown step by step",
  },
  {
    name: "Multiplier shortcut",
    steps: ["Divide new by old: 960 \u00f7 800 = 1.2", "Read the multiplier as a percentage: 1.2 \u2192 +20%"],
    time: "~10 sec",
    bestFor: "Fast mental math when the clock is tight",
  },
];

const TRANSFER_QUESTION = {
  text: "A number is first increased by 25%, then the new number is decreased by 20%. What is the overall percentage change?",
  skill: "Percentages \u00b7 Successive change (transfer)",
  options: [
    { id: "a", text: "0% \u2014 no overall change", correct: true },
    { id: "b", text: "+5%" },
    { id: "c", text: "+45%" },
    { id: "d", text: "\u221245%" },
  ],
  correctMsg:
    "Exactly. The 25% increase and the 20% decrease each measured against a different base \u2014 the decrease applied to the already-increased number, not the original. Same idea you just rebuilt, in a new shape.",
  incorrectMsg:
    "That would only be true if both percentages measured against the same base. Here, the 20% decrease applies to the number after the 25% increase \u2014 not the original.",
  reveal: "100 \u2192 +25% \u2192 125 \u2192 \u221220% of 125 (not of 100) \u2192 125 \u2212 25 = 100. Net change: 0%.",
};

const MASTERY_DATA = {
  masteryBefore: 58,
  masteryAfter: 76,
  transferBefore: "Weak",
  transferAfter: "Verified",
  nextUnlock: "Successive percentage change \u00b7 application level",
  evidenceTargets: [
    "Feature 14 \u00b7 Mastery & Transfer",
    "Feature 15 \u00b7 Journey Orchestration",
    "Feature 10 \u00b7 Trajectory",
    "Feature 16 \u00b7 Intervention & Recovery",
  ],
};

const JOURNEY_STAGES = ["Question", "Diagnosis", "Coaching", "Transfer", "Evidence"];

function stageToJourneyIndex(stage) {
  if (stage === "question") return 0;
  if (stage === "result") return 1;
  if (stage === "why" || stage === "solve" || stage === "alt") return 2;
  if (stage === "transfer" || stage === "transferResult") return 3;
  if (stage === "mastery") return 4;
  return 0;
}

/* ----------------------------------------------------------------------------
   HELPERS
   -------------------------------------------------------------------------- */

const cx = (...parts) => parts.filter(Boolean).join(" ");

function formatSeconds(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function getCalibrationNote(branch, confidence, seconds) {
  if (!confidence) return null;
  if (!branch.isCorrect && confidence === "high") {
    return { tone: "flag", text: `Answered confidently in ${formatSeconds(seconds)} \u2014 worth a closer look, since the reference value was flipped.` };
  }
  if (branch.isCorrect && confidence === "low") {
    return { tone: "check", text: `Correct, but confidence was low (${formatSeconds(seconds)}) \u2014 a quick verification will confirm this is solid, not a guess.` };
  }
  return null;
}

/* INTEGRATION POINT — REASONING ANALYSIS / EXPLANATION GENERATION (spec \u00a750)
   In this prototype, error classification is 100% deterministic (each
   distractor is pre-tagged with the misconception it represents \u2014 real
   assessment-science practice). The one place this prototype calls a live
   LLM is the free-form "why" question below, and it is deliberately scoped:
   grounded only in this problem's own numbers, with a hard fallback if the
   call fails, matching \u00a753 (Failure Handling) and \u00a763 (No False
   Intelligence). A production build would run the equivalent call
   server-side, with the deterministic evidence (branch, steps, confidence,
   timing) as real structured input instead of the constants below. */
async function askClaudeWhy(question, ctx) {
  const prompt = `You are a focused aptitude-exam reasoning coach helping a student understand ONE specific problem. Only discuss this problem. Do not restate the full solution unless the question needs it \u2014 answer the specific "why" being asked, in 2-4 short sentences, plain language, no headers, no markdown lists.

Problem: ${ctx.questionText}
Correct solution: ${ctx.correctExplanation}
Student's selected answer: "${ctx.selectedAnswerText}" (${ctx.wasCorrect ? "correct" : "incorrect"})
${ctx.errorType ? `Diagnosed issue: ${ctx.errorType}` : ""}

Student's question: "${question}"

Answer the student's question directly, tied to this exact problem and its numbers.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) throw new Error("Reasoning engine request failed");
  const data = await response.json();
  const text = (data.content || [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();
  if (!text) throw new Error("Reasoning engine returned no text");
  return text;
}

/* INTEGRATION POINT — EVENT ARCHITECTURE (spec \u00a749)
   Every meaningful moment below (submit, hint/action taken, guided-step
   completed, transfer verified) is a natural call site for the real event
   pipeline. This prototype just logs to the console so the event seams are
   visible without inventing a fake network layer. */
function emitEvent(name, payload) {
  // TODO: POST to CONFIG.EVENT_ENDPOINT with { studentId: CONFIG.STUDENT_ID, name, payload, ts: Date.now() }
  console.log(`[Feature18 event] ${name}`, payload);
}

/* ----------------------------------------------------------------------------
   ICONS BY KEY (small helper so data objects can stay JSX-free)
   -------------------------------------------------------------------------- */
function ErrorTypeIcon({ iconKey, size = 14 }) {
  if (iconKey === "target") return <Target size={size} />;
  if (iconKey === "zap") return <Zap size={size} />;
  if (iconKey === "layers") return <Layers size={size} />;
  return <Sparkles size={size} />;
}

/* ----------------------------------------------------------------------------
   UI ATOMS
   -------------------------------------------------------------------------- */

function PrimaryButton({ children, onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="f18-focus"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 18px",
        borderRadius: 10,
        fontFamily: "Inter, sans-serif",
        fontSize: 14,
        fontWeight: 600,
        color: "#fff",
        background: disabled ? "#A7AFC9" : "var(--pen-blue)",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        transition: "background 150ms ease, transform 150ms ease",
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = "var(--pen-blue-dark)"; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = "var(--pen-blue)"; }}
    >
      {children}
      {Icon ? <Icon size={16} /> : null}
    </button>
  );
}

function GhostButton({ children, onClick, disabled, icon: Icon, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="f18-focus"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 16px",
        borderRadius: 10,
        fontFamily: "Inter, sans-serif",
        fontSize: 13.5,
        fontWeight: 600,
        color: active ? "#fff" : "var(--ink)",
        background: active ? "var(--pen-blue)" : "#fff",
        border: `1.5px solid ${active ? "var(--pen-blue)" : "var(--border)"}`,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "all 150ms ease",
      }}
    >
      {Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

function Chip({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#EEF0FA", fg: "var(--pen-blue-dark)" },
    verified: { bg: "var(--verified-bg)", fg: "var(--verified)" },
    flag: { bg: "var(--redpen-bg)", fg: "var(--redpen)" },
    muted: { bg: "#EEEFEA", fg: "var(--muted)" },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: "Inter, sans-serif",
        background: t.bg,
        color: t.fg,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 11,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      className="f18-fade"
      style={{
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: 18,
        padding: "24px",
        boxShadow: "0 1px 2px rgba(27,33,48,0.04), 0 8px 24px rgba(27,33,48,0.05)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   JOURNEY STEPPER (top-of-card wayfinding — order is real here, so numbering
   is earned per the design brief: the student actually moves through these
   in sequence even if the middle stage is explored non-linearly)
   -------------------------------------------------------------------------- */
function JourneyStepper({ stage }) {
  const activeIndex = stageToJourneyIndex(stage);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {JOURNEY_STAGES.map((label, i) => {
        const state = i < activeIndex ? "done" : i === activeIndex ? "active" : "todo";
        return (
          <React.Fragment key={label}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10.5,
                  fontFamily: "IBM Plex Mono, monospace",
                  fontWeight: 600,
                  background: state === "todo" ? "#EDEFEA" : state === "active" ? "var(--pen-blue)" : "var(--verified)",
                  color: state === "todo" ? "var(--muted)" : "#fff",
                  flexShrink: 0,
                }}
              >
                {state === "done" ? <CheckCircle2 size={12} /> : i + 1}
              </div>
              <span
                style={{
                  fontSize: 12.5,
                  fontFamily: "Inter, sans-serif",
                  fontWeight: state === "active" ? 700 : 500,
                  color: state === "todo" ? "var(--muted)" : "var(--ink)",
                }}
              >
                {label}
              </span>
            </div>
            {i < JOURNEY_STAGES.length - 1 && (
              <div style={{ width: 14, height: 1, background: "var(--border)", flexShrink: 0 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------------
   SIGNATURE ELEMENT — the working line.
   A vertical, hand-marked-style connector running through the step list,
   the way a teacher's pen traces down a worked solution: solid green while
   the reasoning holds, breaking to a dashed red-pen mark at the first
   suspected error, then fading to dashed grey for everything that followed
   as a consequence rather than a fresh mistake (spec \u00a73: LAST_CORRECT_STEP /
   FIRST_SUSPECTED_ERROR / CONSEQUENT_ERROR).
   -------------------------------------------------------------------------- */
function StepRow({ label, status, isLast }) {
  const cfg = {
    correct: { icon: <CheckCircle2 size={16} color="var(--verified)" />, line: "var(--verified)", dashed: false },
    first_error: { icon: <AlertTriangle size={16} color="var(--redpen)" />, line: "var(--redpen)", dashed: true },
    consequent: { icon: <XCircle size={16} color="var(--muted)" />, line: "var(--muted)", dashed: true },
  }[status];

  return (
    <div style={{ display: "flex", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16, flexShrink: 0 }}>
        <div style={{ background: "#fff", zIndex: 1, lineHeight: 0 }}>{cfg.icon}</div>
        {!isLast && (
          <div
            style={{
              flex: 1,
              width: 0,
              minHeight: 24,
              marginTop: 3,
              marginBottom: 3,
              borderLeft: `2px ${cfg.dashed ? "dashed" : "solid"} ${cfg.line}`,
            }}
          />
        )}
      </div>
      <div style={{ paddingBottom: 20 }}>
        <div
          style={{
            fontSize: 14,
            fontFamily: "Inter, sans-serif",
            fontWeight: status === "first_error" ? 700 : 500,
            color: status === "consequent" ? "var(--muted)" : "var(--ink)",
          }}
        >
          {label}
        </div>
        {status === "first_error" && (
          <div style={{ fontSize: 12, color: "var(--redpen)", fontWeight: 600, marginTop: 2 }}>This is where it broke</div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: QUESTION
   -------------------------------------------------------------------------- */
function QuestionScreen({ onSubmit }) {
  const [selected, setSelected] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const startRef = useRef(Date.now());

  return (
    <Card>
      <SectionLabel>{QUESTION.skill}</SectionLabel>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 19, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4, marginBottom: 22 }}>
        {QUESTION.text}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            className="f18-focus"
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1.5px solid ${selected === opt.id ? "var(--pen-blue)" : "var(--border)"}`,
              background: selected === opt.id ? "#EEF0FA" : "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              transition: "all 120ms ease",
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: `1.5px solid ${selected === opt.id ? "var(--pen-blue)" : "var(--border)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {selected === opt.id && <div style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--pen-blue)" }} />}
            </div>
            <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 15, color: "var(--ink)", fontWeight: 500 }}>{opt.label}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="f18-fade" style={{ marginBottom: 22 }}>
          <SectionLabel>How confident are you?</SectionLabel>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { id: "low", label: "Not sure" },
              { id: "medium", label: "Fairly confident" },
              { id: "high", label: "Very confident" },
            ].map((c) => (
              <GhostButton key={c.id} active={confidence === c.id} onClick={() => setConfidence(c.id)}>
                {c.label}
              </GhostButton>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PrimaryButton
          disabled={!selected || !confidence}
          icon={ArrowRight}
          onClick={() => {
            const seconds = (Date.now() - startRef.current) / 1000;
            onSubmit({ selected, confidence, seconds });
          }}
        >
          Submit answer
        </PrimaryButton>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: RESULT
   -------------------------------------------------------------------------- */
function ResultScreen({ attempt, branch, onAction }) {
  const calib = getCalibrationNote(branch, attempt.confidence, attempt.seconds);
  return (
    <Card>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <Chip tone={branch.isCorrect ? "verified" : "flag"}>
          {branch.isCorrect ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {branch.isCorrect ? "Correct" : "Incorrect"}
        </Chip>
        <Chip tone="muted"><Clock size={12} /> {formatSeconds(attempt.seconds)}</Chip>
        <Chip tone="muted">Confidence \u00b7 {attempt.confidence}</Chip>
        {branch.errorType && (
          <Chip tone="flag"><ErrorTypeIcon iconKey={branch.errorIconKey} size={12} /> {branch.errorType}</Chip>
        )}
      </div>

      {calib && (
        <div
          style={{
            fontSize: 13,
            padding: "10px 14px",
            borderRadius: 10,
            marginBottom: 18,
            background: calib.tone === "flag" ? "var(--redpen-bg)" : "var(--verified-bg)",
            color: calib.tone === "flag" ? "var(--redpen)" : "var(--verified)",
            fontWeight: 500,
          }}
        >
          {calib.text}
        </div>
      )}

      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 20, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        {branch.headline}
      </div>
      <div style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 24, lineHeight: 1.5 }}>{branch.sub}</div>

      <SectionLabel>Your approach</SectionLabel>
      <div style={{ marginBottom: 8 }}>
        {STEP_LABELS.map((label, i) => (
          <StepRow key={label} label={label} status={branch.steps[i]} isLast={i === STEP_LABELS.length - 1} />
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
        <GhostButton icon={Lightbulb} onClick={() => onAction("why")}>Show me why</GhostButton>
        <GhostButton icon={Sparkles} onClick={() => onAction("solve")}>Solve it with me</GhostButton>
        <GhostButton icon={Zap} onClick={() => onAction("alt")}>Try a faster way</GhostButton>
        <PrimaryButton icon={Target} onClick={() => onAction("transfer")}>Test my understanding</PrimaryButton>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: UNDERSTAND WHY
   -------------------------------------------------------------------------- */
function UnderstandWhy({ branch, attempt, onBack, onAction }) {
  const [repIndex, setRepIndex] = useState(0);
  const [thread, setThread] = useState([]); // { q, a, error }
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const repKey = REP_ORDER[repIndex];

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    setLoading(true);
    const ctx = {
      questionText: QUESTION.text,
      correctExplanation: BRANCHES.correct.reps.formula,
      selectedAnswerText: OPTIONS.find((o) => o.id === attempt.selected)?.label,
      wasCorrect: branch.isCorrect,
      errorType: branch.errorType,
    };
    try {
      const answer = await askClaudeWhy(q, ctx);
      setThread((t) => [...t, { q, a: answer, error: false }]);
    } catch (e) {
      setThread((t) => [...t, { q, a: branch.reps.plain, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <SectionLabel>Understand why</SectionLabel>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 17, fontWeight: 700, color: "var(--ink)" }}>{REP_LABEL[repKey]}</div>
        <GhostButton
          icon={ChevronRight}
          onClick={() => setRepIndex((i) => (i + 1) % REP_ORDER.length)}
        >
          Explain more simply
        </GhostButton>
      </div>

      <div
        className="f18-fade"
        key={repKey}
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--ink)",
          background: "var(--paper-alt)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "16px 18px",
          marginBottom: 20,
          fontFamily: repKey === "formula" ? "IBM Plex Mono, monospace" : "Inter, sans-serif",
        }}
      >
        {branch.reps[repKey]}
      </div>

      {thread.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          {thread.map((t, i) => (
            <div key={i}>
              <div style={{ fontSize: 13, fontStyle: "italic", color: "var(--ink-soft)", marginBottom: 4 }}>{"\u201c" + t.q + "\u201d"}</div>
              <div style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.55, paddingLeft: 12, borderLeft: "2px solid var(--border)" }}>
                {t.error && <span style={{ color: "var(--muted)", fontSize: 12, display: "block", marginBottom: 3 }}>Couldn't reach the reasoning engine \u2014 here's the core idea again:</span>}
                {t.a}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="Ask a follow-up about this problem\u2026"
          className="f18-focus"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1.5px solid var(--border)",
            fontSize: 13.5,
            fontFamily: "Inter, sans-serif",
            color: "var(--ink)",
          }}
        />
        <GhostButton icon={loading ? Loader2 : Send} onClick={ask} disabled={loading || !question.trim()}>
          {loading ? "Asking\u2026" : "Ask"}
        </GhostButton>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <GhostButton icon={Sparkles} onClick={() => onAction("solve")}>Solve it with me</GhostButton>
        <GhostButton onClick={onBack}>Back to result</GhostButton>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: SOLVE WITH ME
   -------------------------------------------------------------------------- */
function SolveWithMe({ onBack, onAction }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [feedback, setFeedback] = useState(null); // { correct, text }
  const [numericVal, setNumericVal] = useState("");
  const step = SOLVE_STEPS[stepIndex];
  const done = stepIndex >= SOLVE_STEPS.length;

  const handleChoice = (opt) => {
    if (opt.correct) {
      setFeedback({ correct: true, text: step.correctFeedback });
    } else {
      setFeedback({ correct: false, text: step.incorrectFeedback });
    }
  };

  const handleNumeric = () => {
    if (!numericVal.trim()) return;
    if (step.accept(numericVal)) {
      setFeedback({ correct: true, text: step.correctFeedback });
    } else {
      setFeedback({ correct: false, text: step.incorrectFeedback });
    }
  };

  const next = () => {
    setFeedback(null);
    setNumericVal("");
    setStepIndex((i) => i + 1);
  };

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <SectionLabel>Solve it with me</SectionLabel>
        <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono, monospace", color: "var(--muted)" }}>
          {done ? "Complete" : `Step ${stepIndex + 1} of ${SOLVE_STEPS.length}`}
        </span>
      </div>

      {!done && (
        <>
          <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 17, fontWeight: 600, color: "var(--ink)", marginBottom: 16 }}>
            {step.prompt}
          </div>

          {step.type === "choice" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {step.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleChoice(opt)}
                  disabled={!!feedback}
                  className="f18-focus"
                  style={{
                    textAlign: "left",
                    padding: "11px 15px",
                    borderRadius: 10,
                    border: "1.5px solid var(--border)",
                    background: "#fff",
                    cursor: feedback ? "default" : "pointer",
                    fontSize: 14,
                    fontFamily: "Inter, sans-serif",
                    color: "var(--ink)",
                  }}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          )}

          {step.type === "numeric" && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                value={numericVal}
                onChange={(e) => setNumericVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNumeric()}
                disabled={!!feedback}
                placeholder="Type your answer"
                className="f18-focus"
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1.5px solid var(--border)",
                  fontSize: 14,
                  fontFamily: "IBM Plex Mono, monospace",
                }}
              />
              {!feedback && <PrimaryButton onClick={handleNumeric}>Check</PrimaryButton>}
            </div>
          )}

          {feedback && (
            <div
              className="f18-fade"
              style={{
                fontSize: 13.5,
                padding: "10px 14px",
                borderRadius: 10,
                marginBottom: 18,
                background: feedback.correct ? "var(--verified-bg)" : "var(--redpen-bg)",
                color: feedback.correct ? "var(--verified)" : "var(--redpen)",
                fontWeight: 500,
              }}
            >
              {feedback.text}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <GhostButton onClick={onBack}>Back to result</GhostButton>
            {feedback && (
              <PrimaryButton icon={ArrowRight} onClick={next}>
                {stepIndex === SOLVE_STEPS.length - 1 ? "Finish" : "Next step"}
              </PrimaryButton>
            )}
            {!feedback && step.type === "choice" && <div />}
          </div>
        </>
      )}

      {done && (
        <div className="f18-fade">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <CheckCircle2 size={20} color="var(--verified)" />
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
              Reconstructed, independently.
            </div>
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-soft)", marginBottom: 22, lineHeight: 1.5 }}>
            You rebuilt the reasoning yourself, step by step. Ready to see if it holds on a new question?
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <GhostButton onClick={onBack}>Back to result</GhostButton>
            <GhostButton icon={Zap} onClick={() => onAction("alt")}>Try a faster way</GhostButton>
            <PrimaryButton icon={Target} onClick={() => onAction("transfer")}>Test my understanding</PrimaryButton>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: ALTERNATIVE METHODS
   -------------------------------------------------------------------------- */
function AlternativeMethods({ onBack, onAction }) {
  return (
    <Card>
      <SectionLabel>Another way</SectionLabel>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        Two correct routes to 20%
      </div>
      <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 20, lineHeight: 1.5 }}>
        Both are fully correct. The shortcut trades a little step-by-step intuition for speed \u2014 useful once the base-value idea is solid.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginBottom: 8 }}>
        {ALT_METHODS.map((m, idx) => (
          <div key={m.name} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px", background: idx === 1 ? "var(--paper-alt)" : "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 14.5, color: "var(--ink)" }}>{m.name}</div>
              <Chip tone={idx === 1 ? "verified" : "neutral"}><Clock size={11} /> {m.time}</Chip>
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
              {m.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 13.5, fontFamily: "IBM Plex Mono, monospace", color: "var(--ink)" }}>{s}</li>
              ))}
            </ol>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Best for: {m.bestFor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        <GhostButton onClick={onBack}>Back to result</GhostButton>
        <PrimaryButton icon={Target} onClick={() => onAction("transfer")}>Test my understanding</PrimaryButton>
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: TRANSFER QUESTION
   -------------------------------------------------------------------------- */
function TransferScreen({ onSubmit }) {
  const [selected, setSelected] = useState(null);
  const startRef = useRef(Date.now());
  return (
    <Card>
      <SectionLabel>{TRANSFER_QUESTION.skill}</SectionLabel>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 10, fontStyle: "italic" }}>
        Different numbers, same underlying idea \u2014 this checks whether the reasoning transfers, not just the answer.
      </div>
      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 19, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4, marginBottom: 22 }}>
        {TRANSFER_QUESTION.text}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
        {TRANSFER_QUESTION.options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            className="f18-focus"
            style={{
              textAlign: "left",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1.5px solid ${selected === opt.id ? "var(--pen-blue)" : "var(--border)"}`,
              background: selected === opt.id ? "#EEF0FA" : "#fff",
              cursor: "pointer",
              fontSize: 14,
              fontFamily: "Inter, sans-serif",
              color: "var(--ink)",
            }}
          >
            {opt.text}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <PrimaryButton
          disabled={!selected}
          icon={ArrowRight}
          onClick={() => onSubmit({ selected, correct: TRANSFER_QUESTION.options.find((o) => o.id === selected)?.correct === true, seconds: (Date.now() - startRef.current) / 1000 })}
        >
          Submit
        </PrimaryButton>
      </div>
    </Card>
  );
}

function TransferResult({ result, onContinue }) {
  const [revealed, setRevealed] = useState(false);
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {result.correct ? <CheckCircle2 size={22} color="var(--verified)" /> : <AlertTriangle size={22} color="var(--redpen)" />}
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          {result.correct ? "Transfer verified." : "Not yet \u2014 let's look closer."}
        </div>
      </div>
      <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.6, marginBottom: 18 }}>
        {result.correct ? TRANSFER_QUESTION.correctMsg : TRANSFER_QUESTION.incorrectMsg}
      </div>

      {!result.correct && (
        <div style={{ marginBottom: 18 }}>
          {!revealed ? (
            <GhostButton icon={Lightbulb} onClick={() => setRevealed(true)}>Show me the worked version</GhostButton>
          ) : (
            <div
              className="f18-fade"
              style={{
                fontSize: 14,
                fontFamily: "IBM Plex Mono, monospace",
                background: "var(--paper-alt)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: "14px 16px",
                color: "var(--ink)",
              }}
            >
              {TRANSFER_QUESTION.reveal}
            </div>
          )}
        </div>
      )}

      <PrimaryButton icon={ArrowRight} onClick={onContinue}>
        {result.correct ? "See updated evidence" : "Continue anyway"}
      </PrimaryButton>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   SCREEN: MASTERY / EVIDENCE UPDATE
   INTEGRATION POINT — this whole panel is a SIMULATION of what Feature 14
   (mastery/transfer) and Feature 15 (journey orchestration) would compute
   from real evidence. Nothing here is written to a real student model.
   -------------------------------------------------------------------------- */
function MasteryUpdate({ onRestart }) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Award size={22} color="var(--pen-blue)" />
        <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 18, fontWeight: 700, color: "var(--ink)" }}>
          Evidence sent to the ACEAPT intelligence graph
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, marginBottom: 22 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, color: "var(--ink)" }}>Strategy-selection mastery</span>
            <span style={{ fontFamily: "IBM Plex Mono, monospace", color: "var(--verified)" }}>
              {MASTERY_DATA.masteryBefore}% \u2192 {MASTERY_DATA.masteryAfter}%
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "#EDEFEA", overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, width: `${MASTERY_DATA.masteryBefore}%`, background: "#C9CEE8" }} />
            <div className="f18-grow" style={{ position: "absolute", inset: 0, width: `${MASTERY_DATA.masteryAfter}%`, background: "var(--pen-blue)", borderRadius: 999 }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Transfer evidence</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "IBM Plex Mono, monospace" }}>
            <span style={{ color: "var(--muted)" }}>{MASTERY_DATA.transferBefore}</span>
            <ArrowRight size={13} color="var(--muted)" />
            <span style={{ color: "var(--verified)", fontWeight: 700 }}>{MASTERY_DATA.transferAfter}</span>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Next journey step unlocked</div>
          <div style={{ fontSize: 13.5, color: "var(--pen-blue-dark)", background: "#EEF0FA", padding: "9px 13px", borderRadius: 10, display: "inline-block" }}>
            {MASTERY_DATA.nextUnlock}
          </div>
        </div>
      </div>

      <SectionLabel>This simulated evidence would update</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {MASTERY_DATA.evidenceTargets.map((t) => (
          <Chip key={t} tone="neutral"><BarChart3 size={12} /> {t}</Chip>
        ))}
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>
        Prototype note: these numbers are illustrative. A real build replaces this panel with the actual
        Feature 14 / Feature 15 write \u2014 see INTEGRATION-NOTES.md for the shape of that call.
      </div>

      <GhostButton icon={RotateCcw} onClick={onRestart}>Run through it again</GhostButton>
    </Card>
  );
}

/* ----------------------------------------------------------------------------
   EVIDENCE DOCK — small persistent strip once an attempt exists
   -------------------------------------------------------------------------- */
function EvidenceDock({ attempt, branch }) {
  if (!attempt) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
      <Chip tone={branch.isCorrect ? "verified" : "flag"}>
        {branch.isCorrect ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
        {OPTIONS.find((o) => o.id === attempt.selected)?.label}
      </Chip>
      <Chip tone="muted"><Clock size={11} /> {formatSeconds(attempt.seconds)}</Chip>
      <Chip tone="muted">Confidence \u00b7 {attempt.confidence}</Chip>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   ROOT
   -------------------------------------------------------------------------- */
export default function Feature18ReasoningCoach() {
  const [stage, setStage] = useState("question");
  const [attempt, setAttempt] = useState(null);
  const [transferResult, setTransferResult] = useState(null);

  const branch = attempt ? BRANCHES[OPTION_TO_BRANCH[attempt.selected]] : null;

  const handleSubmit = (a) => {
    setAttempt(a);
    const b = BRANCHES[OPTION_TO_BRANCH[a.selected]];
    emitEvent("SOLUTION_ANALYSIS_STARTED", { question: QUESTION.text });
    emitEvent("ERROR_CLASSIFIED", { branch: b.key, errorType: b.errorType, confidence: a.confidence, seconds: a.seconds });
    setStage("result");
  };

  const handleAction = (action) => {
    emitEvent(action === "why" ? "EXPLANATION_GENERATED" : action === "solve" ? "GUIDED_STEP_STARTED" : action === "alt" ? "ALTERNATIVE_METHOD_VIEWED" : "TRANSFER_VERIFICATION_STARTED", { branch: branch?.key });
    setStage(action);
  };

  const handleTransferSubmit = (r) => {
    setTransferResult(r);
    emitEvent("TRANSFER_VERIFIED", { correct: r.correct, seconds: r.seconds });
    setStage("transferResult");
  };

  const restart = () => {
    setStage("question");
    setAttempt(null);
    setTransferResult(null);
  };

  return (
    <div
      className="f18-root"
      style={{
        minHeight: "100%",
        background: "var(--paper)",
        padding: "28px 16px 60px",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .f18-root {
          --paper: #F5F6F3;
          --paper-alt: #ECEEE8;
          --ink: #1B2130;
          --ink-soft: #4B5265;
          --pen-blue: #33459E;
          --pen-blue-dark: #29357D;
          --verified: #0E7C6B;
          --verified-bg: #E4F3EF;
          --redpen: #A13345;
          --redpen-bg: #F6E9EB;
          --muted: #9AA0AE;
          --border: #E1E3DD;
        }
        .f18-fade { animation: f18FadeIn 260ms ease both; }
        @keyframes f18FadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .f18-grow { transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1); }
        .f18-focus:focus-visible {
          outline: 2px solid var(--pen-blue);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .f18-fade, .f18-grow { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>
              PrepVista \u00b7 ACEAPT
            </div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ink)", display: "flex", alignItems: "center", gap: 10 }}>
              Reasoning Coach
              <span
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: "var(--muted)",
                  background: "#fff",
                  border: "1px solid var(--border)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Vertical-slice demo
              </span>
            </div>
          </div>
          <button
            onClick={restart}
            className="f18-focus"
            title="Reset demo"
            style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 8, cursor: "pointer", color: "var(--ink-soft)", display: "flex" }}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 24, background: "#fff", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px", overflowX: "auto" }}>
          <JourneyStepper stage={stage} />
        </div>

        {stage !== "question" && <EvidenceDock attempt={attempt} branch={branch} />}

        {stage === "question" && <QuestionScreen onSubmit={handleSubmit} />}
        {stage === "result" && <ResultScreen attempt={attempt} branch={branch} onAction={handleAction} />}
        {stage === "why" && <UnderstandWhy branch={branch} attempt={attempt} onBack={() => setStage("result")} onAction={handleAction} />}
        {stage === "solve" && <SolveWithMe onBack={() => setStage("result")} onAction={handleAction} />}
        {stage === "alt" && <AlternativeMethods onBack={() => setStage("result")} onAction={handleAction} />}
        {stage === "transfer" && <TransferScreen onSubmit={handleTransferSubmit} />}
        {stage === "transferResult" && <TransferResult result={transferResult} onContinue={() => setStage("mastery")} />}
        {stage === "mastery" && <MasteryUpdate onRestart={restart} />}

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 11.5, color: "var(--muted)" }}>
          Deterministic math &amp; classification \u00b7 live reasoning calls fall back gracefully if unreachable
        </div>
      </div>
    </div>
  );
}

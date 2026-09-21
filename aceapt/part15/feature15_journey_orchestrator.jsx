import React, { useState, useMemo } from "react";
import {
  CheckCircle2,
  Circle,
  Lock,
  AlertTriangle,
  Clock,
  TrendingUp,
  RefreshCw,
  X,
  Compass,
  ListChecks,
  CalendarClock,
  Zap,
  Target,
} from "lucide-react";

/* =====================================================================
   CONFIG
   Wire these up when this connects to the real ACEAPT backend. Left
   blank on purpose. Everything below runs on MOCK_EVIDENCE instead,
   shaped like what these endpoints should eventually return, so
   swapping mock data for real fetch() calls should be a small change.
===================================================================== */
const CONFIG = {
  API_BASE_URL: "",
  FEATURE_10_TRAJECTORY_ENDPOINT: "",
  FEATURE_11_BEHAVIOR_ENDPOINT: "",
  FEATURE_12_INTERVENTION_ENDPOINT: "",
  FEATURE_13_READINESS_ENDPOINT: "",
  FEATURE_14_MASTERY_ENDPOINT: "",
  AUTH_TOKEN: "",
};

/* =====================================================================
   SKILL TAXONOMY
   Stand-in for ACEAPT's real skill graph. Replace SKILLS with the
   real taxonomy (or fetch it) once this is wired to the real system —
   the engine below only assumes { id, name, domain, prereqs[] }.
===================================================================== */
const MASTERY = { NOT_STARTED: 0, DEVELOPING: 1, STABLE: 2, ROBUST: 3 };
const MASTERY_LABEL = {
  0: "Not started",
  1: "Developing",
  2: "Stable",
  3: "Robust mastery",
};

const SKILLS = [
  { id: "percentage", name: "Percentage", domain: "Quantitative Aptitude", prereqs: [] },
  { id: "ratio", name: "Ratio", domain: "Quantitative Aptitude", prereqs: [] },
  { id: "profit_loss", name: "Profit & Loss", domain: "Quantitative Aptitude", prereqs: ["percentage", "ratio"] },
  { id: "discount", name: "Discount", domain: "Quantitative Aptitude", prereqs: ["profit_loss"] },
  { id: "time_work", name: "Time & Work", domain: "Quantitative Aptitude", prereqs: ["ratio"] },
  { id: "probability", name: "Probability", domain: "Quantitative Aptitude", prereqs: [] },
  { id: "data_interpretation", name: "Data Interpretation", domain: "Quantitative Aptitude", prereqs: ["percentage"] },
  { id: "advanced_applications", name: "Advanced Applications", domain: "Quantitative Aptitude", prereqs: ["discount", "time_work"] },
];

// Mock stand-in for Feature 14's (mastery/transfer engine) output.
// Replace with a real read from CONFIG.FEATURE_14_MASTERY_ENDPOINT.
const INITIAL_EVIDENCE = {
  percentage: { mastery: MASTERY.ROBUST, transferGap: false, lastPracticed: "3 days ago" },
  ratio: { mastery: MASTERY.DEVELOPING, transferGap: false, lastPracticed: "1 day ago" },
  profit_loss: { mastery: MASTERY.NOT_STARTED, transferGap: false, lastPracticed: "never" },
  discount: { mastery: MASTERY.NOT_STARTED, transferGap: false, lastPracticed: "never" },
  time_work: { mastery: MASTERY.NOT_STARTED, transferGap: false, lastPracticed: "never" },
  probability: { mastery: MASTERY.STABLE, transferGap: false, lastPracticed: "5 days ago" },
  data_interpretation: { mastery: MASTERY.DEVELOPING, transferGap: true, lastPracticed: "2 days ago" },
  advanced_applications: { mastery: MASTERY.NOT_STARTED, transferGap: false, lastPracticed: "never" },
};

const ACTIVITY_META = {
  foundation_new: { label: "Foundation Practice", minutes: 10 },
  foundation_repair: { label: "Foundation Repair", minutes: 10 },
  practice: { label: "Targeted Practice", minutes: 8 },
  intro: { label: "Introduction", minutes: 8 },
  transfer: { label: "Transfer Challenge", minutes: 7 },
  retention: { label: "Retention Check", minutes: 5 },
};

/* =====================================================================
   DETERMINISTIC ENGINE
   Priority, blocking, sequencing and state are all plain, explainable
   application logic — no model call decides mastery or ordering.
   Student data -> mastery -> dependencies -> priority -> path.
   An LLM would only sit on top of this to restyle the "why" text.
===================================================================== */
function getSkill(id) {
  return SKILLS.find((s) => s.id === id);
}

function getDownstream(id, visited) {
  visited = visited || new Set();
  const out = new Set();
  SKILLS.forEach((s) => {
    if (s.prereqs.includes(id) && !visited.has(s.id)) {
      visited.add(s.id);
      out.add(s.id);
      getDownstream(s.id, visited).forEach((d) => out.add(d));
    }
  });
  return out;
}

function isSatisfied(prereqId, evidence) {
  return evidence[prereqId].mastery >= MASTERY.STABLE;
}

// Walks unmet prerequisites down to the actual root cause, so the
// engine repairs the foundation instead of drilling the symptom.
function findRootBlockers(skillId, evidence) {
  const skill = getSkill(skillId);
  const unmet = skill.prereqs.filter((p) => !isSatisfied(p, evidence));
  if (unmet.length === 0) return [];
  const roots = [];
  unmet.forEach((p) => {
    const deeper = findRootBlockers(p, evidence);
    if (deeper.length === 0) roots.push(p);
    else roots.push(...deeper);
  });
  return Array.from(new Set(roots));
}

function computeState(skillId, evidence) {
  const skill = getSkill(skillId);
  const e = evidence[skillId];
  const unmet = skill.prereqs.filter((p) => !isSatisfied(p, evidence));
  if (unmet.length > 0) return "BLOCKED";
  if (e.mastery === MASTERY.ROBUST && !e.transferGap) return "MASTERED";
  if (e.transferGap) return "NEEDS_REVIEW";
  return "READY";
}

function computeNeedScore(e) {
  if (e.transferGap) return Math.max(0.5, (3 - e.mastery) / 3);
  return (3 - e.mastery) / 3;
}

function evaluateAll(evidence, ctx) {
  const downstreamCounts = {};
  SKILLS.forEach((s) => {
    downstreamCounts[s.id] = getDownstream(s.id).size;
  });
  const maxDownstream = Math.max(...Object.values(downstreamCounts), 1);
  const urgencyBase =
    ctx.deadlineDays == null ? 0.4 : Math.max(0, Math.min(1, 1 - ctx.deadlineDays / 30));

  return SKILLS.map((s) => {
    const state = computeState(s.id, evidence);
    const downstream = downstreamCounts[s.id];
    const impactScore = downstream / maxDownstream;
    const isBottleneck = downstream >= 2 && evidence[s.id].mastery < MASTERY.STABLE;
    const rootBlockers = state === "BLOCKED" ? findRootBlockers(s.id, evidence) : [];

    // Priority = need, gated by impact (bottleneck-ness), urgency
    // (deadline pressure) and whether fixing it unlocks anything.
    // needScore gates the rest so a barely-relevant, high-downstream
    // skill that's already fine doesn't outrank a genuine gap.
    let priority = null;
    if (state === "READY" || state === "NEEDS_REVIEW") {
      const needScore = computeNeedScore(evidence[s.id]);
      const dependencyBonus = downstream > 0 ? 1 : 0.3;
      const score = needScore * (0.4 + 0.3 * impactScore + 0.2 * urgencyBase + 0.1 * dependencyBonus);
      priority = { score, needScore, impactScore, urgencyBase, dependencyBonus };
    }

    return { ...s, state, downstream, impactScore, isBottleneck, rootBlockers, priority };
  });
}

function computeRootBlockerSet(evaluated, evidence) {
  const set = new Set();
  evaluated
    .filter((s) => s.state === "BLOCKED")
    .forEach((s) => findRootBlockers(s.id, evidence).forEach((r) => set.add(r)));
  return set;
}

function getActivityType(skillId, evidence, rootBlockerSet) {
  const state = computeState(skillId, evidence);
  const e = evidence[skillId];
  if (state === "NEEDS_REVIEW") return e.transferGap ? "transfer" : "retention";
  if (rootBlockerSet.has(skillId)) {
    return e.mastery === MASTERY.NOT_STARTED ? "foundation_new" : "foundation_repair";
  }
  if (e.mastery === MASTERY.STABLE) return "retention";
  if (e.mastery === MASTERY.NOT_STARTED) return "intro";
  return "practice";
}

function buildPath(evidence, ctx) {
  const evaluated = evaluateAll(evidence, ctx);
  const rootBlockerSet = computeRootBlockerSet(evaluated, evidence);
  const actionable = evaluated
    .filter((s) => s.priority)
    .map((s) => ({ ...s, activityType: getActivityType(s.id, evidence, rootBlockerSet) }))
    .sort((a, b) => b.priority.score - a.priority.score);
  return { evaluated, actionable, rootBlockerSet };
}

// Greedy fit against the time budget, not a blind truncation: it
// always includes the top item, then keeps adding whatever still
// fits, in priority order.
function buildDailyPlan(actionable, availableMinutes) {
  const plan = [];
  let used = 0;
  for (let i = 0; i < actionable.length; i++) {
    const item = actionable[i];
    const meta = ACTIVITY_META[item.activityType];
    if (plan.length === 0 || used + meta.minutes <= availableMinutes) {
      plan.push({ ...item, minutes: meta.minutes, label: meta.label });
      used += meta.minutes;
    }
    if (used >= availableMinutes && plan.length > 0) break;
  }
  const fullWorkload = actionable.reduce((sum, it) => sum + ACTIVITY_META[it.activityType].minutes, 0);
  return { plan, usedMinutes: used, fullWorkload, overloaded: fullWorkload > availableMinutes };
}

function explainWhy(item, ctx) {
  const reasons = [];
  if (item.isBottleneck) {
    reasons.push(`it unlocks ${item.downstream} other skill${item.downstream === 1 ? "" : "s"} on your path`);
  }
  if (item.activityType === "transfer") {
    reasons.push("recent attempts show it doesn't yet transfer to unfamiliar questions");
  }
  if (item.activityType === "retention") {
    reasons.push("a short check now protects mastery you already have");
  }
  if ((item.activityType === "foundation_new" || item.activityType === "foundation_repair") && !item.isBottleneck) {
    reasons.push("current evidence is still developing");
  }
  if (ctx.deadlineDays != null && ctx.deadlineDays <= 14 && item.isBottleneck) {
    reasons.push(`your assessment is in ${ctx.deadlineDays} days`);
  }
  if (reasons.length === 0) reasons.push("it's the next unblocked, highest-value skill on your path");
  return reasons.join(", and ");
}

function explainWhyNot(skillId, evidence) {
  const state = computeState(skillId, evidence);
  if (state === "MASTERED") {
    return "Robust, independent mastery with no transfer gaps. Moved to periodic retention checks instead of active practice.";
  }
  return null;
}

function computeStage(evaluated, evidence) {
  const total = evaluated.length;
  const blockedCount = evaluated.filter((s) => s.state === "BLOCKED").length;
  const masteredCount = evaluated.filter((s) => s.state === "MASTERED").length;
  const transferGapCount = evaluated.filter((s) => evidence[s.id].transferGap).length;
  const masteredPct = masteredCount / total;
  const STAGES = ["Foundation", "Core Mastery", "Application", "Transfer", "Assessment Ready"];
  let index;
  if (blockedCount / total >= 0.3) index = 0;
  else if (masteredPct < 0.4) index = 1;
  else if (transferGapCount > 0) index = 3;
  else if (masteredPct < 0.75) index = 2;
  else index = 4;
  return { index, name: STAGES[index], stages: STAGES };
}

function computeProgress(evaluated, evidence) {
  const total = evaluated.length;
  const engaged = evaluated.filter((s) => evidence[s.id].mastery > MASTERY.NOT_STARTED).length;
  const robust = evaluated.filter((s) => evidence[s.id].mastery === MASTERY.ROBUST).length;
  const engagedSkills = evaluated.filter((s) => evidence[s.id].mastery >= MASTERY.DEVELOPING);
  const transferOk = engagedSkills.filter((s) => !evidence[s.id].transferGap).length;
  return {
    coveragePct: Math.round((engaged / total) * 100),
    robustPct: Math.round((robust / total) * 100),
    transferPct: engagedSkills.length ? Math.round((transferOk / engagedSkills.length) * 100) : 0,
  };
}

function getMode(deadlineDays) {
  if (deadlineDays == null) return "long-term";
  if (deadlineDays <= 7) return "last-minute";
  if (deadlineDays >= 45) return "long-term";
  return "standard";
}

function activityKey(skillId, activityType) {
  return `${skillId}__${activityType}`;
}

// Builds the "your path just changed" explanation by diffing two
// evaluated snapshots — every change shown to the student traces back
// to a real state transition, nothing is invented after the fact.
function diffPaths(oldEval, newEval, oldEvidence, newEvidence) {
  const logs = [];
  newEval.forEach((ns) => {
    const os = oldEval.find((s) => s.id === ns.id);
    if (!os) return;
    const oldMastery = oldEvidence[ns.id].mastery;
    const newMastery = newEvidence[ns.id].mastery;
    if (oldMastery !== newMastery) {
      logs.push(`${ns.name}: ${MASTERY_LABEL[oldMastery]} \u2192 ${MASTERY_LABEL[newMastery]}`);
    }
    if (oldEvidence[ns.id].transferGap && !newEvidence[ns.id].transferGap) {
      logs.push(`${ns.name} transfer gap closed`);
    }
    if (os.state === "BLOCKED" && ns.state !== "BLOCKED") {
      logs.push(`${ns.name} unlocked \u2014 its prerequisite is now strong enough`);
    }
    if (ns.state === "MASTERED" && os.state !== "MASTERED") {
      logs.push(`${ns.name} moved to retention scheduling`);
    }
  });
  return logs;
}

/* =====================================================================
   PRESENTATION HELPERS
===================================================================== */
const STATE_META = {
  MASTERED: { icon: CheckCircle2, text: "Mastered", cls: "text-emerald-400" },
  NEEDS_REVIEW: { icon: AlertTriangle, text: "Needs review", cls: "text-violet-400" },
  BLOCKED: { icon: Lock, text: "Blocked", cls: "text-rose-400" },
  READY: { icon: Circle, text: "Ready", cls: "text-sky-400" },
};

function StateBadge({ state }) {
  const m = STATE_META[state] || STATE_META.READY;
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {m.text}
    </span>
  );
}

function ProgressBar({ label, value }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-stone-400">{label}</span>
        <span className="text-xs text-stone-300 font-mono">{value}%</span>
      </div>
      <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-900 p-2.5 text-center">
      <p className="text-lg font-semibold text-stone-100 font-mono">{value}</p>
      <p className="text-xs text-stone-500">{label}</p>
    </div>
  );
}

/* =====================================================================
   MAIN COMPONENT
===================================================================== */
export default function Feature15JourneyOrchestrator() {
  const [evidence, setEvidence] = useState(() => JSON.parse(JSON.stringify(INITIAL_EVIDENCE)));
  const [availableMinutes, setAvailableMinutes] = useState(30);
  const [deadlineDays, setDeadlineDays] = useState(14);
  const [noDeadline, setNoDeadline] = useState(false);
  const [activeTab, setActiveTab] = useState("today");
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [changeLog, setChangeLog] = useState([]);
  const [completedIds, setCompletedIds] = useState([]);

  const ctx = useMemo(() => ({ deadlineDays: noDeadline ? null : deadlineDays }), [deadlineDays, noDeadline]);
  const { evaluated, actionable, rootBlockerSet } = useMemo(() => buildPath(evidence, ctx), [evidence, ctx]);
  const dailyPlan = useMemo(() => buildDailyPlan(actionable, availableMinutes), [actionable, availableMinutes]);
  const stage = useMemo(() => computeStage(evaluated, evidence), [evaluated, evidence]);
  const progress = useMemo(() => computeProgress(evaluated, evidence), [evaluated, evidence]);
  const mode = getMode(ctx.deadlineDays);

  const handleComplete = (skillId) => {
    const item = evaluated.find((s) => s.id === skillId);
    if (!item || item.state === "BLOCKED" || item.state === "MASTERED") return;
    const activityType = getActivityType(skillId, evidence, rootBlockerSet);
    const nextEvidence = JSON.parse(JSON.stringify(evidence));
    const e = nextEvidence[skillId];
    if (activityType === "transfer") {
      e.transferGap = false;
      if (e.mastery < MASTERY.STABLE) e.mastery += 1;
    } else if (activityType === "retention") {
      if (e.mastery < MASTERY.ROBUST) e.mastery += 1;
    } else {
      if (e.mastery < MASTERY.STABLE) e.mastery += 1;
    }
    e.lastPracticed = "just now";
    const nextResult = buildPath(nextEvidence, ctx);
    const logs = diffPaths(evaluated, nextResult.evaluated, evidence, nextEvidence);
    setChangeLog(logs);
    setCompletedIds((prev) => [...prev, activityKey(skillId, activityType)]);
    setEvidence(nextEvidence);
    setSelectedSkillId(null);
  };

  const selectedSkill = selectedSkillId ? evaluated.find((s) => s.id === selectedSkillId) : null;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6">

        <div className="flex items-start justify-between border-b border-stone-800 pb-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold">ACEAPT AI</p>
            <h1 className="text-xl font-semibold text-stone-100 mt-0.5">Your Learning Journey</h1>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-stone-500">You are here</p>
            <p className="text-sm font-medium text-stone-200">{stage.name}</p>
          </div>
        </div>

        <div className="flex items-start mb-5">
          {stage.stages.map((name, i) => (
            <React.Fragment key={name}>
              <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    i < stage.index
                      ? "bg-amber-500"
                      : i === stage.index
                      ? "bg-amber-400 ring-2 ring-amber-900"
                      : "bg-stone-700"
                  }`}
                />
                <span
                  className={`text-xs text-center leading-tight truncate w-full ${
                    i === stage.index ? "text-amber-400 font-medium" : "text-stone-600"
                  }`}
                >
                  {name}
                </span>
              </div>
              {i < stage.stages.length - 1 && (
                <div className={`h-px flex-1 mt-1 ${i < stage.index ? "bg-amber-700" : "bg-stone-800"}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 bg-stone-900 border border-stone-800 rounded-lg px-2 py-1.5">
            <Clock className="w-3.5 h-3.5 text-stone-500" />
            {[10, 20, 30, 45, 60, 90].map((m) => (
              <button
                key={m}
                onClick={() => setAvailableMinutes(m)}
                className={`px-2 py-0.5 rounded-md text-xs font-mono font-medium ${
                  availableMinutes === m ? "bg-amber-500 text-stone-950" : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {m}m
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-stone-900 border border-stone-800 rounded-lg px-2 py-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-stone-500" />
            {!noDeadline ? (
              <>
                <button
                  onClick={() => setDeadlineDays((d) => Math.max(1, d - 1))}
                  className="w-5 h-5 flex items-center justify-center text-stone-400 hover:text-stone-200"
                >
                  -
                </button>
                <span className="text-xs text-stone-300 w-20 text-center font-mono">{deadlineDays} days left</span>
                <button
                  onClick={() => setDeadlineDays((d) => Math.min(120, d + 1))}
                  className="w-5 h-5 flex items-center justify-center text-stone-400 hover:text-stone-200"
                >
                  +
                </button>
                <button
                  onClick={() => setNoDeadline(true)}
                  className="text-xs text-amber-400 hover:text-amber-300 ml-1"
                >
                  No deadline
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-stone-300 px-1">No deadline set</span>
                <button
                  onClick={() => setNoDeadline(false)}
                  className="text-xs text-amber-400 hover:text-amber-300 ml-1"
                >
                  Set deadline
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-4">
          {mode === "last-minute" && (
            <>
              <Zap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
              <span>Last-minute mode \u2014 focusing only on what will move the needle most before your assessment.</span>
            </>
          )}
          {mode === "long-term" && (
            <>
              <Compass className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              <span>Long-term mode \u2014 optimizing for depth, retention and transfer rather than speed.</span>
            </>
          )}
          {mode === "standard" && (
            <>
              <Target className="w-3.5 h-3.5 text-stone-500 shrink-0" />
              <span>Balancing coverage with depth for your {deadlineDays}-day timeline.</span>
            </>
          )}
        </div>

        {changeLog.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-800 bg-stone-900 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-amber-400 text-sm font-medium">
                <RefreshCw className="w-3.5 h-3.5" />
                Your path just changed
              </div>
              <button onClick={() => setChangeLog([])} className="text-stone-500 hover:text-stone-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="space-y-1">
              {changeLog.map((log, i) => (
                <li key={i} className="text-xs text-stone-400 pl-3 border-l border-stone-700">
                  {log}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-1 mb-4 border-b border-stone-800">
          {[
            { id: "today", label: "Today", icon: ListChecks },
            { id: "map", label: "Journey Map", icon: Compass },
            { id: "progress", label: "Progress", icon: TrendingUp },
          ].map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                  active ? "border-amber-400 text-amber-400" : "border-transparent text-stone-500 hover:text-stone-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTab === "today" && (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wide">Today's Journey</h2>
              <span className="text-xs text-stone-500 font-mono">
                {dailyPlan.usedMinutes} of {availableMinutes} min
              </span>
            </div>

            {dailyPlan.plan.length === 0 && (
              <p className="text-sm text-stone-500 bg-stone-900 border border-stone-800 rounded-lg p-4">
                Nothing is actionable right now. Everything left is either mastered or waiting on a
                prerequisite \u2014 check the Journey Map to see what's blocking progress.
              </p>
            )}

            <div className="space-y-2">
              {dailyPlan.plan.map((item, idx) => {
                const done = completedIds.includes(activityKey(item.id, item.activityType));
                return (
                  <div key={item.id} className="rounded-lg border border-stone-800 bg-stone-900 p-3">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-stone-800 flex items-center justify-center text-xs font-mono font-semibold text-stone-400 shrink-0 mt-0.5">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-stone-100">{item.name}</p>
                          <span className="text-xs text-stone-500 flex items-center gap-1 shrink-0 font-mono">
                            <Clock className="w-3 h-3" />
                            {item.minutes} min
                          </span>
                        </div>
                        <p className="text-xs text-amber-400 mt-0.5">{item.label}</p>
                        <p className="text-xs text-stone-500 mt-1.5">{explainWhy(item, ctx)}</p>
                        <button
                          onClick={() => handleComplete(item.id)}
                          disabled={done}
                          className={`mt-2 text-xs font-medium px-2.5 py-1 rounded-md ${
                            done ? "bg-stone-800 text-stone-600" : "bg-amber-500 text-stone-950 hover:bg-amber-400"
                          }`}
                        >
                          {done ? "Completed" : "Mark complete"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {dailyPlan.overloaded && (
              <p className="text-xs text-orange-400 mt-3 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Your available time ({availableMinutes}m) is less than the full recommended workload (
                  {dailyPlan.fullWorkload}m). We've prioritized the highest-impact activities.
                </span>
              </p>
            )}
            {!dailyPlan.overloaded && dailyPlan.plan.length > 0 && dailyPlan.usedMinutes < availableMinutes && (
              <p className="text-xs text-stone-500 mt-3">
                You have {availableMinutes - dailyPlan.usedMinutes} minutes to spare \u2014 everything else is
                either mastered or still locked. Explore the Journey Map if you'd like to look ahead.
              </p>
            )}
          </div>
        )}

        {activeTab === "map" && (
          <div>
            <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wide mb-1">Mastery Journey Map</h2>
            <p className="text-xs text-stone-500 mb-3">Quantitative Aptitude</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {evaluated.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSkillId(s.id)}
                  className="text-left rounded-lg border border-stone-800 bg-stone-900 p-3 hover:border-stone-700"
                >
                  <p className="text-sm font-medium text-stone-100 truncate">{s.name}</p>
                  <div className="mt-1.5">
                    <StateBadge state={s.state} />
                  </div>
                  {s.state === "BLOCKED" && s.rootBlockers.length > 0 && (
                    <p className="text-xs text-stone-600 mt-1 truncate">
                      via {s.rootBlockers.map((r) => getSkill(r).name).join(", ")}
                    </p>
                  )}
                  {s.isBottleneck && (
                    <p className="text-xs text-amber-500 mt-1">
                      Bottleneck \u00b7 unlocks <span className="font-mono">{s.downstream}</span>
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "progress" && (
          <div>
            <h2 className="text-sm font-semibold text-stone-300 uppercase tracking-wide mb-3">Target Progress</h2>
            <div className="space-y-4">
              <ProgressBar label="Skill Coverage" value={progress.coveragePct} />
              <ProgressBar label="Robust Mastery" value={progress.robustPct} />
              <ProgressBar label="Transfer" value={progress.transferPct} />
              <div className="rounded-lg border border-stone-800 bg-stone-900 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-400">Timed Performance</span>
                  <span className="text-xs text-stone-500 font-mono">Developing</span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Placeholder signal \u2014 connect CONFIG.FEATURE_13_READINESS_ENDPOINT for real timed-assessment data.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <StatChip label="Mastered" value={evaluated.filter((s) => s.state === "MASTERED").length} />
              <StatChip
                label="In progress"
                value={evaluated.filter((s) => s.state === "READY" || s.state === "NEEDS_REVIEW").length}
              />
              <StatChip label="Blocked" value={evaluated.filter((s) => s.state === "BLOCKED").length} />
            </div>
          </div>
        )}

      </div>

      {selectedSkill && (
        <div
          className="fixed inset-0 bg-stone-950 bg-opacity-80 flex items-end sm:items-center justify-center z-50 p-4"
          onClick={() => setSelectedSkillId(null)}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-stone-500">{selectedSkill.domain}</p>
                <h3 className="text-lg font-semibold text-stone-100">{selectedSkill.name}</h3>
              </div>
              <button onClick={() => setSelectedSkillId(null)} className="text-stone-500 hover:text-stone-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-3">
              <StateBadge state={selectedSkill.state} />
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Mastery</span>
                <span className="text-stone-300">{MASTERY_LABEL[evidence[selectedSkill.id].mastery]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Transfer</span>
                <span className="text-stone-300">
                  {evidence[selectedSkill.id].transferGap ? "Gap detected" : "No gap detected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Last practiced</span>
                <span className="text-stone-300">{evidence[selectedSkill.id].lastPracticed}</span>
              </div>
              {selectedSkill.prereqs.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-stone-500 shrink-0">Prerequisites</span>
                  <span className="text-stone-300 text-right">
                    {selectedSkill.prereqs.map((p) => getSkill(p).name).join(", ")}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-stone-800">
              {selectedSkill.state === "BLOCKED" && (
                <p className="text-xs text-stone-400">
                  Locked until {selectedSkill.rootBlockers.map((r) => getSkill(r).name).join(" and ")} reaches
                  Stable mastery. We'll strengthen the foundation first.
                </p>
              )}
              {selectedSkill.state === "MASTERED" && (
                <p className="text-xs text-stone-400">{explainWhyNot(selectedSkill.id, evidence)}</p>
              )}
              {(selectedSkill.state === "READY" || selectedSkill.state === "NEEDS_REVIEW") && (
                <>
                  <p className="text-xs text-stone-400 mb-3">
                    {explainWhy(
                      { ...selectedSkill, activityType: getActivityType(selectedSkill.id, evidence, rootBlockerSet) },
                      ctx
                    )}
                  </p>
                  <button
                    onClick={() => handleComplete(selectedSkill.id)}
                    className="w-full text-xs font-medium px-3 py-2 rounded-md bg-amber-500 text-stone-950 hover:bg-amber-400"
                  >
                    Mark complete
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

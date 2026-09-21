import React, { useState, useEffect, useMemo, useRef } from "react";
import { Check, ChevronDown, ChevronRight, Clock, AlertTriangle, History, Target, CheckCircle2 } from "lucide-react";

// ACEAPT Pathfinder — interactive vertical-slice demo (Feature 22, Sections 55-56).
//
// This mirrors the reasoning in the backend scaffold (gap -> bottleneck ->
// priority -> path, with evidence-driven replanning) as plain client-side
// JS, so the whole loop is inspectable and interactive without a server.
// It is intentionally the same small template set as the backend, not a
// general curriculum planner — see the accompanying README.

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------
const PF_CSS = `
.pf-shell {
  --bg: #0B1220;
  --panel: #121A2E;
  --panel-alt: #17213A;
  --line: #24304C;
  --text: #EEF1F7;
  --text2: #93A0BD;
  --text3: #7783A0;
  --amber: #F2A649;
  --teal: #3FCDBB;
  --slate: #3B4664;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  padding: 28px 24px 36px;
  max-width: 760px;
  margin: 0 auto;
  border-radius: 20px;
  box-sizing: border-box;
}
.pf-shell * { box-sizing: border-box; }
.pf-mono { font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace; }
.pf-eyebrow { font-family: "IBM Plex Mono", monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text3); }

.pf-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 26px; padding-bottom: 20px; border-bottom: 1px solid var(--line); }
.pf-goal-title { font-family: "Space Grotesk", sans-serif; font-size: 25px; font-weight: 600; margin: 6px 0 0; letter-spacing: -0.01em; }
.pf-destination { text-align: right; flex-shrink: 0; }
.pf-destination-value { font-family: "IBM Plex Mono", monospace; font-size: 19px; color: var(--amber); margin-top: 4px; }

.pf-panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px; margin-bottom: 16px; }
.pf-panel-title { font-family: "Space Grotesk", sans-serif; font-size: 15px; font-weight: 600; margin: 0 0 16px; display: flex; align-items: center; gap: 8px; }

.pf-gauge-row { display: flex; align-items: center; gap: 12px; margin-bottom: 13px; }
.pf-gauge-row:last-child { margin-bottom: 0; }
.pf-gauge-label { width: 118px; flex-shrink: 0; font-size: 13px; color: var(--text2); }
.pf-gauge-track { flex: 1; height: 7px; background: rgba(59, 70, 100, 0.35); border-radius: 4px; position: relative; }
.pf-gauge-fill { height: 100%; border-radius: 4px; transition: width 0.7s ease; }
.pf-gauge-target { position: absolute; top: -3.5px; width: 2px; height: 14px; background: var(--text2); border-radius: 1px; }
.pf-gauge-value { width: 42px; text-align: right; font-family: "IBM Plex Mono", monospace; font-size: 13px; flex-shrink: 0; }

.pf-advisory { display: flex; gap: 14px; padding: 18px; border-radius: 14px; background: var(--panel-alt); border-left: 3px solid var(--amber); margin-bottom: 6px; }
.pf-advisory-label { font-family: "Space Grotesk", sans-serif; font-size: 16.5px; font-weight: 600; margin: 2px 0 6px; }
.pf-advisory-reason { font-size: 13.5px; color: var(--text2); line-height: 1.55; }
.pf-deprioritized { font-size: 12.5px; color: var(--text3); margin: 12px 0 18px; line-height: 1.6; }
.pf-deprioritized strong { color: var(--text2); font-weight: 600; }

.pf-chip-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
.pf-chip { font-family: "IBM Plex Mono", monospace; font-size: 12.5px; padding: 7px 13px; border-radius: 20px; border: 1px solid var(--line); background: transparent; color: var(--text2); cursor: pointer; }
.pf-chip.active { background: var(--amber); border-color: var(--amber); color: #1A1206; font-weight: 600; }
.pf-session-row { display: flex; justify-content: space-between; font-size: 13.5px; padding: 7px 0; border-top: 1px dashed var(--line); }
.pf-session-row:first-of-type { border-top: none; }
.pf-session-empty { font-size: 13px; color: var(--text3); }

.pf-node-row { display: flex; gap: 14px; }
.pf-node-marker-col { display: flex; flex-direction: column; align-items: center; width: 16px; flex-shrink: 0; }
.pf-node-dot { width: 13px; height: 13px; border-radius: 4px; border: 2px solid var(--slate); background: var(--bg); flex-shrink: 0; }
.pf-node-connector { width: 2px; flex: 1; background: var(--line); margin-top: 3px; min-height: 20px; }
.pf-node-content { flex: 1; padding-bottom: 20px; min-width: 0; }
.pf-node-title-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.pf-node-title { font-size: 14.5px; font-weight: 600; }
.pf-node-tag { font-family: "IBM Plex Mono", monospace; font-size: 10.5px; letter-spacing: 0.04em; flex-shrink: 0; }
.pf-node-why { font-size: 13px; color: var(--text2); line-height: 1.55; margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
.pf-node-why-btn { background: none; border: none; color: var(--text3); font-size: 12.5px; cursor: pointer; display: flex; align-items: center; gap: 3px; margin-top: 9px; padding: 0; font-family: inherit; }
.pf-complete-btn { background: var(--amber); color: #1A1206; border: none; border-radius: 9px; padding: 8px 16px; font-weight: 600; font-size: 13px; cursor: pointer; margin-top: 11px; }

.pf-toast { background: var(--panel-alt); border: 1px solid var(--teal); border-radius: 12px; padding: 14px 16px; font-size: 13.5px; line-height: 1.5; margin-bottom: 16px; display: flex; gap: 10px; align-items: flex-start; }

.pf-log-title-row { display: flex; align-items: center; gap: 8px; cursor: pointer; margin: 0; width: 100%; background: none; border: none; color: inherit; font: inherit; text-align: left; padding: 0; }
.pf-log-entry { border-top: 1px solid var(--line); padding: 12px 0; font-size: 13px; line-height: 1.5; }
.pf-log-entry:first-child { border-top: none; padding-top: 4px; }
.pf-log-time { color: var(--text3); font-family: "IBM Plex Mono", monospace; font-size: 11px; margin-bottom: 3px; }
.pf-log-empty { font-size: 13px; color: var(--text3); }

@media (max-width: 480px) {
  .pf-shell { padding: 22px 15px 30px; }
  .pf-goal-title { font-size: 20px; }
  .pf-header { flex-direction: column; align-items: flex-start; gap: 10px; }
  .pf-destination { text-align: left; }
  .pf-gauge-label { width: 86px; font-size: 12px; }
}
`;

// ---------------------------------------------------------------------------
// Mock domain data — mirrors backend/demo.ts (Section 56's "ideal demo")
// ---------------------------------------------------------------------------
const GOAL = { title: "Become Placement Ready", days: 30 };
const TARGETS = { mastery: 85, retention: 80, transfer: 75, timed: 75, simulation: 75 };
const METRIC_LABELS = { mastery: "Mastery", retention: "Retention", transfer: "Transfer", timed: "Timed Performance", simulation: "Simulation" };

const SKILLS_INIT = {
  percentage: { name: "Percentage", prereq: [], mastery: 88, transfer: 80, timed: 85 },
  ratio: { name: "Ratio", prereq: ["percentage"], mastery: 80, transfer: 70, timed: 72 },
  profit_loss: { name: "Profit & Loss", prereq: ["ratio"], mastery: 84, transfer: 58, timed: 61 },
  data_interpretation: { name: "Data Interpretation", prereq: ["profit_loss"], mastery: 65, transfer: 50, timed: 48 },
  probability: { name: "Probability", prereq: [], mastery: 85, transfer: 82, timed: 80 },
};

const CAPS_INIT = { mastery: 82, retention: 79, transfer: 58, timed: 61, simulation: 70 };

const COMBOS = [
  { a: "transfer", b: "timed", label: "Transfer under time pressure" },
  { a: "timed", b: "simulation", label: "Timed execution under full simulation conditions" },
  { a: "mastery", b: "retention", label: "Retention of otherwise-mastered material" },
];

const COMPLETION_STATE = {
  PRACTICE: "MASTERED",
  TRANSFER_DRILL: "TRANSFER_VERIFIED",
  TIMED_DRILL: "READY",
  MIXED_PRACTICE: "READY",
  SIMULATION: "READY",
  VERIFICATION: "READY",
  MAINTENANCE_CHECK: "MAINTENANCE",
};

const STATE_LABELS = {
  MASTERED: "Mastered",
  TRANSFER_VERIFIED: "Transfer verified",
  READY: "Ready",
  MAINTENANCE: "Maintenance",
};

let uidCounter = 0;
const nextId = () => `n${++uidCounter}`;

// ---------------------------------------------------------------------------
// Engine logic (mirrors backend/engines/*.ts, simplified for the browser)
// ---------------------------------------------------------------------------
function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

function computeGaps(caps) {
  return Object.keys(TARGETS).map((metric) => {
    const current = caps[metric];
    const target = TARGETS[metric];
    const delta = current - target;
    const status = Math.abs(delta) <= 2 ? "AT_TARGET" : delta > 0 ? "ABOVE_TARGET" : "GAP";
    return { metric, current, target, delta, status };
  });
}

function derivePrimaryBottleneck(gaps) {
  const ranked = gaps.filter((g) => g.status === "GAP").sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (ranked.length === 0) {
    return { label: "No active gap — maintenance mode", reason: "Every tracked capability is at or above target for this goal." };
  }
  const top = ranked[0];
  const second = ranked[1];
  const combo = second && COMBOS.find((c) => (c.a === top.metric && c.b === second.metric) || (c.a === second.metric && c.b === top.metric));
  if (combo) {
    return {
      label: combo.label,
      reason: `Your ${METRIC_LABELS[top.metric].toLowerCase()} is ${Math.abs(top.delta)} points below target (${top.current} vs ${top.target}), and ${METRIC_LABELS[second.metric].toLowerCase()} is a compounding factor — the two together limit real performance more than either alone.`,
    };
  }
  return {
    label: `${METRIC_LABELS[top.metric]} is your current limiting factor`,
    reason: `${METRIC_LABELS[top.metric]} is ${Math.abs(top.delta)} points below target and carries the largest gap right now.`,
  };
}

function downstreamOf(skillId, skills) {
  const direct = Object.keys(skills).filter((id) => skills[id].prereq.includes(skillId));
  const transitive = direct.flatMap((id) => downstreamOf(id, skills));
  return Array.from(new Set([...direct, ...transitive]));
}

function severityOf(skill) {
  const avg = (skill.mastery + skill.transfer + skill.timed) / 3;
  return clamp((75 - avg) / 75, 0, 1);
}

// Section 13: severity gates prerequisite impact, so an almost-fine skill
// can't outrank a genuinely weak one just because it sits upstream of others.
function pickTopSkill(skills) {
  const ids = Object.keys(skills);
  const scored = ids
    .map((id) => {
      const skill = skills[id];
      const severity = severityOf(skill);
      const downstream = downstreamOf(id, skills);
      const prereqImpact = Math.min(1, downstream.length / Math.max(1, ids.length - 1));
      const goalRelevance = 0.5;
      const impactIfWeak = prereqImpact * 0.6 + goalRelevance * 0.4;
      const improvementPotential = severity > 0 ? Math.min(1, severity + prereqImpact * 0.3) : 0;
      const score = severity * impactIfWeak + improvementPotential * 0.15;
      return { id, skill, severity, score };
    })
    .filter((s) => s.severity > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function buildPathForSkill(top) {
  if (!top) {
    return [{ id: nextId(), skillId: null, actionType: "MAINTENANCE_CHECK", label: "Maintenance Check", reason: "Nothing is below target right now — a light periodic check keeps it that way.", minutes: 5, state: "NOT_STARTED" }];
  }
  const { id: skillId, skill } = top;
  const nodes = [];

  if (skill.mastery < 75) {
    nodes.push({ id: nextId(), skillId, actionType: "PRACTICE", label: `${skill.name} — Focused Practice`, reason: `Mastery itself is still below target (${skill.mastery}%), so foundational practice comes before transfer or timed drills would help.`, minutes: 10, state: "NOT_STARTED" });
  }
  if (skill.mastery >= 80 && skill.transfer < 70) {
    nodes.push({ id: nextId(), skillId, actionType: "TRANSFER_DRILL", label: `${skill.name} — Transfer Repair`, reason: `${skill.name} accuracy is strong in familiar practice but drops in novel-context questions — transfer needs direct repair before harder drills will stick.`, minutes: 10, state: "NOT_STARTED" });
  }
  const untimedRef = skill.transfer ?? skill.mastery;
  if (untimedRef >= 80 && skill.timed < 70) {
    nodes.push({ id: nextId(), skillId, actionType: "TIMED_DRILL", label: `${skill.name} — Timed Application`, reason: "Untimed performance is ahead of timed performance, so the gap is speed under pressure, not understanding.", minutes: 8, state: "NOT_STARTED" });
  }
  nodes.push({ id: nextId(), skillId, actionType: "MIXED_PRACTICE", label: `${skill.name} — Mixed Questions`, reason: "Interleaving this skill with others checks that the gains above generalize, instead of only showing up in isolated drills.", minutes: 8, state: "NOT_STARTED" });
  nodes.push({ id: nextId(), skillId, actionType: "SIMULATION", label: `${skill.name} — Simulation`, reason: "A short simulated set under real conditions is the closest proxy for assessment-day performance.", minutes: 15, state: "NOT_STARTED" });
  nodes.push({ id: nextId(), skillId, actionType: "VERIFICATION", label: `${skill.name} — Readiness Verification`, reason: "Confirms the gains above are stable before moving on to the next priority.", minutes: 5, state: "NOT_STARTED" });
  return nodes;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function AceaptPathfinderDemo() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, []);

  const [caps, setCaps] = useState(CAPS_INIT);
  const [skills, setSkills] = useState(SKILLS_INIT);
  const [path, setPath] = useState(() => buildPathForSkill(pickTopSkill(SKILLS_INIT)));
  const [version, setVersion] = useState(1);
  const [decisions, setDecisions] = useState([]);
  const [availableTime, setAvailableTime] = useState(20);
  const [openWhy, setOpenWhy] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const gaps = useMemo(() => computeGaps(caps), [caps]);
  const bottleneck = useMemo(() => derivePrimaryBottleneck(gaps), [gaps]);
  const currentNode = path.find((n) => n.state === "NOT_STARTED") || null;

  useEffect(() => {
    if (!toast) return undefined;
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(toastTimer.current);
  }, [toast]);

  const deprioritized = useMemo(
    () =>
      Object.entries(skills)
        .filter(([id]) => id !== currentNode?.skillId)
        .map(([id, s]) => ({ id, ...s, severity: severityOf(s) }))
        .sort((a, b) => a.severity - b.severity)
        .slice(0, 2),
    [skills, currentNode]
  );

  const remainingNodes = path.filter((n) => n.state === "NOT_STARTED");
  const microSession = useMemo(() => {
    let budget = availableTime;
    const out = [];
    for (const n of remainingNodes) {
      if (budget <= 0) break;
      const take = Math.min(n.minutes, budget);
      out.push({ ...n, allocated: take, trimmed: take < n.minutes });
      budget -= take;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, availableTime]);

  function handleComplete(node) {
    if (!node) return;

    const BUMP = 14; // matches the spec's own "58 -> 72" style jump
    const nextCaps = { ...caps };
    const nextSkills = JSON.parse(JSON.stringify(skills));

    const applyBump = (metric) => {
      nextCaps[metric] = clamp(nextCaps[metric] + BUMP);
      if (node.skillId && nextSkills[node.skillId] && metric in nextSkills[node.skillId]) {
        nextSkills[node.skillId][metric] = clamp(nextSkills[node.skillId][metric] + BUMP);
      }
    };

    if (node.actionType === "PRACTICE") applyBump("mastery");
    if (node.actionType === "TRANSFER_DRILL") applyBump("transfer");
    if (node.actionType === "TIMED_DRILL") applyBump("timed");
    if (node.actionType === "MIXED_PRACTICE") applyBump("transfer");
    if (node.actionType === "SIMULATION") nextCaps.simulation = clamp(nextCaps.simulation + BUMP);

    const updatedPath = path.map((n) => (n.id === node.id ? { ...n, state: COMPLETION_STATE[n.actionType] || "MASTERED" } : n));

    const newGaps = computeGaps(nextCaps);
    const newBottleneck = derivePrimaryBottleneck(newGaps);
    const changed = newBottleneck.label !== bottleneck.label;
    const remaining = updatedPath.filter((n) => n.state === "NOT_STARTED");

    let finalPath = updatedPath;
    let reasonText = null;

    if (changed || remaining.length === 0) {
      const top = pickTopSkill(nextSkills);
      const completed = updatedPath.filter((n) => n.state !== "NOT_STARTED");
      const doneTypesForSkill = new Set(completed.filter((n) => n.skillId === top?.id).map((n) => n.actionType));
      let freshRemainder = buildPathForSkill(top).filter((n) => !doneTypesForSkill.has(n.actionType));

      if (top && freshRemainder.length === 0) {
        freshRemainder = [
          { id: nextId(), skillId: top.id, actionType: "MIXED_PRACTICE", label: `${top.skill.name} — Extra Practice`, reason: "Still below target overall — another round before the next check.", minutes: 8, state: "NOT_STARTED" },
        ];
      }

      finalPath = [...completed, ...freshRemainder];
      setVersion((v) => v + 1);

      reasonText = changed
        ? `Completing "${node.label}" shifted the numbers — "${newBottleneck.label}" is now the bigger gap, so the path has been updated.`
        : `That priority needed one more pass — added another step before moving on.`;

      setDecisions((d) => [{ id: nextId(), reason: reasonText, evidence: `${node.label} completed`, confidence: 0.8, time: new Date() }, ...d]);
    }

    const nextUp = finalPath.find((n) => n.state === "NOT_STARTED");
    setCaps(nextCaps);
    setSkills(nextSkills);
    setPath(finalPath);
    setOpenWhy(false);
    setToast(reasonText || `Nice work — ${node.label} is complete.${nextUp ? ` Next: ${nextUp.label}.` : ""}`);
  }

  return (
    <div className="pf-shell">
      <style>{PF_CSS}</style>

      <div className="pf-header">
        <div>
          <div className="pf-eyebrow">Goal</div>
          <h1 className="pf-goal-title">{GOAL.title}</h1>
        </div>
        <div className="pf-destination">
          <div className="pf-eyebrow">Target</div>
          <div className="pf-destination-value pf-mono">T-{GOAL.days}D</div>
        </div>
      </div>

      <div className="pf-panel">
        <div className="pf-panel-title">
          <Target size={15} color="var(--amber)" /> Where you are
        </div>
        {gaps.map((g) => (
          <div className="pf-gauge-row" key={g.metric}>
            <div className="pf-gauge-label">{METRIC_LABELS[g.metric]}</div>
            <div className="pf-gauge-track">
              <div className="pf-gauge-fill" style={{ width: `${g.current}%`, background: g.status === "GAP" ? "var(--amber)" : "var(--teal)" }} />
              <div className="pf-gauge-target" style={{ left: `${g.target}%` }} />
            </div>
            <div className="pf-gauge-value pf-mono">{g.current}%</div>
          </div>
        ))}
      </div>

      <div className="pf-advisory">
        <AlertTriangle size={19} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div className="pf-eyebrow">Biggest bottleneck</div>
          <div className="pf-advisory-label">{bottleneck.label}</div>
          <div className="pf-advisory-reason">{bottleneck.reason}</div>
        </div>
      </div>

      {deprioritized.length > 0 && (
        <div className="pf-deprioritized">
          Not prioritized right now:{" "}
          {deprioritized.map((s, i) => (
            <span key={s.id}>
              <strong>{s.name}</strong>
              {i < deprioritized.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          — already stable, so time spent there wouldn't move the goal much.
        </div>
      )}

      <div className="pf-panel">
        <div className="pf-panel-title">
          <Clock size={15} color="var(--amber)" /> How much time do you have?
        </div>
        <div className="pf-chip-row">
          {[5, 10, 20, 30, 60].map((m) => (
            <button key={m} className={`pf-chip${availableTime === m ? " active" : ""}`} onClick={() => setAvailableTime(m)}>
              {m} min
            </button>
          ))}
        </div>
        {microSession.length === 0 ? (
          <div className="pf-session-empty">Not enough time for a meaningful step here — try 10 minutes or more.</div>
        ) : (
          microSession.map((n) => (
            <div className="pf-session-row" key={n.id}>
              <span>
                {n.label}
                {n.trimmed ? " (trimmed to fit)" : ""}
              </span>
              <span className="pf-mono" style={{ color: "var(--text3)" }}>
                {n.allocated} min
              </span>
            </div>
          ))
        )}
      </div>

      <div className="pf-panel">
        <div className="pf-panel-title">
          Your path <span className="pf-mono" style={{ color: "var(--text3)", fontWeight: 400, fontSize: 12 }}>v{version}</span>
        </div>
        {path.map((n, i) => {
          const isCurrent = n.id === currentNode?.id;
          const isDone = n.state !== "NOT_STARTED";
          const dotColor = isDone ? "var(--teal)" : isCurrent ? "var(--amber)" : "var(--slate)";
          const titleColor = isCurrent ? "var(--text)" : isDone ? "var(--text2)" : "var(--text3)";
          return (
            <div className="pf-node-row" key={n.id}>
              <div className="pf-node-marker-col">
                <div className="pf-node-dot" style={{ borderColor: dotColor, background: isDone ? dotColor : "var(--bg)" }} />
                {i < path.length - 1 && <div className="pf-node-connector" style={{ background: isDone ? "var(--teal)" : "var(--line)" }} />}
              </div>
              <div className="pf-node-content">
                <div className="pf-node-title-row">
                  <div className="pf-node-title" style={{ color: titleColor }}>
                    {n.label}
                  </div>
                  <span className="pf-node-tag pf-mono" style={{ color: dotColor }}>
                    {isDone ? STATE_LABELS[n.state] : isCurrent ? "ACTIVE" : `${n.minutes}m`}
                  </span>
                </div>
                {isCurrent && (
                  <>
                    <button className="pf-node-why-btn" onClick={() => setOpenWhy(!openWhy)}>
                      {openWhy ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Why this?
                    </button>
                    {openWhy && <div className="pf-node-why">{n.reason}</div>}
                    <div>
                      <button className="pf-complete-btn" onClick={() => handleComplete(n)}>
                        Mark complete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div className="pf-toast">
          <CheckCircle2 size={16} color="var(--teal)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>{toast}</div>
        </div>
      )}

      <div className="pf-panel">
        <button className="pf-panel-title pf-log-title-row" onClick={() => setLogOpen(!logOpen)}>
          <History size={15} color="var(--amber)" /> Why did my plan change?
          <span style={{ marginLeft: "auto", color: "var(--text3)" }}>{logOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        </button>
        {logOpen &&
          (decisions.length === 0 ? (
            <div className="pf-log-empty">No changes yet — complete a step above to see the path adapt to new evidence.</div>
          ) : (
            decisions.map((d) => (
              <div className="pf-log-entry" key={d.id}>
                <div className="pf-log-time">
                  {d.time.toLocaleTimeString()} · evidence: {d.evidence} · confidence {Math.round(d.confidence * 100)}%
                </div>
                <div>{d.reason}</div>
              </div>
            ))
          ))}
      </div>
    </div>
  );
}

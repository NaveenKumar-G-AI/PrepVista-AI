import React, { useState, useMemo, useEffect, useRef } from "react";
import { Lock, CircleDot, CircleCheck, CircleHelp, ChevronRight, Flame, Clock3, ListTree } from "lucide-react";

/* ---------------------------------------------------------------------
   REAL DATA. Every number below was copied from demo-output/*.json,
   produced by actually running `npm run demo` against a live HTTP
   server in src/scripts/demoRun.ts — not invented for this artifact.
   ------------------------------------------------------------------- */

const C = {
  ink: "#0F1420",
  panel: "#161D2E",
  panel2: "#1C2438",
  wire: "#2B3550",
  wireLit: "#3D4A6E",
  paper: "#EAE7DE",
  muted: "#8B93A8",
  mutedDim: "#5B637A",
  amber: "#E8A33D",
  amberDim: "#4A3B22",
  jade: "#4FA381",
  jadeDim: "#1E362D",
  rose: "#D6685D",
  roseDim: "#3A2229",
};

const STATUS_META = {
  UNKNOWN: { label: "Assess", color: C.amber, dim: C.amberDim, Icon: CircleHelp },
  GAP: { label: "Gap", color: C.amber, dim: C.amberDim, Icon: CircleDot },
  CRITICAL_GAP: { label: "Critical gap", color: C.rose, dim: C.roseDim, Icon: Flame },
  BLOCKED: { label: "Blocked", color: C.mutedDim, dim: "transparent", Icon: Lock },
  COMPLETE: { label: "Complete", color: C.jade, dim: C.jadeDim, Icon: CircleCheck },
};

const CHAIN_TEMPLATE = [
  { key: "queues", name: "Queues" },
  { key: "bfs", name: "Breadth-First Search" },
  { key: "graphTraversal", name: "Graph Traversal" },
  { key: "graphs", name: "Graphs" },
];

const v1Chain = {
  queues: { status: "UNKNOWN", priority: 0.575, current: null, target: "COMPETENT", activity: "Exploration", objective: "Assess current ability in Queues — no prior evidence exists yet, so this is exploration, not remediation.", breakdown: { role: 0.125, gap: 0.15, block: 0.2, required: 0.1, urgency: 0, trend: 0 } },
  bfs: { status: "BLOCKED", priority: 0.358, current: null, target: "COMPETENT", activity: "On hold", objective: "Hold on Breadth-First Search until its prerequisite is solid — attempting it now would mostly surface prerequisite gaps, not Breadth-First Search itself.", insertedReason: "Inserted as a prerequisite of Graph Traversal.", breakdown: { role: 0.125, gap: 0, block: 0.133, required: 0.1, urgency: 0, trend: 0 } },
  graphTraversal: { status: "BLOCKED", priority: 0.292, current: null, target: "COMPETENT", activity: "On hold", objective: "Hold on Graph Traversal until its prerequisite is solid.", insertedReason: "Inserted as a prerequisite of Graphs.", breakdown: { role: 0.125, gap: 0, block: 0.067, required: 0.1, urgency: 0, trend: 0 } },
  graphs: { status: "BLOCKED", priority: 0.288, current: null, target: "COMPETENT", activity: "On hold", objective: "Hold on Graphs until its prerequisite is solid — attempting it now would mostly surface prerequisite gaps, not Graphs itself.", breakdown: { role: 0.188, gap: 0, block: 0, required: 0.1, urgency: 0, trend: 0 } },
};

const v4Chain = {
  queues: null, // COMPLETE -> dropped out of the active roadmap entirely
  bfs: { status: "UNKNOWN", priority: 0.575, current: null, target: "COMPETENT", activity: "Exploration", objective: "Assess current ability in Breadth-First Search — no prior evidence exists yet, so this is exploration, not remediation.", insertedReason: "Inserted as a prerequisite of Graph Traversal.", breakdown: { role: 0.125, gap: 0.15, block: 0.2, required: 0.1, urgency: 0, trend: 0 } },
  graphTraversal: { status: "BLOCKED", priority: 0.325, current: null, target: "COMPETENT", activity: "On hold", objective: "Hold on Graph Traversal until its prerequisite is solid — it waits on BFS specifically, not on Queues.", insertedReason: "Inserted as a prerequisite of Graphs.", breakdown: { role: 0.125, gap: 0, block: 0.1, required: 0.1, urgency: 0, trend: 0 } },
  graphs: { status: "BLOCKED", priority: 0.288, current: null, target: "COMPETENT", activity: "On hold", objective: "Hold on Graphs until its prerequisite is solid.", breakdown: { role: 0.188, gap: 0, block: 0, required: 0.1, urgency: 0, trend: 0 } },
};

const VERSIONS = [
  { id: "v1", trigger: "INITIAL", readiness: "FOUNDATION_BUILDING", score: 0.201, reason: "Initial roadmap generated from role blueprint and current evidence.", chain: v1Chain, milestoneCount: 6, debugging: { status: "GAP", priority: 0.56 } },
  { id: "v2", trigger: "EVIDENCE_UPDATE", readiness: "FOUNDATION_BUILDING", score: 0.222, reason: "1 skill(s) reached target.", note: "Debugging: DEVELOPING → COMPETENT (1 more independent success) — drops off the roadmap.", chain: v1Chain, milestoneCount: 6, debugging: null },
  { id: "v3", trigger: "EVIDENCE_UPDATE", readiness: "FOUNDATION_BUILDING", score: 0.222, reason: "1 skill(s) regressed.", note: "Queues: UNKNOWN → CRITICAL_GAP (1 independent FAIL was enough).", chain: { ...v1Chain, queues: { status: "CRITICAL_GAP", priority: 0.725, current: "NOVICE", target: "COMPETENT", activity: "Targeted practice", objective: "Close a significant gap in Queues: current evidence is well below the COMPETENT level this path requires.", breakdown: { role: 0.125, gap: 0.3, block: 0.2, required: 0.1, urgency: 0, trend: 0 } } }, milestoneCount: 6, debugging: null },
  { id: "v4", trigger: "EVIDENCE_UPDATE", readiness: "FOUNDATION_BUILDING", score: 0.247, reason: "1 skill(s) reached target.", note: "Queues: CRITICAL_GAP → COMPLETE (3 independent successes + 1 verified pass). BFS unblocks. Graph Traversal stays blocked — it waits on BFS specifically.", chain: v4Chain, milestoneCount: 5, debugging: null },
];

const OTHER_ITEMS_BASE = [
  { name: "Recursion", status: "GAP", priority: 0.564 },
  { name: "Problem Solving", status: "UNKNOWN", priority: 0.5 },
  { name: "Strings", status: "UNKNOWN", priority: 0.438 },
  { name: "Searching", status: "GAP", priority: 0.435 },
  { name: "Sorting", status: "GAP", priority: 0.435 },
];

const DAILY_PLAN = [
  { minutes: 33, label: "Practice: Recursion" },
  { minutes: 16, label: "Transfer challenge: Breadth-First Search" },
  { minutes: 11, label: "Verification challenge: Recursion" },
];

const EVENTS = [
  { type: "ROADMAP_CREATED", detail: "v1 · 6 milestones" },
  { type: "ROADMAP_RECALCULATED", detail: "v2 · EVIDENCE_UPDATE" },
  { type: "SKILL_COMPLETED", detail: "Debugging" },
  { type: "ROADMAP_RECALCULATED", detail: "v3 · EVIDENCE_UPDATE" },
  { type: "ROADMAP_RECALCULATED", detail: "v4 · EVIDENCE_UPDATE" },
  { type: "SKILL_COMPLETED", detail: "Queues" },
];

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');`;

function fmtPct(n) {
  return `${Math.round(n * 100)}%`;
}

function BreakdownBars({ breakdown }) {
  const rows = [
    ["Role importance", breakdown.role],
    ["Gap severity", breakdown.gap],
    ["Blocks downstream skills", breakdown.block],
    ["Required skill", breakdown.required],
    ["Deadline urgency", breakdown.urgency],
    ["Declining trend", breakdown.trend],
  ];
  const max = 0.3; // gap's weight ceiling — the largest any single term can contribute
  return (
    <div className="flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center gap-3">
          <div style={{ color: C.muted, fontFamily: "IBM Plex Sans", width: "9.5rem", flexShrink: 0 }} className="text-xs">
            {label}
          </div>
          <div style={{ background: C.panel2, height: 6, borderRadius: 3, flex: 1, overflow: "hidden" }}>
            <div
              style={{
                width: `${Math.min(100, (value / max) * 100)}%`,
                background: value > 0 ? C.amber : C.wire,
                height: "100%",
                borderRadius: 3,
                transition: "width 500ms cubic-bezier(.4,0,.2,1)",
              }}
            />
          </div>
          <div style={{ color: C.paper, fontFamily: "IBM Plex Mono", width: "2.6rem", textAlign: "right" }} className="text-xs">
            {value.toFixed(3)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChainNode({ item, name, selected, onSelect, changed }) {
  const isEmpty = !item;
  const meta = isEmpty ? STATUS_META.COMPLETE : STATUS_META[item.status];
  const Icon = meta.Icon;
  return (
    <button
      onClick={onSelect}
      style={{
        background: selected ? meta.dim : C.panel,
        border: `1.5px solid ${selected ? meta.color : C.wire}`,
        borderRadius: 10,
        padding: "12px 14px",
        minWidth: 168,
        textAlign: "left",
        cursor: isEmpty ? "default" : "pointer",
        transition: "border-color 400ms, background-color 400ms, transform 300ms",
        transform: changed ? "scale(1.04)" : "scale(1)",
        boxShadow: changed ? `0 0 0 3px ${meta.color}55` : "none",
        flexShrink: 0,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, letterSpacing: 0.5, color: meta.color }}>
          {isEmpty ? "COMPLETE" : meta.label.toUpperCase()}
        </span>
        <Icon size={14} color={meta.color} strokeWidth={2.25} />
      </div>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: C.paper, fontSize: 14.5 }}>{name}</div>
      {!isEmpty && (
        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: C.muted, marginTop: 4 }}>
          priority {item.priority.toFixed(3)}
        </div>
      )}
      {isEmpty && (
        <div style={{ fontFamily: "IBM Plex Sans", fontSize: 11, color: C.jade, marginTop: 4 }}>
          reached target — off the active roadmap
        </div>
      )}
    </button>
  );
}

export default function RoadmapDashboard() {
  const [vIndex, setVIndex] = useState(0);
  const [selectedKey, setSelectedKey] = useState("queues");
  const [changedKeys, setChangedKeys] = useState(new Set());
  const prevChain = useRef(v1Chain);

  const version = VERSIONS[vIndex];

  useEffect(() => {
    const changed = new Set();
    for (const { key } of CHAIN_TEMPLATE) {
      const before = prevChain.current[key];
      const after = version.chain[key];
      const beforeStatus = before ? before.status : "COMPLETE";
      const afterStatus = after ? after.status : "COMPLETE";
      if (beforeStatus !== afterStatus) changed.add(key);
    }
    setChangedKeys(changed);
    prevChain.current = version.chain;
    if (changed.size > 0) {
      const preferActive = [...changed].find((k) => version.chain[k]);
      setSelectedKey(preferActive ?? [...changed][0]);
    }
    const t = setTimeout(() => setChangedKeys(new Set()), 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vIndex]);

  const selectedItem = useMemo(() => {
    const found = CHAIN_TEMPLATE.find((c) => c.key === selectedKey);
    if (!found) return null;
    const chainValue = version.chain[selectedKey];
    if (!chainValue) return { name: found.name, complete: true };
    return { name: found.name, complete: false, ...chainValue };
  }, [selectedKey, version]);

  const otherItems = vIndex === 0 ? [{ name: "Debugging", status: "GAP", priority: 0.56 }, ...OTHER_ITEMS_BASE] : OTHER_ITEMS_BASE;

  return (
    <div style={{ background: C.ink, minHeight: "100%", fontFamily: "IBM Plex Sans" }} className="w-full rounded-xl overflow-hidden">
      <style>{`
        ${FONT_IMPORT}
        .cf-scrollbar::-webkit-scrollbar { height: 6px; }
        .cf-scrollbar::-webkit-scrollbar-thumb { background: ${C.wire}; border-radius: 3px; }
        @media (prefers-reduced-motion: reduce) {
          * { transition-duration: 1ms !important; animation-duration: 1ms !important; }
        }
        .cf-focus:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
      `}</style>

      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4" style={{ borderBottom: `1px solid ${C.wire}` }}>
        <div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: C.muted, letterSpacing: 1 }}>CODEFORGE ▸ MY JOURNEY</div>
          <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, color: C.paper, fontSize: 22 }}>Software Engineer track</div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <div>
            <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted }}>READINESS</div>
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 600, color: C.amber, fontSize: 14 }}>
              {version.readiness.replace("_", " ")} <span style={{ color: C.muted, fontWeight: 400 }}>({fmtPct(version.score)})</span>
            </div>
          </div>
        </div>
      </div>

      {/* version scrubber */}
      <div className="px-5 pt-4">
        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 8 }}>
          ROADMAP VERSIONS — click any commit to inspect that state
        </div>
        <div className="flex items-stretch gap-2 overflow-x-auto cf-scrollbar pb-2">
          {VERSIONS.map((v, i) => (
            <button
              key={v.id}
              onClick={() => setVIndex(i)}
              className="cf-focus"
              style={{
                background: i === vIndex ? C.panel2 : "transparent",
                border: `1px solid ${i === vIndex ? C.amber : C.wire}`,
                borderRadius: 8,
                padding: "8px 12px",
                minWidth: 190,
                flexShrink: 0,
                textAlign: "left",
                cursor: "pointer",
                transition: "border-color 250ms, background-color 250ms",
              }}
            >
              <div className="flex items-center gap-2">
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, fontWeight: 500, color: i === vIndex ? C.amber : C.paper }}>{v.id}</span>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 9, color: C.muted }}>{v.trigger}</span>
              </div>
              <div style={{ fontFamily: "IBM Plex Sans", fontSize: 11.5, color: C.muted, marginTop: 3, lineHeight: 1.3 }}>{v.reason}</div>
            </button>
          ))}
        </div>
        {version.note && (
          <div style={{ fontFamily: "IBM Plex Sans", fontSize: 12.5, color: C.paper, background: C.panel, border: `1px solid ${C.wire}`, borderRadius: 8, padding: "8px 12px", marginTop: 8 }}>
            <span style={{ color: C.amber, fontFamily: "IBM Plex Mono", fontSize: 10, marginRight: 6 }}>DIFF</span>
            {version.note}
          </div>
        )}
      </div>

      {/* the chain — signature element */}
      <div className="px-5 pt-5">
        <div className="flex items-center gap-2 mb-3">
          <ListTree size={14} color={C.muted} />
          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5 }}>
            THE DEPENDENCY CHAIN — Queues → BFS → Graph Traversal → Graphs
          </span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto cf-scrollbar pb-3">
          {CHAIN_TEMPLATE.map(({ key, name }, i) => (
            <React.Fragment key={key}>
              <ChainNode
                item={version.chain[key]}
                name={name}
                selected={selectedKey === key && version.chain[key]}
                onSelect={() => setSelectedKey(key)}
                changed={changedKeys.has(key)}
              />
              {i < CHAIN_TEMPLATE.length - 1 && (
                <ChevronRight size={16} color={C.wireLit} style={{ flexShrink: 0 }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* today's plan + why this */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 pt-4">
        <div style={{ background: C.panel, border: `1px solid ${C.wire}`, borderRadius: 10, padding: 16 }}>
          <div className="flex items-center gap-2 mb-3">
            <Clock3 size={14} color={C.muted} />
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5 }}>TODAY'S PLAN — 60 MIN, COMPUTED</span>
          </div>
          <div className="flex flex-col gap-2.5">
            {DAILY_PLAN.map((b) => (
              <div key={b.label} className="flex items-center gap-3">
                <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: C.amber, width: 42, flexShrink: 0 }}>{b.minutes}m</div>
                <div style={{ fontFamily: "IBM Plex Sans", fontSize: 13, color: C.paper }}>{b.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.wire}`, borderRadius: 10, padding: 16, minHeight: 170 }}>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 10 }}>
            WHY THIS? — {selectedItem ? selectedItem.name.toUpperCase() : "SELECT A NODE"}
          </div>
          {selectedItem ? (
            selectedItem.complete ? (
              <p style={{ fontFamily: "IBM Plex Sans", fontSize: 12.5, color: C.jade, lineHeight: 1.5 }}>
                {selectedItem.name} reached target mastery and needs no action right now — it's off the active roadmap.
              </p>
            ) : (
              <>
                <p style={{ fontFamily: "IBM Plex Sans", fontSize: 12.5, color: C.paper, lineHeight: 1.5, marginBottom: 10 }}>
                  {selectedItem.objective}
                  {selectedItem.insertedReason ? ` ${selectedItem.insertedReason}` : ""}
                </p>
                <BreakdownBars breakdown={selectedItem.breakdown} />
              </>
            )
          ) : (
            <p style={{ fontFamily: "IBM Plex Sans", fontSize: 12.5, color: C.muted }}>Select a node in the chain above.</p>
          )}
        </div>
      </div>

      {/* other active items */}
      <div className="px-5 pt-4">
        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 8 }}>
          ALSO ON YOUR PLATE — MILESTONE 1
        </div>
        <div className="flex flex-wrap gap-2">
          {otherItems.map((it) => {
            const meta = STATUS_META[it.status];
            return (
              <div
                key={it.name}
                style={{ background: meta.dim, border: `1px solid ${meta.color}55`, borderRadius: 999, padding: "5px 11px" }}
                className="flex items-center gap-1.5"
              >
                <meta.Icon size={11} color={meta.color} />
                <span style={{ fontFamily: "IBM Plex Sans", fontSize: 11.5, color: C.paper }}>{it.name}</span>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted }}>{it.priority.toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* event log */}
      <div className="px-5 pt-4 pb-5">
        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 10, color: C.muted, letterSpacing: 0.5, marginBottom: 8 }}>AUDIT LOG</div>
        <div style={{ background: C.panel, border: `1px solid ${C.wire}`, borderRadius: 10, padding: "10px 14px" }} className="flex flex-col gap-1.5">
          {EVENTS.map((e, i) => (
            <div key={i} className="flex items-center gap-2.5" style={{ fontFamily: "IBM Plex Mono", fontSize: 11 }}>
              <span style={{ color: C.wireLit }}>{String(i + 1).padStart(2, "0")}</span>
              <span style={{ color: e.type === "SKILL_COMPLETED" ? C.jade : C.amber, minWidth: 168 }}>{e.type}</span>
              <span style={{ color: C.muted }}>{e.detail}</span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: "IBM Plex Sans", fontSize: 10.5, color: C.mutedDim, marginTop: 10 }}>
          Every value on this page is copied from a real API response captured by running the engine end-to-end — see demo-output/*.json in the delivered project.
        </p>
      </div>
    </div>
  );
}

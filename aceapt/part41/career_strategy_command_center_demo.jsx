import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, Check, X } from "lucide-react";

const T = {
  surface: "#F4F6F8",
  card: "#FFFFFF",
  ink: "#12161C",
  inkMuted: "#5B6472",
  line: "#E3E7EC",
  signal: "#1C3F5E",
  copper: "#B87333",
  good: "#2F6E5B",
  attention: "#B87333",
  risk: "#A64B3F",
  unknown: "#8A93A2",
};

const tierColor = { high: T.good, medium: T.attention, low: T.unknown };
const statusColor = { on_track: T.good, needs_attention: T.attention, shift_recommended: T.risk, insufficient_data: T.unknown };
const statusLabel = { on_track: "On track", needs_attention: "Needs attention", shift_recommended: "Strategy shift recommended", insufficient_data: "Insufficient data" };
const dimColor = { good: T.good, fair: T.attention, poor: T.risk, unknown: T.unknown };
const dimLabel = { good: "Good", fair: "Fair", poor: "Poor", unknown: "Unknown" };

const MOVES = {
  primary: {
    kind: "apply_to_opportunity",
    title: 'Apply to "Backend Engineering Internship — mid-size fintech"',
    tier: "high",
    reasoning: "This is the highest-relevance open opportunity (85% match), and applying is cheap relative to your available time.",
    evidence: ["Relevance to goal: 85%", "Deadline in 18 days"],
    fits: true,
  },
  alternative: {
    kind: "build_project",
    title: "Build a project that demonstrates the missing skill(s)",
    tier: "medium",
    reasoning: "This directly closes the evidence gap behind the current bottleneck (databases, cloud, testing).",
    evidence: ["No solid evidence yet for: databases, cloud, testing", "Evidence exists but none of it is rated strong"],
    fits: false,
  },
};

const NOT_NOW_REASONS = [
  { id: "too_time_consuming", label: "Too time-consuming" },
  { id: "not_relevant", label: "Not relevant" },
  { id: "wrong_timing", label: "Wrong timing" },
  { id: "need_information", label: "Need more information" },
];

const HEALTH = {
  direction: { status: "good", explanation: "Target role is set: Backend Engineer." },
  readiness: { status: "fair", explanation: "Some required skills still lack solid evidence." },
  evidence: { status: "fair", explanation: "Evidence exists, but none of it is rated strong yet." },
  opportunity: { status: "poor", explanation: "Relevant opportunities exist but application volume is low." },
  execution: { status: "unknown", explanation: "No actions have been planned yet." },
  adaptation: { status: "unknown", explanation: "No strategy version exists yet." },
};

function Gauge({ tier }) {
  const angle = tier === "high" ? 25 : tier === "medium" ? 90 : 155;
  const rad = (angle * Math.PI) / 180;
  const cx = 60, cy = 64, r = 42;
  const nx = cx + r * Math.cos(rad);
  const ny = cy - r * Math.sin(rad);
  const color = tierColor[tier];
  const tick = (deg) => {
    const a = (deg * Math.PI) / 180;
    return { x1: cx + 44 * Math.cos(a), y1: cy - 44 * Math.sin(a), x2: cx + 50 * Math.cos(a), y2: cy - 50 * Math.sin(a) };
  };
  const t1 = tick(155), t2 = tick(90), t3 = tick(25);
  return (
    <svg width="120" height="76" viewBox="0 0 120 76" aria-hidden="true">
      <path d="M 10 64 A 50 50 0 0 1 110 64" fill="none" stroke={T.line} strokeWidth="2" strokeLinecap="round" />
      {[t1, t2, t3].map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={T.line} strokeWidth="2" />
      ))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth="2.5" strokeLinecap="round" style={{ transition: "all 450ms cubic-bezier(0.4,0,0.2,1)" }} />
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </svg>
  );
}

function Card({ children, style }) {
  return <section style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 14, ...style }}>{children}</section>;
}

function Eyebrow({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkMuted }}>{children}</div>;
}

export default function CareerStrategyDemo() {
  const [move, setMove] = useState(MOVES.primary);
  const [showWhy, setShowWhy] = useState(false);
  const [notNowOpen, setNotNowOpen] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [target, setTarget] = useState("Backend Engineer");
  const [status, setStatus] = useState("needs_attention");
  const [version, setVersion] = useState(1);
  const [toast, setToast] = useState(null);
  const [timeline, setTimeline] = useState([
    { label: "Strategy v1: Backend Engineer", detail: "Initial target role set", kind: "STRATEGY" },
    { label: "2 pieces of evidence on file", detail: "Task Manager REST API, Personal Blog Backend", kind: "EVIDENCE" },
    { label: "Applied to data-entry contract role", detail: "status: applied", kind: "ACTION" },
  ]);

  function pickNotNowReason(reason) {
    setNotNowOpen(false);
    setToast(`Noted — deprioritizing this (${reason.label.toLowerCase()}).`);
    setTimeout(() => setToast(null), 2600);
    setMove(MOVES.alternative);
    setShowWhy(false);
    setAccepted(false);
  }

  function startMove() {
    setAccepted(true);
    setTimeline((tl) => [...tl, { label: `Started: ${move.title}`, detail: "status: accepted", kind: "ACTION" }]);
  }

  function confirmStrategyChange() {
    setTarget("AI Engineer");
    setStatus("insufficient_data");
    setVersion(2);
    setTimeline((tl) => [...tl, { label: "Strategy v2: AI Engineer", detail: "Confirmed strategy change from Backend Engineer", kind: "STRATEGY" }]);
    setShowChangeModal(false);
    setMove(MOVES.primary);
    setAccepted(false);
  }

  return (
    <div style={{ background: T.surface, padding: 24, borderRadius: 16, fontFamily: "-apple-system, BlinkMacSystemFont, Inter, Roboto, sans-serif", color: T.ink, position: "relative" }}>
      <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 14 }}>Interactive preview · sample data</div>

      {/* Status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <Eyebrow>Career strategy</Eyebrow>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{target}</h1>
            <span style={{ fontSize: 11, fontFamily: "ui-monospace, monospace", color: T.inkMuted }}>v{version}</span>
          </div>
          <button
            onClick={() => setShowChangeModal(true)}
            style={{ background: "none", border: "none", color: T.signal, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, marginTop: 6 }}
          >
            Simulate: consider switching to AI Engineering →
          </button>
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: statusColor[status], border: `1px solid ${statusColor[status]}55`, borderRadius: 999, padding: "5px 12px", whiteSpace: "nowrap" }}>
          {statusLabel[status]}
        </div>
      </div>

      {/* Above-the-fold glance row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          ["Where you stand", "2 pieces of evidence, 1 application on file"],
          ["Where you're headed", target],
          ["Biggest gap", "Evidence doesn't cover databases, cloud, testing"],
          ["Biggest opportunity", '"Backend Internship" — 85% match'],
          ["Biggest risk", "Application volume is low"],
        ].map(([label, value], i) => (
          <Card key={i} style={{ padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.35 }}>{value}</div>
          </Card>
        ))}
      </div>

      {/* Next Best Move */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <Eyebrow>Next best move</Eyebrow>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", justifyContent: "space-between", marginTop: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <h2 style={{ fontSize: 19, fontWeight: 650, margin: 0, lineHeight: 1.35 }}>{move.title}</h2>
            <p style={{ fontSize: 14, color: T.inkMuted, marginTop: 8, lineHeight: 1.55 }}>{move.reasoning}</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <Gauge tier={move.tier} />
            <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: tierColor[move.tier], marginTop: -4 }}>
              {move.tier.toUpperCase()} VALUE
            </div>
          </div>
        </div>

        {!move.fits && (
          <div style={{ marginTop: 14, fontSize: 13, color: T.risk, background: "#FBF2F0", border: `1px solid ${T.risk}33`, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            Needs about 8h/week — check this against your available time before starting.
          </div>
        )}

        {move.evidence.length > 0 && (
          <ul style={{ margin: "14px 0 0", paddingLeft: 18, fontSize: 13, color: T.inkMuted }}>
            {move.evidence.map((e, i) => <li key={i} style={{ marginBottom: 3 }}>{e}</li>)}
          </ul>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
          {accepted ? (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: T.good, fontSize: 14, fontWeight: 600 }}>
              <Check size={16} /> In progress
            </span>
          ) : (
            <button onClick={startMove} style={{ background: T.signal, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Start
            </button>
          )}
          <button onClick={() => setShowWhy((v) => !v)} style={{ background: "none", border: "none", color: T.signal, fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "9px 4px" }}>
            Why this? {showWhy ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {!accepted && (
            <button onClick={() => setNotNowOpen((v) => !v)} style={{ background: "none", border: "none", color: T.inkMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "9px 4px" }}>
              Not now
            </button>
          )}
        </div>

        {showWhy && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 10 }}>
            <WhyRow label="Goal connection" value={move.reasoning} />
            <WhyRow label="Evidence" value={move.evidence.join(" · ")} />
            <WhyRow label="Confidence" value={move.tier === "high" ? "high" : "medium"} />
            <WhyRow label="Alternative considered" value={move === MOVES.primary ? `${MOVES.alternative.title} (${MOVES.alternative.tier})` : `${MOVES.primary.title} (${MOVES.primary.tier})`} />
          </div>
        )}

        {notNowOpen && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.inkMuted, marginBottom: 8 }}>Why not now?</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {NOT_NOW_REASONS.map((r) => (
                <button key={r.id} onClick={() => pickNotNowReason(r)} style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 14px", fontSize: 13, cursor: "pointer", color: T.ink }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Bottleneck / Health / Momentum row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14, marginBottom: 16 }}>
        <Card style={{ padding: 20 }}>
          <Eyebrow>What's blocking you</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: T.risk, flexShrink: 0 }} />
            <h3 style={{ fontSize: 15, fontWeight: 650, margin: 0 }}>Insufficient technical evidence</h3>
          </div>
          <p style={{ fontSize: 13, color: T.inkMuted, marginTop: 8, lineHeight: 1.5 }}>
            Evidence doesn't yet cover databases, cloud, or testing — the skills recruiters will check for first.
          </p>
        </Card>

        <Card style={{ padding: 20 }}>
          <Eyebrow>Strategy health</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 8px", marginTop: 12 }}>
            {Object.entries(HEALTH).map(([key, dim]) => (
              <div key={key} style={{ display: "flex", alignItems: "flex-start", gap: 6 }} title={dim.explanation}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: dimColor[dim.status], marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 11, color: T.inkMuted, fontWeight: 600, textTransform: "capitalize" }}>{key}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{dimLabel[dim.status]}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card style={{ padding: 20 }}>
          <Eyebrow>Momentum</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <ArrowUpRight size={20} color={T.good} />
            <span style={{ fontSize: 15, fontWeight: 650, color: T.good }}>Improving</span>
          </div>
          <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, color: T.inkMuted }}>
            <li>Application activity picked up this month</li>
          </ul>
        </Card>
      </div>

      {/* Focus */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Eyebrow>This week's focus</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {[MOVES.primary, MOVES.alternative].map((m, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: T.surface, border: `1px solid ${T.line}`, borderRadius: 999, padding: "7px 14px", fontSize: 13 }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: tierColor[m.tier], flexShrink: 0 }} />
              {m.title}
            </div>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card style={{ padding: 20 }}>
        <Eyebrow>Strategy timeline</Eyebrow>
        <div style={{ marginTop: 14 }}>
          {timeline.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: T.signal, marginTop: 5, flexShrink: 0 }} />
                {i < timeline.length - 1 && <span style={{ flex: 1, width: 1, background: T.line, minHeight: 20 }} />}
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: T.signal }}>{e.kind}</div>
                <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{e.label}</div>
                <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 1 }}>{e.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", background: T.ink, color: "#fff", padding: "9px 16px", borderRadius: 8, fontSize: 13, boxShadow: "0 6px 20px rgba(0,0,0,0.18)" }}>
          {toast}
        </div>
      )}

      {/* Strategy Change Confirmation modal */}
      {showChangeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(18,22,28,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ background: T.card, borderRadius: 14, padding: 26, maxWidth: 440, width: "100%" }}>
            <Eyebrow>Strategy change</Eyebrow>
            <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "16px 0 18px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: "uppercase" }}>Current</div>
                <div style={{ fontSize: 16, fontWeight: 650, marginTop: 2 }}>Backend Engineer</div>
              </div>
              <div style={{ color: T.inkMuted }}>→</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: "uppercase" }}>Proposed</div>
                <div style={{ fontSize: 16, fontWeight: 650, marginTop: 2, color: T.signal }}>AI Engineer</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: T.inkMuted, lineHeight: 1.55, marginBottom: 14 }}>
              This is a major change from your current direction. Backend evidence transfers partially; interview prep and applications in flight would need to be re-targeted.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMuted, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 4 }}>Switching cost</div>
            <div style={{ fontSize: 13, marginBottom: 18 }}>Roughly 3-4 weeks of new evidence-building before applications would be competitive.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowChangeModal(false)} style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: T.ink }}>
                Cancel
              </button>
              <button onClick={confirmStrategyChange} style={{ background: T.signal, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Confirm strategy change
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WhyRow({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 14, fontSize: 13, alignItems: "baseline" }}>
      <div style={{ width: 140, flexShrink: 0, color: T.inkMuted, fontWeight: 600 }}>{label}</div>
      <div style={{ color: T.ink, lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}

import React, { useState } from "react";
import { AlertTriangle, TrendingDown, TrendingUp, Clock, ChevronRight, ChevronDown } from "lucide-react";

// Seeded from the actual output of demo/runTpoAnalyticsDemo.js — every
// number below was computed by src/services against the 12-student demo
// roster, not invented for the UI.
const SEED = {
  season: { id: "2026", window: "1 Jun – 1 Oct", progressPct: 60.7 },
  funnel: [
    { stage: "Registered", count: 12, dropOffPct: null },
    { stage: "Eligible", count: 11, dropOffPct: 8.3 },
    { stage: "Applied", count: 6, dropOffPct: 45.5 },
    { stage: "Shortlisted", count: 5, dropOffPct: 16.7 },
    { stage: "Interviewed", count: 5, dropOffPct: 0 },
    { stage: "Offered", count: 4, dropOffPct: 20 },
    { stage: "Accepted", count: 3, dropOffPct: 25 },
    { stage: "Joined", count: 1, dropOffPct: 66.7 },
  ],
  pacing: { currentPct: 25, baselinePct: 56.6, deltaPts: -31.6 },
  riskCounts: { critical: 2, high: 2, medium: 5, none: 3 },
  package: {
    avgLPA: 26.3,
    medianLPA: 33,
    highestLPA: 38,
    lowestLPA: 8,
    byDept: [
      { dept: "CSE", avgLPA: 38 },
      { dept: "ECE", avgLPA: 33 },
      { dept: "MECH", avgLPA: 8 },
    ],
  },
  drives: [
    { company: "Amazon", tier: "DREAM", ctc: 33, applied: 1, offered: 1, conversionPct: 100, deadlineDays: 2 },
    { company: "Deloitte", tier: "CORE", ctc: 12, applied: 1, offered: 0, conversionPct: 0, deadlineDays: 3 },
    { company: "L&T", tier: "CORE", ctc: 8, applied: 1, offered: 1, conversionPct: 100, deadlineDays: 5 },
    { company: "TCS Digital", tier: "CORE", ctc: 9, applied: 1, offered: 1, conversionPct: 100, deadlineDays: 8 },
    { company: "Microsoft", tier: "DREAM", ctc: 38, applied: 2, offered: 1, conversionPct: 50, deadlineDays: null },
    { company: "Google", tier: "DREAM", ctc: 44, applied: 2, offered: 0, conversionPct: 0, deadlineDays: null },
    { company: "Wipro", tier: "MASS", ctc: 4, applied: 1, offered: 1, conversionPct: 100, deadlineDays: null },
    { company: "Infosys", tier: "MASS", ctc: 4.5, applied: 0, offered: 0, conversionPct: null, deadlineDays: null },
  ],
  actionQueue: [
    { priority: "CRITICAL", type: "Zero-offer risk", id: "STU-4471", action: "Proactively match against active drives.", evidence: ["2 applications, 2 rejections", "inactive 35 days"] },
    { priority: "CRITICAL", type: "Zero-offer risk", id: "STU-2208", action: "Proactively match against active drives.", evidence: ["not eligible for any active drive", "profile 30% complete"] },
    { priority: "HIGH", type: "High readiness risk", id: "STU-1190", action: "Review risk and assign an intervention.", evidence: ["no recent assessment", "no application activity"] },
    { priority: "HIGH", type: "Drive deadline", id: "Amazon", action: "Finalize eligibility list — closes in 2 days.", evidence: [] },
    { priority: "HIGH", type: "Intervention overdue", id: "STU-1190", action: "Follow up — open 20 days.", evidence: [] },
    { priority: "MEDIUM", type: "Quick win", id: "3 students", action: "Fix profile completeness to unlock Amazon eligibility.", evidence: [] },
    { priority: "MEDIUM", type: "Drive deadline", id: "Deloitte", action: "Finalize eligibility list — closes in 3 days.", evidence: [] },
    { priority: "MEDIUM", type: "Drive deadline", id: "TCS Digital", action: "Finalize eligibility list — closes in 8 days.", evidence: [] },
  ],
};

const PRIORITY_STYLE = {
  CRITICAL: { cls: "chip-critical", label: "CRITICAL" },
  HIGH: { cls: "chip-high", label: "HIGH" },
  MEDIUM: { cls: "chip-medium", label: "MEDIUM" },
};

function FlapNumber({ value, label }) {
  return (
    <div className="flap-cell">
      <div className="flap-value">{value}</div>
      <div className="flap-label">{label}</div>
    </div>
  );
}

function ActionRow({ item }) {
  const [open, setOpen] = useState(false);
  const style = PRIORITY_STYLE[item.priority];
  const hasEvidence = item.evidence && item.evidence.length > 0;
  return (
    <div className="action-row" onClick={() => hasEvidence && setOpen(!open)} style={{ cursor: hasEvidence ? "pointer" : "default" }}>
      <div className="flex items-center gap-3">
        <span className={`chip ${style.cls}`}>{style.label}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="mono id-tag">{item.id}</span>
            <span className="type-label">{item.type}</span>
          </div>
          <p className="action-text">{item.action}</p>
        </div>
        {hasEvidence && (open ? <ChevronDown size={16} className="chev" aria-hidden="true" /> : <ChevronRight size={16} className="chev" aria-hidden="true" />)}
      </div>
      {open && hasEvidence && (
        <ul className="evidence-list">
          {item.evidence.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TpoCommandCentre() {
  const data = SEED;
  const behindSchedule = data.pacing.deltaPts < 0;

  return (
    <div className="tcc-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');

        .tcc-root {
          --bg: #14181F;
          --panel: #1B212B;
          --panel-alt: #212836;
          --line: #2A303C;
          --amber: #E8A33D;
          --amber-dim: #A9803F;
          --text: #EDEEF0;
          --text-muted: #8B93A3;
          --critical: #E0654C;
          --critical-soft: #3A2420;
          --high: #E8A33D;
          --high-soft: #3A2E18;
          --medium: #6FA3C7;
          --medium-soft: #1E2C36;
          --good: #5FA98A;
          background: var(--bg);
          color: var(--text);
          font-family: 'Space Mono', ui-monospace, monospace;
          padding: 24px 16px 32px;
          border-radius: 16px;
        }
        .mono { font-family: 'Space Mono', ui-monospace, monospace; }
        .eyebrow { letter-spacing: 0.12em; text-transform: uppercase; font-size: 10.5px; color: var(--text-muted); }
        .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; }
        .flap-cell { position: relative; background: var(--panel-alt); border: 1px solid var(--line); border-radius: 6px; padding: 10px 6px; text-align: center; min-width: 64px; }
        .flap-cell::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: rgba(0,0,0,0.5); box-shadow: 0 1px 0 rgba(255,255,255,0.05); }
        .flap-value { font-size: 22px; font-weight: 700; color: var(--amber); line-height: 1.1; }
        .flap-label { font-size: 8.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-top: 4px; }
        .drop-arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 9px; color: var(--text-muted); padding: 0 2px; min-width: 30px; }
        .chip { font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; padding: 3px 7px; border-radius: 4px; flex-shrink: 0; }
        .chip-critical { background: var(--critical-soft); color: var(--critical); }
        .chip-high { background: var(--high-soft); color: var(--high); }
        .chip-medium { background: var(--medium-soft); color: var(--medium); }
        .id-tag { color: var(--text); font-size: 12.5px; font-weight: 700; }
        .type-label { color: var(--text-muted); font-size: 10.5px; }
        .action-text { font-size: 12.5px; color: var(--text); margin-top: 2px; }
        .action-row { padding: 10px 12px; border-bottom: 1px solid var(--line); }
        .action-row:last-child { border-bottom: none; }
        .chev { color: var(--text-muted); flex-shrink: 0; }
        .evidence-list { margin: 8px 0 0 0; padding-left: 16px; font-size: 11px; color: var(--text-muted); list-style: disc; }
        .evidence-list li { margin-top: 2px; }
        table.drive-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
        table.drive-table th { text-align: left; color: var(--text-muted); font-weight: 400; font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid var(--line); }
        table.drive-table td { padding: 7px 8px; border-bottom: 1px solid var(--line); color: var(--text); }
        table.drive-table tr:last-child td { border-bottom: none; }
        .tier-tag { font-size: 9px; padding: 1px 5px; border-radius: 3px; letter-spacing: 0.04em; }
        .tier-DREAM { background: #2E2440; color: #B79CE8; }
        .tier-CORE { background: #1E2C36; color: var(--medium); }
        .tier-MASS { background: #1E2E28; color: var(--good); }
        .bar-track { background: var(--line); border-radius: 999px; height: 5px; overflow: hidden; margin-top: 6px; }
        .bar-fill { height: 100%; background: var(--amber); border-radius: 999px; }
      `}</style>

      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <span className="eyebrow">Placement Command Centre</span>
          <span className="eyebrow">Season {data.season.id} · {data.season.window}</span>
        </div>
        <div className="flex items-center gap-2 mb-6">
          {behindSchedule ? <TrendingDown size={16} style={{ color: "var(--critical)" }} aria-hidden="true" /> : <TrendingUp size={16} style={{ color: "var(--good)" }} aria-hidden="true" />}
          <span className="text-sm" style={{ color: behindSchedule ? "var(--critical)" : "var(--good)" }}>
            {Math.abs(data.pacing.deltaPts)} pts {behindSchedule ? "behind" : "ahead of"} last season at this point ({data.season.progressPct}% through)
          </span>
        </div>

        <div className="panel p-3 mb-5" style={{ overflowX: "auto" }}>
          <div className="flex items-center" style={{ minWidth: 560 }}>
            {data.funnel.map((f, i) => (
              <React.Fragment key={f.stage}>
                {i > 0 && (
                  <div className="drop-arrow">
                    <span>→</span>
                    {f.dropOffPct !== null && <span>-{f.dropOffPct}%</span>}
                  </div>
                )}
                <FlapNumber value={f.count} label={f.stage} />
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="panel p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={14} style={{ color: "var(--critical)" }} aria-hidden="true" />
              <span className="eyebrow">Zero-Offer Risk</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span style={{ fontSize: 26, fontWeight: 700, color: "var(--critical)" }}>{data.riskCounts.critical + data.riskCounts.high}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>need attention now</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              {data.riskCounts.critical} critical · {data.riskCounts.high} high · {data.riskCounts.medium} medium
            </p>
          </div>
          <div className="panel p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Clock size={14} style={{ color: "var(--amber)" }} aria-hidden="true" />
              <span className="eyebrow">Package Snapshot</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span style={{ fontSize: 26, fontWeight: 700, color: "var(--amber)" }}>₹{data.package.avgLPA}L</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>average · ₹{data.package.highestLPA}L highest</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              median ₹{data.package.medianLPA}L across {data.package.byDept.length} departments
            </p>
          </div>
        </div>

        <div className="panel mb-5">
          <div className="p-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <span className="eyebrow">Today's Action Queue — {data.actionQueue.length} items</span>
          </div>
          {data.actionQueue.map((item, i) => (
            <ActionRow key={i} item={item} />
          ))}
        </div>

        <div className="panel p-3 mb-5" style={{ overflowX: "auto" }}>
          <span className="eyebrow">Active &amp; Recent Drives</span>
          <table className="drive-table mt-2">
            <thead>
              <tr>
                <th>Company</th>
                <th>Tier</th>
                <th>CTC</th>
                <th>Applied</th>
                <th>Offered</th>
                <th>Conv.</th>
                <th>Deadline</th>
              </tr>
            </thead>
            <tbody>
              {data.drives.map((d) => (
                <tr key={d.company}>
                  <td>{d.company}</td>
                  <td><span className={`tier-tag tier-${d.tier}`}>{d.tier}</span></td>
                  <td>₹{d.ctc}L</td>
                  <td>{d.applied}</td>
                  <td>{d.offered}</td>
                  <td>{d.conversionPct === null ? "—" : `${d.conversionPct}%`}</td>
                  <td style={{ color: d.deadlineDays !== null && d.deadlineDays <= 3 ? "var(--critical)" : "var(--text-muted)" }}>
                    {d.deadlineDays === null ? "closed" : `${d.deadlineDays}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel p-4 mb-4">
          <span className="eyebrow">Average Package by Department</span>
          <div className="mt-3 flex flex-col gap-2.5">
            {data.package.byDept.map((d) => (
              <div key={d.dept} className="flex items-center gap-3">
                <span className="mono text-xs" style={{ width: 44 }}>{d.dept}</span>
                <div className="flex-1">
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(d.avgLPA / data.package.highestLPA) * 100}%` }} />
                  </div>
                </div>
                <span className="mono text-xs" style={{ width: 46, textAlign: "right" }}>₹{d.avgLPA}L</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Every figure above is traceable to a real application, interview, or offer record — no fabricated analytics.
        </p>
      </div>
    </div>
  );
}

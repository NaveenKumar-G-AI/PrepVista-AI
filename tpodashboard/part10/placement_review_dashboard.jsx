import React, { useState } from "react";
import {
  ShieldCheck, ChevronDown, TrendingDown, TrendingUp, AlertTriangle,
  Info, X, FileCheck2, CircleAlert,
} from "lucide-react";

/* ============================================================
   DATA — pulled directly from a live run of the Part 10 backend
   against seeded (simulated, not hand-typed) records. Nothing
   below is invented for the UI; every figure traces back to
   ReportGenerationService.buildExecutiveReportPayload().
   ============================================================ */

const INSTITUTION = "Kestrel Institute of Technology";
const DATA_THROUGH = "Aug 13, 2026 · 5:20 PM";

const KPI = {
  placementRate: 49.6, numerator: 137, denominator: 276,
  target: 68, gap: -18.4,
  offers: 179, accepted: 165, joined: 144, verified: 137,
  medianCtc: 7.3, avgCtc: 7.95, highCtc: 15.2,
  companies: 15, repeatRecruiters: 15,
  avgReadiness: 66.8, highRisk: 11,
};

const QUALITY = {
  score: 83, status: "needs_attention",
  factors: [
    { label: "Offer verification", score: 82.7 },
    { label: "Joining verification", score: 95.1 },
    { label: "Evidence coverage", score: 87.5 },
  ],
};

const WARNINGS = [
  { code: "unverified_offers", severity: "warning", count: 31, message: "offer(s) have not been verified." },
  { code: "incomplete_joining", severity: "warning", count: 28, message: "student(s) have incomplete joining data." },
];
const ISSUES = [
  { code: "verified_without_evidence", severity: "critical", count: 11, message: "verified placement(s) have no evidence attached." },
  { code: "possible_duplicate_student", severity: "info", count: 6, message: "possible duplicate student record(s) — review before publishing." },
];

const FUNNEL_2026 = [
  { stage: "Seeking", count: 276, conv: null },
  { stage: "Eligible", count: 258, conv: 93.5 },
  { stage: "Applied", count: 193, conv: 74.8 },
  { stage: "Shortlisted", count: 193, conv: 100 },
  { stage: "Interviewed", count: 193, conv: 100 },
  { stage: "Selected", count: 183, conv: 94.8 },
  { stage: "Offer", count: 179, conv: 97.8 },
  { stage: "Accepted", count: 165, conv: 92.2 },
  { stage: "Joined", count: 144, conv: 87.3 },
  { stage: "Verified", count: 137, conv: 95.1 },
];
const FUNNEL_2025 = [
  { stage: "Seeking", count: 272, conv: null },
  { stage: "Eligible", count: 256, conv: 94.1 },
  { stage: "Applied", count: 214, conv: 83.6 },
  { stage: "Shortlisted", count: 214, conv: 100 },
  { stage: "Interviewed", count: 214, conv: 100 },
  { stage: "Selected", count: 208, conv: 97.2 },
  { stage: "Offer", count: 208, conv: 100 },
  { stage: "Accepted", count: 194, conv: 93.3 },
  { stage: "Joined", count: 188, conv: 96.9 },
  { stage: "Verified", count: 177, conv: 94.1 },
];

const DELTAS = [
  { from: "Accepted", to: "Joined", current: 87.3, prior: 96.9, delta: -9.6 },
  { from: "Eligible", to: "Applied", current: 74.8, prior: 83.6, delta: -8.8 },
  { from: "Interviewed", to: "Selected", current: 94.8, prior: 97.2, delta: -2.4 },
];

const INSIGHTS = [
  "Accepted → Joined conversion is down 9.6 points versus last season (96.9% → 87.3%).",
  "CIVIL placement (35.7%) is 10.8 points below the institutional median.",
  "21 students have accepted an offer but have not confirmed joining.",
];

const DEPARTMENTS = [
  { dept: "CSE", students: 70, seeking: 60, applications: 48, offers: 46, accepted: 43, joined: 38, verified: 38, rate: 63.3, ctc: 10.0, readiness: 69.8, highRisk: 1 },
  { dept: "MECH", students: 50, seeking: 49, applications: 38, offers: 35, accepted: 32, joined: 29, verified: 28, rate: 57.1, ctc: 6.05, readiness: 65.3, highRisk: 0 },
  { dept: "IT", students: 55, seeking: 53, applications: 40, offers: 36, accepted: 31, joined: 29, verified: 27, rate: 50.9, ctc: 9.8, readiness: 68.8, highRisk: 3 },
  { dept: "ECE", students: 60, seeking: 50, applications: 29, offers: 25, accepted: 24, joined: 22, verified: 21, rate: 42.0, ctc: 6.2, readiness: 63.7, highRisk: 3 },
  { dept: "EEE", students: 40, seeking: 36, applications: 21, offers: 20, accepted: 18, joined: 15, verified: 13, rate: 36.1, ctc: 5.9, readiness: 64.8, highRisk: 2 },
  { dept: "CIVIL", students: 30, seeking: 28, applications: 17, offers: 17, accepted: 17, joined: 11, verified: 10, rate: 35.7, ctc: 5.35, readiness: 67.6, highRisk: 2 },
];

const MEDIAN_DEPT_RATE = 46.5;

const EVIDENCE = {
  metric: "placement_rate",
  version: 1,
  formula: "Verified placed students ÷ students seeking placement, for the selected season.",
  denominator: "Students with seeking_placement = true in the selected season (276 students).",
  computedAt: DATA_THROUGH,
};

/* ============================================================ */

const TABS = ["Overview", "Funnel", "Departments", "Data Quality"];

export default function PlacementReview() {
  const [tab, setTab] = useState("Overview");
  const [expandedDept, setExpandedDept] = useState(null);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="pv-root">
      <style>{CSS}</style>

      <header className="pv-masthead">
        <div className="pv-masthead-left">
          <div className="pv-eyebrow">Institutional Placement Intelligence</div>
          <h1 className="pv-institution">{INSTITUTION}</h1>
          <div className="pv-subline">Placement Review · Season 2026</div>
        </div>
        <div className="pv-masthead-right">
          <div className="pv-datathrough">Data through<br /><strong>{DATA_THROUGH}</strong></div>
        </div>
      </header>

      <nav className="pv-tabs" role="tablist" aria-label="Report sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={"pv-tab" + (tab === t ? " is-active" : "")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <main className="pv-content">
        {tab === "Overview" && (
          <OverviewTab onOpenEvidence={() => setShowEvidence(true)} />
        )}
        {tab === "Funnel" && <FunnelTab />}
        {tab === "Departments" && (
          <DepartmentsTab expanded={expandedDept} setExpanded={setExpandedDept} />
        )}
        {tab === "Data Quality" && <DataQualityTab />}
      </main>

      {showEvidence && <EvidencePopover onClose={() => setShowEvidence(false)} />}
    </div>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({ onOpenEvidence }) {
  return (
    <>
      <section className="pv-hero">
        <div className="pv-seal-wrap">
          <Seal onClick={onOpenEvidence} />
        </div>
        <div className="pv-hero-numbers">
          <div className="pv-hero-metric">
            <div className="pv-hero-label">Placement Rate</div>
            <div className="pv-hero-value">{KPI.placementRate}%</div>
            <div className="pv-hero-sub">{KPI.numerator} of {KPI.denominator} seeking-placement students</div>
          </div>
          <div className="pv-hero-metric">
            <div className="pv-hero-label">Target</div>
            <div className="pv-hero-value pv-muted">{KPI.target}%</div>
          </div>
          <div className="pv-hero-metric">
            <div className="pv-hero-label">Gap</div>
            <div className="pv-hero-value pv-risk">{KPI.gap}<span className="pv-hero-unit">pts</span></div>
          </div>
        </div>
      </section>

      <section className="pv-kpirow">
        <KpiCell label="Offers" value={KPI.offers} />
        <KpiCell label="Accepted" value={KPI.accepted} />
        <KpiCell label="Joined" value={KPI.joined} />
        <KpiCell label="Median CTC" value={`₹${KPI.medianCtc}L`} />
        <KpiCell label="Companies" value={`${KPI.companies}`} sub={`${KPI.repeatRecruiters} repeat`} />
        <KpiCell label="Readiness" value={KPI.avgReadiness} />
        <KpiCell label="High Risk" value={KPI.highRisk} warn />
      </section>

      <section className="pv-panel">
        <div className="pv-panel-head">
          <h2>Why below target</h2>
          <span className="pv-panel-note">Largest observed conversion drops, 2026 vs 2025</span>
        </div>
        <div className="pv-deltas">
          {DELTAS.map((d) => (
            <div className="pv-delta-row" key={d.from}>
              <div className="pv-delta-label">{d.from} → {d.to}</div>
              <div className="pv-delta-bars">
                <div className="pv-delta-track">
                  <div className="pv-delta-fill pv-delta-fill-prior" style={{ width: `${d.prior}%` }} />
                </div>
                <div className="pv-delta-track">
                  <div className="pv-delta-fill pv-delta-fill-current" style={{ width: `${d.current}%` }} />
                </div>
              </div>
              <div className="pv-delta-figures">
                <span className="pv-mono">{d.prior}%</span>
                <span className="pv-mono pv-strong">{d.current}%</span>
                <span className="pv-delta-chip"><TrendingDown size={12} strokeWidth={2.5} />{d.delta}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="pv-legend">
          <span><i className="pv-swatch pv-swatch-prior" /> 2025</span>
          <span><i className="pv-swatch pv-swatch-current" /> 2026</span>
        </div>
      </section>

      <section className="pv-panel">
        <div className="pv-panel-head">
          <h2>Evidence-backed insights</h2>
        </div>
        <div className="pv-insights">
          {INSIGHTS.map((text, i) => (
            <div className="pv-insight-card" key={i}>
              <span className="pv-insight-index">{String(i + 1).padStart(2, "0")}</span>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function KpiCell({ label, value, sub, warn }) {
  return (
    <div className={"pv-kpicell" + (warn ? " is-warn" : "")}>
      <div className="pv-kpicell-label">{label}</div>
      <div className="pv-kpicell-value pv-mono">{value}</div>
      {sub && <div className="pv-kpicell-sub">{sub}</div>}
    </div>
  );
}

function Seal({ onClick }) {
  return (
    <button className="pv-seal" onClick={onClick} aria-label="View evidence behind this number">
      <span className="pv-seal-ring" aria-hidden="true" />
      <span className="pv-seal-face">
        <ShieldCheck size={22} strokeWidth={1.75} />
        <span className="pv-seal-text">VERIFIED</span>
        <span className="pv-seal-sub">EVIDENCE&nbsp;VAULT</span>
      </span>
    </button>
  );
}

function EvidencePopover({ onClose }) {
  return (
    <div className="pv-modal-backdrop" onClick={onClose}>
      <div className="pv-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Metric evidence">
        <button className="pv-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <div className="pv-modal-eyebrow"><FileCheck2 size={14} /> metric_definition · v{EVIDENCE.version}</div>
        <h3>{EVIDENCE.metric}</h3>
        <dl className="pv-modal-dl">
          <dt>Formula</dt>
          <dd>{EVIDENCE.formula}</dd>
          <dt>Denominator</dt>
          <dd>{EVIDENCE.denominator}</dd>
          <dt>Computed</dt>
          <dd>{EVIDENCE.computedAt}</dd>
        </dl>
        <p className="pv-modal-footnote">
          This definition is versioned and frozen into every published snapshot — later revisions
          never change what an already-published report shows.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Funnel ---------------- */

function FunnelTab() {
  const max = FUNNEL_2026[0].count;
  return (
    <section className="pv-panel">
      <div className="pv-panel-head">
        <h2>Placement Funnel</h2>
        <span className="pv-panel-note">Season 2026, actual records only</span>
      </div>

      <div className="pv-funnel">
        {FUNNEL_2026.map((s, i) => {
          const prior = FUNNEL_2025[i];
          const widthPct = (s.count / max) * 100;
          const priorWidthPct = (prior.count / FUNNEL_2025[0].count) * 100;
          return (
            <div className="pv-funnel-row" key={s.stage}>
              <div className="pv-funnel-label">{s.stage}</div>
              <div className="pv-funnel-bars">
                <div className="pv-funnel-track">
                  <div className="pv-funnel-fill pv-funnel-fill-prior" style={{ width: `${priorWidthPct}%` }} />
                </div>
                <div className="pv-funnel-track">
                  <div className="pv-funnel-fill pv-funnel-fill-current" style={{ width: `${widthPct}%` }} />
                </div>
              </div>
              <div className="pv-funnel-count pv-mono">{s.count}</div>
              <div className="pv-funnel-conv pv-mono">{s.conv === null ? "—" : `${s.conv}%`}</div>
            </div>
          );
        })}
      </div>
      <div className="pv-legend">
        <span><i className="pv-swatch pv-swatch-prior" /> 2025</span>
        <span><i className="pv-swatch pv-swatch-current" /> 2026</span>
      </div>

      <div className="pv-callout">
        <Info size={15} />
        <p>
          Shortlisting and interview attendance convert near 100% in both seasons — students who
          don't advance at one drive are simulated retrying at others. With retries available, those
          stages saturate; the real filters this season are <strong>whether a student applies at all</strong>,
          and <strong>whether they follow through on joining after accepting</strong>.
        </p>
      </div>
    </section>
  );
}

/* ---------------- Departments ---------------- */

function DepartmentsTab({ expanded, setExpanded }) {
  const sorted = [...DEPARTMENTS].sort((a, b) => b.rate - a.rate);
  return (
    <section className="pv-panel">
      <div className="pv-panel-head">
        <h2>Department Performance</h2>
        <span className="pv-panel-note">Season 2026 · ranked by placement rate</span>
      </div>

      <div className="pv-table" role="table">
        <div className="pv-table-header" role="row">
          <span>Dept</span><span>Seeking</span><span>Offers</span><span>Joined</span>
          <span>Placement %</span><span>Median CTC</span><span /></div>
        {sorted.map((d) => {
          const isOpen = expanded === d.dept;
          const belowMedian = d.rate < MEDIAN_DEPT_RATE;
          return (
            <div className="pv-table-group" key={d.dept}>
              <button
                className="pv-table-row"
                role="row"
                onClick={() => setExpanded(isOpen ? null : d.dept)}
                aria-expanded={isOpen}
              >
                <span className="pv-dept-name">{d.dept}</span>
                <span className="pv-mono">{d.seeking}</span>
                <span className="pv-mono">{d.offers}</span>
                <span className="pv-mono">{d.joined}</span>
                <span className={"pv-mono pv-rate" + (belowMedian ? " pv-risk" : " pv-good")}>
                  {d.rate}%
                </span>
                <span className="pv-mono">₹{d.ctc}L</span>
                <ChevronDown size={16} className={"pv-chevron" + (isOpen ? " is-open" : "")} />
              </button>
              {isOpen && (
                <div className="pv-table-detail">
                  <DetailStat label="Students enrolled" value={d.students} />
                  <DetailStat label="Applications" value={d.applications} />
                  <DetailStat label="Accepted offers" value={d.accepted} />
                  <DetailStat label="Verified placements" value={d.verified} />
                  <DetailStat label="Avg. readiness" value={d.readiness} />
                  <DetailStat label="High-risk students" value={d.highRisk} warn={d.highRisk > 0} />
                  <div className="pv-detail-vs-median">
                    vs. institutional median ({MEDIAN_DEPT_RATE}%):{" "}
                    <strong className={belowMedian ? "pv-risk" : "pv-good"}>
                      {belowMedian ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                      {Math.abs(d.rate - MEDIAN_DEPT_RATE).toFixed(1)} pts {belowMedian ? "below" : "above"}
                    </strong>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DetailStat({ label, value, warn }) {
  return (
    <div className={"pv-detailstat" + (warn ? " is-warn" : "")}>
      <div className="pv-detailstat-value pv-mono">{value}</div>
      <div className="pv-detailstat-label">{label}</div>
    </div>
  );
}

/* ---------------- Data Quality ---------------- */

function DataQualityTab() {
  return (
    <section className="pv-panel">
      <div className="pv-panel-head">
        <h2>Report Data Quality</h2>
        <span className="pv-panel-note">Completeness &amp; verification — not a statistical accuracy score</span>
      </div>

      <div className="pv-quality-strip">
        <div className="pv-quality-score">
          <div className="pv-quality-ring" style={{ "--pct": QUALITY.score }}>
            <span className="pv-mono">{QUALITY.score}</span>
          </div>
          <div className="pv-quality-status">{QUALITY.status.replace("_", " ")}</div>
        </div>
        <div className="pv-quality-factors">
          {QUALITY.factors.map((f) => (
            <div className="pv-factor-row" key={f.label}>
              <span className="pv-factor-label">{f.label}</span>
              <div className="pv-factor-track">
                <div className="pv-factor-fill" style={{ width: `${f.score}%` }} />
              </div>
              <span className="pv-mono pv-factor-value">{f.score}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pv-panel-head pv-panel-head-tight">
        <h3>Warnings</h3>
      </div>
      <div className="pv-issue-list">
        {WARNINGS.map((w) => (
          <div className="pv-issue-row" key={w.code}>
            <AlertTriangle size={15} className="pv-issue-icon pv-issue-icon-warning" />
            <span className="pv-mono pv-strong">{w.count}</span>
            <span>{w.message}</span>
          </div>
        ))}
      </div>

      <div className="pv-panel-head pv-panel-head-tight">
        <h3>Data Integrity Issues</h3>
      </div>
      <div className="pv-issue-list">
        {ISSUES.map((w) => (
          <div className="pv-issue-row" key={w.code}>
            <CircleAlert
              size={15}
              className={"pv-issue-icon " + (w.severity === "critical" ? "pv-issue-icon-critical" : "pv-issue-icon-info")}
            />
            <span className="pv-mono pv-strong">{w.count}</span>
            <span>{w.message}</span>
            <span className={"pv-severity-chip pv-severity-" + w.severity}>{w.severity}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- styles ---------------- */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pv-root {
  --paper: #e6eaea;
  --ink: #14213d;
  --ink-soft: #4b5a72;
  --card: #fbfbfa;
  --brass: #a9812f;
  --brass-deep: #7c5e20;
  --risk: #a6432b;
  --good: #3c6e4f;
  --hairline: rgba(20,33,61,0.14);

  background: var(--paper);
  color: var(--ink);
  font-family: 'IBM Plex Sans', sans-serif;
  border-radius: 14px;
  padding: 28px 28px 36px;
  max-width: 860px;
  margin: 0 auto;
  box-sizing: border-box;
}
.pv-root * { box-sizing: border-box; }
.pv-mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
.pv-strong { font-weight: 600; }
.pv-risk { color: var(--risk); }
.pv-good { color: var(--good); }
.pv-muted { color: var(--ink-soft); }

/* Masthead */
.pv-masthead {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-bottom: 2px solid var(--ink); padding-bottom: 16px; margin-bottom: 4px;
}
.pv-eyebrow {
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--brass-deep); margin-bottom: 6px;
}
.pv-institution {
  font-family: 'Source Serif 4', serif; font-weight: 600; font-size: 28px;
  margin: 0; line-height: 1.1; letter-spacing: -0.01em;
}
.pv-subline { color: var(--ink-soft); font-size: 13.5px; margin-top: 4px; }
.pv-datathrough {
  text-align: right; font-size: 11.5px; color: var(--ink-soft); line-height: 1.5;
}
.pv-datathrough strong { color: var(--ink); font-weight: 600; }

/* Tabs */
.pv-tabs { display: flex; gap: 2px; margin: 18px 0 20px; }
.pv-tab {
  font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 500;
  background: transparent; border: 1px solid var(--hairline); border-bottom: none;
  color: var(--ink-soft); padding: 9px 16px 8px; cursor: pointer;
  border-radius: 8px 8px 0 0; transition: background 0.15s ease, color 0.15s ease;
}
.pv-tab:hover { color: var(--ink); background: rgba(20,33,61,0.04); }
.pv-tab.is-active { color: var(--ink); background: var(--card); border-color: var(--hairline); font-weight: 600; }
.pv-tab:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; }
.pv-content { background: var(--card); border-radius: 4px 12px 12px 12px; border: 1px solid var(--hairline); padding: 24px; }

/* Hero */
.pv-hero { display: flex; align-items: center; gap: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--hairline); margin-bottom: 20px; flex-wrap: wrap; }
.pv-seal-wrap { flex-shrink: 0; }
.pv-hero-numbers { display: flex; gap: 32px; flex-wrap: wrap; }
.pv-hero-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft); margin-bottom: 4px; }
.pv-hero-value { font-family: 'IBM Plex Mono', monospace; font-size: 38px; font-weight: 600; line-height: 1; }
.pv-hero-unit { font-size: 16px; margin-left: 3px; font-weight: 500; }
.pv-hero-sub { font-size: 11.5px; color: var(--ink-soft); margin-top: 6px; max-width: 180px; }

/* Seal */
.pv-seal { position: relative; width: 88px; height: 88px; border: none; background: none; cursor: pointer; transform: rotate(-7deg); }
.pv-seal-ring {
  position: absolute; inset: 0; border-radius: 50%;
  background: repeating-conic-gradient(var(--brass) 0deg 9deg, transparent 9deg 18deg);
  opacity: 0.55;
}
.pv-seal-face {
  position: absolute; inset: 7px; border-radius: 50%; background: var(--card);
  border: 1.5px solid var(--brass); display: flex; flex-direction: column; align-items: center; justify-content: center;
  color: var(--brass-deep); box-shadow: inset 0 0 0 3px rgba(169,129,47,0.12);
}
.pv-seal-text { font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; font-weight: 600; letter-spacing: 0.06em; margin-top: 3px; }
.pv-seal-sub { font-size: 6.5px; letter-spacing: 0.08em; color: var(--ink-soft); margin-top: 1px; }
.pv-seal:focus-visible { outline: 2px solid var(--brass); outline-offset: 3px; border-radius: 50%; }
@media (prefers-reduced-motion: no-preference) {
  .pv-seal { animation: pv-stamp 0.5s cubic-bezier(.2,1.6,.4,1) both; }
}
@keyframes pv-stamp { 0% { transform: rotate(-7deg) scale(1.4); opacity: 0; } 100% { transform: rotate(-7deg) scale(1); opacity: 1; } }

/* KPI row */
.pv-kpirow { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: var(--hairline); border: 1px solid var(--hairline); border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
.pv-kpicell { background: var(--card); padding: 12px 10px; }
.pv-kpicell.is-warn { background: #f6ece8; }
.pv-kpicell-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft); margin-bottom: 5px; }
.pv-kpicell-value { font-size: 17px; font-weight: 600; }
.pv-kpicell-sub { font-size: 10px; color: var(--ink-soft); margin-top: 2px; }

/* Panels */
.pv-panel { margin-bottom: 8px; }
.pv-panel-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; flex-wrap: wrap; gap: 4px; }
.pv-panel-head-tight { margin-top: 20px; margin-bottom: 10px; }
.pv-panel-head h2 { font-family: 'Source Serif 4', serif; font-size: 19px; margin: 0; font-weight: 600; }
.pv-panel-head h3 { font-family: 'Source Serif 4', serif; font-size: 15px; margin: 0; font-weight: 600; }
.pv-panel-note { font-size: 11.5px; color: var(--ink-soft); }

/* Deltas (why below target) */
.pv-delta-row { display: grid; grid-template-columns: 150px 1fr 150px; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--hairline); }
.pv-delta-label { font-size: 13px; font-weight: 500; }
.pv-delta-bars { display: flex; flex-direction: column; gap: 4px; }
.pv-delta-track { height: 6px; background: rgba(20,33,61,0.08); border-radius: 3px; overflow: hidden; }
.pv-delta-fill { height: 100%; border-radius: 3px; }
.pv-delta-fill-prior { background: var(--ink-soft); opacity: 0.45; }
.pv-delta-fill-current { background: var(--risk); }
.pv-delta-figures { display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-size: 12.5px; }
.pv-delta-chip { display: inline-flex; align-items: center; gap: 3px; background: #f6ece8; color: var(--risk); padding: 2px 7px; border-radius: 20px; font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 600; }
.pv-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 11px; color: var(--ink-soft); }
.pv-swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
.pv-swatch-prior { background: var(--ink-soft); opacity: 0.45; }
.pv-swatch-current { background: var(--risk); }

/* Insights */
.pv-insights { display: flex; flex-direction: column; gap: 1px; background: var(--hairline); border: 1px solid var(--hairline); border-radius: 8px; overflow: hidden; }
.pv-insight-card { background: var(--card); display: flex; gap: 12px; padding: 13px 14px; align-items: flex-start; }
.pv-insight-index { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--brass-deep); font-weight: 600; padding-top: 1px; }
.pv-insight-card p { margin: 0; font-size: 13.5px; line-height: 1.5; }

/* Funnel */
.pv-funnel { display: flex; flex-direction: column; }
.pv-funnel-row { display: grid; grid-template-columns: 92px 1fr 52px 52px; align-items: center; gap: 12px; padding: 7px 0; }
.pv-funnel-label { font-size: 12.5px; font-weight: 500; }
.pv-funnel-bars { display: flex; flex-direction: column; gap: 3px; }
.pv-funnel-track { height: 8px; background: rgba(20,33,61,0.06); border-radius: 2px; overflow: hidden; }
.pv-funnel-fill { height: 100%; }
.pv-funnel-fill-prior { background: var(--ink-soft); opacity: 0.4; }
.pv-funnel-fill-current { background: var(--brass); }
.pv-funnel-count { font-size: 12.5px; text-align: right; }
.pv-funnel-conv { font-size: 11.5px; text-align: right; color: var(--ink-soft); }
.pv-callout { display: flex; gap: 10px; background: #eef2f0; border: 1px solid rgba(60,110,79,0.25); border-radius: 8px; padding: 12px 14px; margin-top: 16px; color: var(--ink); }
.pv-callout svg { flex-shrink: 0; margin-top: 2px; color: var(--good); }
.pv-callout p { margin: 0; font-size: 12.5px; line-height: 1.55; }

/* Departments table */
.pv-table { border: 1px solid var(--hairline); border-radius: 8px; overflow: hidden; }
.pv-table-header, .pv-table-row {
  display: grid; grid-template-columns: 1fr 0.7fr 0.7fr 0.7fr 0.9fr 0.9fr 20px;
  align-items: center; gap: 8px; padding: 10px 14px;
}
.pv-table-header { background: rgba(20,33,61,0.05); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); }
.pv-table-group:not(:last-child) { border-bottom: 1px solid var(--hairline); }
.pv-table-row { width: 100%; background: var(--card); border: none; cursor: pointer; font-size: 13px; text-align: left; font-family: inherit; color: inherit; }
.pv-table-row:hover { background: rgba(20,33,61,0.03); }
.pv-table-row:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
.pv-dept-name { font-weight: 600; }
.pv-rate { font-weight: 600; }
.pv-chevron { transition: transform 0.15s ease; color: var(--ink-soft); }
.pv-chevron.is-open { transform: rotate(180deg); }
.pv-table-detail { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 14px 18px 18px; background: rgba(20,33,61,0.025); }
.pv-detailstat-value { font-size: 16px; font-weight: 600; }
.pv-detailstat.is-warn .pv-detailstat-value { color: var(--risk); }
.pv-detailstat-label { font-size: 10.5px; color: var(--ink-soft); margin-top: 2px; }
.pv-detail-vs-median { grid-column: 1 / -1; font-size: 12px; color: var(--ink-soft); border-top: 1px solid var(--hairline); padding-top: 10px; margin-top: 2px; }
.pv-detail-vs-median strong { display: inline-flex; align-items: center; gap: 3px; margin-left: 4px; }

/* Data quality */
.pv-quality-strip { display: flex; gap: 28px; align-items: center; padding-bottom: 18px; border-bottom: 1px solid var(--hairline); margin-bottom: 4px; flex-wrap: wrap; }
.pv-quality-score { text-align: center; flex-shrink: 0; }
.pv-quality-ring {
  --pct: 83; width: 76px; height: 76px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: conic-gradient(var(--brass) calc(var(--pct) * 1%), rgba(20,33,61,0.09) 0);
  font-size: 18px; font-weight: 600;
}
.pv-quality-ring::before { content: ''; position: absolute; }
.pv-quality-ring span { background: var(--card); width: 58px; height: 58px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.pv-quality-status { font-size: 11px; text-transform: capitalize; color: var(--ink-soft); margin-top: 8px; }
.pv-quality-factors { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 10px; }
.pv-factor-row { display: grid; grid-template-columns: 130px 1fr 44px; align-items: center; gap: 10px; }
.pv-factor-label { font-size: 12px; }
.pv-factor-track { height: 6px; background: rgba(20,33,61,0.08); border-radius: 3px; overflow: hidden; }
.pv-factor-fill { height: 100%; background: var(--good); }
.pv-factor-value { font-size: 12px; text-align: right; }

.pv-issue-list { display: flex; flex-direction: column; gap: 1px; background: var(--hairline); border: 1px solid var(--hairline); border-radius: 8px; overflow: hidden; }
.pv-issue-row { background: var(--card); display: flex; align-items: center; gap: 10px; padding: 11px 14px; font-size: 13px; }
.pv-issue-icon-warning { color: var(--brass-deep); }
.pv-issue-icon-critical { color: var(--risk); }
.pv-issue-icon-info { color: var(--ink-soft); }
.pv-severity-chip { margin-left: auto; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; padding: 3px 8px; border-radius: 20px; font-weight: 600; }
.pv-severity-critical { background: #f6ece8; color: var(--risk); }
.pv-severity-warning { background: #f5efdf; color: var(--brass-deep); }
.pv-severity-info { background: rgba(20,33,61,0.07); color: var(--ink-soft); }

/* Evidence modal */
.pv-modal-backdrop { position: fixed; inset: 0; background: rgba(20,33,61,0.45); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 20px; }
.pv-modal { position: relative; background: var(--card); border-radius: 12px; max-width: 380px; width: 100%; padding: 24px; border: 1px solid var(--hairline); }
.pv-modal-close { position: absolute; top: 14px; right: 14px; background: none; border: none; cursor: pointer; color: var(--ink-soft); }
.pv-modal-close:focus-visible { outline: 2px solid var(--brass); border-radius: 4px; }
.pv-modal-eyebrow { display: flex; align-items: center; gap: 6px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--brass-deep); margin-bottom: 8px; }
.pv-modal h3 { font-family: 'Source Serif 4', serif; margin: 0 0 14px; font-size: 19px; }
.pv-modal-dl { margin: 0; }
.pv-modal-dl dt { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--ink-soft); margin-top: 12px; }
.pv-modal-dl dt:first-child { margin-top: 0; }
.pv-modal-dl dd { margin: 3px 0 0; font-size: 13px; line-height: 1.5; }
.pv-modal-footnote { font-size: 11.5px; color: var(--ink-soft); line-height: 1.5; margin: 16px 0 0; padding-top: 14px; border-top: 1px solid var(--hairline); }

/* Responsive */
@media (max-width: 640px) {
  .pv-root { padding: 18px 14px 26px; border-radius: 0; }
  .pv-masthead { flex-direction: column; align-items: flex-start; gap: 10px; }
  .pv-datathrough { text-align: left; }
  .pv-institution { font-size: 22px; }
  .pv-kpirow { grid-template-columns: repeat(2, 1fr); }
  .pv-hero { gap: 18px; }
  .pv-hero-numbers { gap: 20px; }
  .pv-hero-value { font-size: 30px; }
  .pv-delta-row { grid-template-columns: 1fr; gap: 6px; }
  .pv-delta-figures { justify-content: flex-start; }
  .pv-table-header { display: none; }
  .pv-table-row { grid-template-columns: 1fr 1fr 1fr 20px; }
  .pv-table-row > span:nth-child(3), .pv-table-row > span:nth-child(4) { display: none; }
  .pv-table-detail { grid-template-columns: repeat(2, 1fr); }
  .pv-funnel-row { grid-template-columns: 76px 1fr 40px; }
  .pv-funnel-conv { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .pv-seal { animation: none; }
  .pv-tab, .pv-chevron { transition: none; }
}
`;

'use client';
import { useState } from 'react';

// ── Mock data mirroring demo/run-demo.ts computed output ──────────────────

const FORECAST = {
  current: 68.4,
  target: 82,
  low: 71,
  high: 78,
  pointEstimate: 74.3,
  confidence: 'MEDIUM',
  gapPoints: 13.6,
  requiredAdditionalPlacements: 47,
  totalEligibleStudents: 344,
  dataThrough: '2026-08-15',
  freshness: 'LIVE',
  modelVersion: 'blended-v2.1',
  method: 'BLENDED',
};

const GAP_STAGES = [
  { stage: 'APPLICATION_CONVERSION', label: 'Application → Interview', observed: 72, benchmark: 80, contributionStudents: 27, severity: 'HIGH' },
  { stage: 'JOINING_CONVERSION',     label: 'Accepted → Verified Join', observed: 81, benchmark: 88, contributionStudents: 14, severity: 'MEDIUM' },
  { stage: 'INTERVIEW_CONVERSION',   label: 'Interview → Offered',      observed: 63, benchmark: 66, contributionStudents:  7, severity: 'LOW' },
  { stage: 'OFFER_ACCEPTANCE',       label: 'Offered → Accepted',       observed: 89, benchmark: 91, contributionStudents:  4, severity: 'LOW' },
];

const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', id: 'cse', low: 78, high: 85, confidence: 'HIGH' },
  { name: 'Electronics & Communication',    id: 'ece', low: 61, high: 69, confidence: 'LOW' },
  { name: 'Information Technology',         id: 'it',  low: 74, high: 80, confidence: 'MEDIUM' },
  { name: 'Mechanical Engineering',         id: 'mech', dataAvailable: false, reason: 'insufficient_sample (n=12)' },
];

const SCENARIOS = [
  { label: 'Application +5%, Joining +3pts', low: 76, high: 83, baseline: 74.3, delta_low: +2, delta_high: +5, confidence: 'MEDIUM', caveat: 'Scenario estimate only. Assumes funnel independence and no capacity constraints.' },
  { label: 'Application +10%',               low: 79, high: 86, baseline: 74.3, delta_low: +5, delta_high: +8, confidence: 'LOW',    caveat: 'Large delta → lower confidence. Historical data may not support this rate of improvement.' },
  { label: '+5 new company drives',          low: 73, high: 79, baseline: 74.3, delta_low: +0, delta_high: +1, confidence: 'LOW',    caveat: 'Drive count is a coarse proxy. Actual impact depends on student-role fit and company response rate.' },
];

const RECOMMENDATIONS = [
  { id: 'r1', issue: '27 students lost at application stage vs. benchmark', affectedStudents: 27, potentialImpact: '+5–8 verified placements if conversion reaches benchmark', effortEstimate: 'MEDIUM', urgency: 0.9, impact: 0.8, feasibility: 0.7, confidence: 0.75, priorityScore: 0.38, actionOwner: 'TPO', evidence: ['Application conversion 72% vs 80% benchmark', 'Gap largest in ECE and Mech branches'] },
  { id: 'r2', issue: '14 students lost at joining confirmation stage', affectedStudents: 14, potentialImpact: '+8–12 verified placements if joining follow-up is tightened', effortEstimate: 'LOW', urgency: 0.8, impact: 0.7, feasibility: 0.85, confidence: 0.8, priorityScore: 0.38, actionOwner: 'TPO', evidence: ['Joining conversion 81% vs 88% benchmark', '7 joining records unverified per data-quality check'] },
  { id: 'r3', issue: '38 placement-ready students unmatched to any active opportunity', affectedStudents: 38, potentialImpact: 'Recoverable if 2–3 new drives opened in matched skill areas', effortEstimate: 'HIGH', urgency: 0.7, impact: 0.65, feasibility: 0.55, confidence: 0.6, priorityScore: 0.15, actionOwner: 'TPO', evidence: ['38 students with readiness ≥ 65 have no active matching drive', 'Largest skill gaps: Data Engineering, Cloud Infrastructure'] },
];

const OUTREACH = [
  { companyName: 'Infosys',      priority: 'HIGH',   score: 0.91, evidence: ['3 consecutive seasons of hiring', 'Relationship strength 0.82', '12 eligible students match their open skills'] },
  { companyName: 'Wipro',        priority: 'HIGH',   score: 0.87, evidence: ['Hired 18 last season', 'Relationship strength 0.76', 'Open roles match CSE batch profile'] },
  { companyName: 'Zoho Corp',    priority: 'MEDIUM', score: 0.74, evidence: ['Hired in 2024, no 2025 drive', 'High student skill match (Python, SQL)', 'Re-engagement opportunity'] },
  { companyName: 'Freshworks',   priority: 'MEDIUM', score: 0.68, evidence: ['New company, no historical data', 'Strong product-company fit for IT students', 'High interest score'] },
  { companyName: 'L&T Infotech', priority: 'LOW',    score: 0.51, evidence: ['2 seasons ago — recency low', 'Relationship strength 0.42'] },
];

const OPPORTUNITY_COVERAGE = {
  readyStudents: 198,
  matchedToActiveOpportunity: 160,
  unmatched: 38,
};

const STUDENT_OUTLOOK = {
  readinessTrend: 'IMPROVING',
  readinessScore: 71,
  eligibleActiveOpportunities: 4,
  recommendedTraining: ['System Design Fundamentals', 'SQL Advanced Queries'],
  message: 'You are eligible for 4 active drives. Your readiness score is above the placement-ready threshold. Focus on the recommended training to strengthen interview performance.',
};

// ── Style helpers ──────────────────────────────────────────────────────────

const CONF_COLOR = { HIGH: '#10b981', MEDIUM: '#f59e0b', LOW: '#f43f5e' };
const PRIORITY_COLOR = { HIGH: '#f43f5e', MEDIUM: '#f59e0b', LOW: '#94a3b8' };
const EFFORT_COLOR = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f43f5e', UNKNOWN: '#64748b' };
const SEV_COLOR = { HIGH: '#f43f5e', MEDIUM: '#f59e0b', LOW: '#94a3b8' };

function chip(text, color) {
  return (
    <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color, background: `${color}18`, border: `1px solid ${color}40`, padding: '2px 8px', borderRadius: 4 }}>
      {text}
    </span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '18px 16px', ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, color: '#5b8def', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14, fontFamily: "'IBM Plex Mono', monospace" }}>
      {children}
    </div>
  );
}

// ── Tab: Forecast ──────────────────────────────────────────────────────────

function ForecastTab() {
  const gapPct = ((FORECAST.target - FORECAST.current) / FORECAST.target * 100).toFixed(1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Current Placement', value: `${FORECAST.current}%`, sub: 'verified', color: '#f8fafc' },
          { label: 'Season Target',     value: `${FORECAST.target}%`,  sub: 'institutional',  color: '#5b8def' },
          { label: 'Forecast Range',    value: `${FORECAST.low}–${FORECAST.high}%`, sub: `point est. ${FORECAST.pointEstimate}%`, color: CONF_COLOR[FORECAST.confidence] },
          { label: 'Gap to Target',     value: `${FORECAST.gapPoints} pts`, sub: `${FORECAST.requiredAdditionalPlacements} more placements needed`, color: '#f43f5e' },
          { label: 'Confidence',        value: FORECAST.confidence, sub: FORECAST.method, color: CONF_COLOR[FORECAST.confidence] },
          { label: 'Data Through',      value: FORECAST.dataThrough, sub: FORECAST.freshness, color: FORECAST.freshness === 'LIVE' ? '#10b981' : '#f59e0b' },
        ].map((k) => (
          <Card key={k.label}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, fontFamily: "'IBM Plex Mono', monospace" }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>{k.sub}</div>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      <Card>
        <SectionLabel>Current vs Target vs Forecast</SectionLabel>
        <div style={{ position: 'relative', height: 32, background: 'rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${FORECAST.current}%`, background: '#3b82f6', borderRadius: 6 }} />
          <div style={{ position: 'absolute', left: `${FORECAST.low}%`, top: 0, height: '100%', width: `${FORECAST.high - FORECAST.low}%`, background: 'rgba(16,185,129,0.3)', border: '1px dashed #10b981' }} />
          <div style={{ position: 'absolute', left: `${FORECAST.target - 0.5}%`, top: 0, width: 2, height: '100%', background: '#ef4444' }} />
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
          {[['Current', '#3b82f6', `${FORECAST.current}%`], ['Forecast range', '#10b981', `${FORECAST.low}–${FORECAST.high}%`], ['Target', '#ef4444', `${FORECAST.target}%`]].map(([l, c, v]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
              <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
              {l}: <strong style={{ color: c }}>{v}</strong>
            </div>
          ))}
        </div>
      </Card>

      {/* Gap analysis */}
      <Card>
        <SectionLabel>Funnel Gap Analysis — Stage Contributions</SectionLabel>
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>
          Contributions computed one-at-a-time (other stages held at actual rates). They will not sum exactly to the total gap — interaction effects are surfaced explicitly, not hidden.
        </div>
        {GAP_STAGES.map((s) => (
          <div key={s.stage} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 100px', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${s.observed}%`, background: SEV_COLOR[s.severity], borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              <span style={{ color: '#f8fafc' }}>{s.observed}%</span> vs <span style={{ color: '#64748b' }}>{s.benchmark}%</span>
            </div>
            <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: SEV_COLOR[s.severity], fontWeight: 600 }}>
              ~{s.contributionStudents}
            </div>
            {chip(s.severity, SEV_COLOR[s.severity])}
          </div>
        ))}
      </Card>

      {/* Dept forecasts */}
      <Card>
        <SectionLabel>Department Forecasts</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {DEPARTMENTS.map((d) => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{d.name}</div>
              {d.dataAvailable === false ? (
                <span style={{ fontSize: 11, color: '#64748b', fontFamily: "'IBM Plex Mono', monospace" }}>— {d.reason}</span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", color: CONF_COLOR[d.confidence], fontWeight: 600 }}>{d.low}–{d.high}%</span>
                  {chip(d.confidence, CONF_COLOR[d.confidence])}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Tab: Scenarios ─────────────────────────────────────────────────────────

function ScenariosTab() {
  const [active, setActive] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
        What-if projections that modify one or more funnel conversion rates from the current baseline. Results are <strong style={{ color: '#f8fafc' }}>scenario estimates, not forecasts</strong> — confidence drops as deltas grow.
      </div>
      {SCENARIOS.map((s, i) => (
        <Card key={i} style={{ borderColor: active === i ? '#5b8def40' : 'rgba(255,255,255,0.08)', cursor: 'pointer' }}>
          <div onClick={() => setActive(active === i ? null : i)}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{s.label}</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontFamily: "'IBM Plex Mono', monospace", color: '#10b981', fontWeight: 700 }}>{s.low}–{s.high}%</span>
                {chip(s.confidence, CONF_COLOR[s.confidence])}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, marginTop: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Baseline: <strong style={{ color: '#94a3b8' }}>{s.baseline}%</strong></span>
              <span style={{ fontSize: 12, color: '#10b981' }}>Delta: +{s.delta_low}–+{s.delta_high} pts</span>
            </div>
          </div>
          {active === i && (
            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 12, color: '#fde68a', lineHeight: 1.6 }}>
              ⚠ {s.caveat}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Tab: Strategy ──────────────────────────────────────────────────────────

function StrategyTab() {
  const [selected, setSelected] = useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Opportunity coverage */}
      <Card>
        <SectionLabel>Opportunity Coverage</SectionLabel>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {[
            { label: 'Placement-ready students', value: OPPORTUNITY_COVERAGE.readyStudents, color: '#f8fafc' },
            { label: 'Matched to active drive',   value: OPPORTUNITY_COVERAGE.matchedToActiveOpportunity, color: '#10b981' },
            { label: 'No matching opportunity',   value: OPPORTUNITY_COVERAGE.unmatched, color: '#f43f5e' },
          ].map((k) => (
            <div key={k.label}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Recommendations */}
      <SectionLabel style={{ margin: 0 }}>Strategic Recommendations — Ranked by Priority Score</SectionLabel>
      {RECOMMENDATIONS.map((r) => (
        <Card key={r.id} style={{ cursor: 'pointer', borderColor: selected === r.id ? '#5b8def40' : 'rgba(255,255,255,0.08)' }}>
          <div onClick={() => setSelected(selected === r.id ? null : r.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{r.issue}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{r.potentialImpact}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {chip(`effort: ${r.effortEstimate}`, EFFORT_COLOR[r.effortEstimate])}
                {chip(`owner: ${r.actionOwner}`, '#5b8def')}
                <span style={{ fontSize: 13, fontFamily: "'IBM Plex Mono', monospace", color: '#f8fafc', fontWeight: 700 }}>
                  {(r.priorityScore * 100).toFixed(0)}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              {[['urgency', r.urgency], ['impact', r.impact], ['feasibility', r.feasibility], ['confidence', r.confidence]].map(([label, val]) => (
                <div key={label}>
                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 2 }}>{label}</div>
                  <div style={{ width: 48, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <div style={{ height: '100%', width: `${val * 100}%`, background: val >= 0.7 ? '#10b981' : val >= 0.5 ? '#f59e0b' : '#f43f5e', borderRadius: 2 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {selected === r.id && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.evidence.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '5px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>· {e}</div>
              ))}
            </div>
          )}
        </Card>
      ))}

      {/* Outreach */}
      <Card>
        <SectionLabel>Company Outreach Priorities</SectionLabel>
        <div style={{ fontSize: 12, color: '#475569', marginBottom: 14 }}>
          Scores are a recommendation, not a fact about future hiring intent. All rankings carry this disclaimer.
        </div>
        {OUTREACH.map((o) => (
          <div key={o.companyName} style={{ display: 'grid', gridTemplateColumns: '100px 1fr auto', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'start' }}>
            {chip(o.priority, PRIORITY_COLOR[o.priority])}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{o.companyName}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{o.evidence[0]}</div>
            </div>
            <div style={{ fontSize: 14, fontFamily: "'IBM Plex Mono', monospace", color: '#f8fafc', fontWeight: 600, textAlign: 'right' }}>
              {(o.score * 100).toFixed(0)}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ── Tab: Student View ──────────────────────────────────────────────────────

function StudentTab() {
  const trendColor = { IMPROVING: '#10b981', STEADY: '#f59e0b', DECLINING: '#f43f5e' };
  const s = STUDENT_OUTLOOK;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
        Student-facing view — restricted to the five personal fields in <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>PersonalOutlook</code>. No institutional strategy data, no other students' records.
      </div>

      <Card>
        <SectionLabel>Your Personal Outlook</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Readiness Score</div>
            <div style={{ fontSize: 32, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: '#f8fafc' }}>{s.readinessScore}</div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 6 }}>
              <div style={{ height: '100%', width: `${s.readinessScore}%`, background: '#5b8def', borderRadius: 2 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Readiness Trend</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: trendColor[s.readinessTrend] }}>{s.readinessTrend}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Active Opportunities</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: '#10b981' }}>{s.eligibleActiveOpportunities}</div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, padding: '12px 14px', background: 'rgba(91,141,239,0.06)', border: '1px solid rgba(91,141,239,0.15)', borderRadius: 8, marginBottom: 14 }}>
          {s.message}
        </div>

        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>Recommended Training</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {s.recommendedTraining.map((t) => (
            <div key={t} style={{ fontSize: 13, color: '#f8fafc', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, borderLeft: '3px solid #5b8def' }}>{t}</div>
          ))}
        </div>
      </Card>

      <Card style={{ borderColor: 'rgba(244,63,94,0.2)' }}>
        <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.6 }}>
          🔒 <strong>RBAC boundary enforced:</strong> Attempts to query institutional forecasts, target gaps, or other students' data from a student caller context throw an <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>AuthorizationError</code> — verified in the demo walkthrough and tested in <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>tests/</code>.
        </div>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TABS = [
  { id: 'forecast',  label: 'Forecast & Gap' },
  { id: 'scenarios', label: 'What-If Scenarios' },
  { id: 'strategy',  label: 'Strategy & Recommendations' },
  { id: 'student',   label: 'Student View' },
];

export default function ForecastStrategyPage() {
  const [tab, setTab] = useState('forecast');

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", padding: '28px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, color: '#5b8def', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: "'IBM Plex Mono', monospace" }}>PrepVista · Part 15</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>Placement Forecasting & Strategy Engine</div>
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 680 }}>
          Two independent backtested forecast methods · target-vs-actual gap analysis · what-if scenario engine · opportunity intelligence · explainable recommendation engine · hard RBAC boundary (student sees only personal fields).
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 14, whiteSpace: 'nowrap', color: tab === t.id ? '#f8fafc' : '#64748b', fontWeight: tab === t.id ? 600 : 400, borderBottom: tab === t.id ? '2px solid #5b8def' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'forecast'  && <ForecastTab />}
      {tab === 'scenarios' && <ScenariosTab />}
      {tab === 'strategy'  && <StrategyTab />}
      {tab === 'student'   && <StudentTab />}
    </div>
  );
}

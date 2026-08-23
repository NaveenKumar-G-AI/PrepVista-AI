'use client';
import { useState } from 'react';

// ── Action catalog (from PART14_INTEGRATION.md section 2)
const ACTION_CATALOG = [
  { id: 'list_unapplied_students',           category: 'APPLICATION',   risk: 'READ',            label: 'List Unapplied Students',        confirmation: 'none',           description: 'Lists all eligible students who have not applied to a given drive.' },
  { id: 'prepare_application_reminder',      category: 'COMMUNICATION', risk: 'PREPARE',          label: 'Prepare Application Reminder',   confirmation: 'none',           description: 'Drafts a reminder message for unapplied students. No send — preview only.' },
  { id: 'create_tpo_task',                   category: 'TASK',          risk: 'LOW_RISK_WRITE',   label: 'Create TPO Task',                confirmation: 'policy-driven',  description: 'Creates an internal task for the TPO team. Auto-executes for human-initiated calls.' },
  { id: 'notify_student_result_published',   category: 'COMMUNICATION', risk: 'LOW_RISK_WRITE',   label: 'Notify Student (Result)',         confirmation: 'policy-driven',  description: 'Sends a result-published notification (capped at 1 recipient for automation rules).' },
  { id: 'send_application_reminder',         category: 'COMMUNICATION', risk: 'SENSITIVE_WRITE',  label: 'Send Application Reminder',      confirmation: 'always',         description: 'Routes through the communication service (Part 9). Requires explicit human confirmation.' },
  { id: 'assign_training_to_cohort',         category: 'TRAINING',      risk: 'SENSITIVE_WRITE',  label: 'Assign Training to Cohort',      confirmation: 'always',         description: 'Assigns training to a student cohort. Escalates to HIGH_RISK above 200 students.' },
  { id: 'publish_interview_results',         category: 'INTERVIEW',     risk: 'HIGH_RISK',        label: 'Publish Interview Results',      confirmation: 'always',         description: 'TPO_HEAD only. Requires typed confirmation reason + all results reviewed.' },
  { id: 'accept_offer',                      category: 'OFFER',         risk: 'HIGH_RISK',        label: 'Accept Offer',                   confirmation: 'always',         description: 'Student only — own record only. Irreversible.' },
];

const RISK_COLOR = {
  READ:           { bg: 'rgba(59,130,246,0.12)',  border: '#3b82f6', text: '#93c5fd' },
  PREPARE:        { bg: 'rgba(168,85,247,0.12)', border: '#a855f7', text: '#d8b4fe' },
  LOW_RISK_WRITE: { bg: 'rgba(16,185,129,0.12)', border: '#10b981', text: '#6ee7b7' },
  SENSITIVE_WRITE:{ bg: 'rgba(245,158,11,0.12)', border: '#f59e0b', text: '#fde68a' },
  HIGH_RISK:      { bg: 'rgba(239,68,68,0.12)',  border: '#ef4444', text: '#fca5a5' },
};

const CATEGORY_COLOR = {
  APPLICATION:   '#3b82f6',
  COMMUNICATION: '#a855f7',
  TASK:          '#10b981',
  TRAINING:      '#f59e0b',
  INTERVIEW:     '#ef4444',
  OFFER:         '#f43f5e',
};

// ── Demo walkthrough (mirrors demo.ts output)
const DEMO_STEPS = [
  {
    id: 'step-1',
    who: 'tpo',
    text: 'Show me all eligible students who haven\'t applied to ABC.',
    action: 'list_unapplied_students',
    phase: null,
  },
  {
    id: 'step-2',
    who: 'ai',
    text: '83 eligible students found for ABC Technologies (Software Engineer). 23 are high-readiness (75+). Returning list.',
    action: null,
    phase: 'EXECUTE',
    result: { status: 'SUCCEEDED', summary: '83 students returned. No confirmation needed (READ action).' },
  },
  {
    id: 'step-3',
    who: 'tpo',
    text: 'Prepare a reminder for them.',
    action: 'send_application_reminder',
    phase: null,
  },
  {
    id: 'step-4',
    who: 'ai',
    text: 'Action proposed. Preview ready — this is a SENSITIVE_WRITE action and requires your explicit confirmation before sending.',
    action: 'send_application_reminder',
    phase: 'PROPOSED',
    preview: {
      headline: 'Send in-app reminder to 83 students for ABC Technologies drive',
      details: ['Channel: in-app', 'Recipients: 83 (unapplied, eligible)', 'Message: "Applications for ABC Technologies (Software Engineer) close today at 6 PM."'],
      irreversible: false,
    },
  },
  {
    id: 'step-5',
    who: 'tpo',
    text: '[Confirm Send]',
    action: null,
    phase: 'CONFIRMED',
  },
  {
    id: 'step-6',
    who: 'ai',
    text: 'Reminder sent successfully.',
    action: null,
    phase: 'SUCCEEDED',
    result: { status: 'SUCCEEDED', summary: '83 sent, 81 delivered, 2 failed. Audit entry written.' },
  },
  {
    id: 'step-7',
    who: 'tpo',
    text: 'Publish the interview results for Drive XYZ. Reason: All 37 results reviewed and finalized by placement committee.',
    action: 'publish_interview_results',
    phase: null,
  },
  {
    id: 'step-8',
    who: 'ai',
    text: 'HIGH_RISK action proposed. Precondition check: all results reviewed ✓. Typed reason recorded. Awaiting confirmation.',
    action: 'publish_interview_results',
    phase: 'PROPOSED',
    preview: {
      headline: 'Publish all 37 interview results for Drive XYZ (irreversible)',
      details: ['37 results will become visible to students', 'Action is irreversible once executed', 'Confirmation reason: "All 37 results reviewed and finalized by placement committee."'],
      irreversible: true,
    },
  },
  {
    id: 'step-9',
    who: 'tpo',
    text: '[Confirm Publish — Irreversible]',
    action: null,
    phase: 'CONFIRMED',
  },
  {
    id: 'step-10',
    who: 'ai',
    text: 'Published.',
    action: null,
    phase: 'SUCCEEDED',
    result: { status: 'SUCCEEDED', summary: '37 results published. Students notified. Audit entry written.' },
  },
];

const PHASE_STYLE = {
  PROPOSED:  { color: '#fde68a', bg: 'rgba(245,158,11,0.12)', label: 'PROPOSED' },
  CONFIRMED: { color: '#93c5fd', bg: 'rgba(59,130,246,0.12)', label: 'CONFIRMED' },
  EXECUTE:   { color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', label: 'EXECUTING' },
  SUCCEEDED: { color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)', label: 'SUCCEEDED' },
};

function PipelineDiagram() {
  const stages = [
    { label: 'Propose', sub: 'Input + schema validation' },
    { label: 'Validate', sub: 'Permission · Policy · Preconditions' },
    { label: 'Preview', sub: 'Impact + risk computed' },
    { label: 'Confirm', sub: 'Human approval required' },
    { label: 'Execute', sub: 'Idempotent write + audit' },
    { label: 'Result', sub: 'Succeeded / Partial / Failed' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', padding: '4px 0 16px' }}>
      {stages.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#f8fafc' }}>{s.label}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, maxWidth: 90 }}>{s.sub}</div>
          </div>
          {i < stages.length - 1 && (
            <div style={{ fontSize: 16, color: '#334155', margin: '0 4px', flexShrink: 0 }}>→</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ActionCard({ action, onClick, selected }) {
  const risk = RISK_COLOR[action.risk] || RISK_COLOR.READ;
  const catColor = CATEGORY_COLOR[action.category] || '#64748b';
  return (
    <div
      onClick={() => onClick(action)}
      style={{ background: selected ? '#1e293b' : '#0f172a', border: `1px solid ${selected ? '#5b8def' : 'rgba(255,255,255,0.08)'}`, borderLeft: `3px solid ${catColor}`, borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc' }}>{action.label}</div>
        <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: risk.text, background: risk.bg, border: `1px solid ${risk.border}`, padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
          {action.risk.replace('_', ' ')}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{action.description}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: catColor, background: `${catColor}18`, padding: '2px 7px', borderRadius: 12 }}>{action.category}</span>
        <span style={{ fontSize: 10, color: '#64748b', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 12 }}>
          confirmation: {action.confirmation}
        </span>
      </div>
    </div>
  );
}

function PreviewCard({ preview }) {
  return (
    <div style={{ background: '#1e293b', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, padding: '14px 16px', marginTop: 10 }}>
      <div style={{ fontSize: 11, color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Action Preview</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#f8fafc', marginBottom: 10 }}>{preview.headline}</div>
      {preview.details.map((d, i) => (
        <div key={i} style={{ fontSize: 13, color: '#94a3b8', padding: '4px 0', borderBottom: i < preview.details.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
          · {d}
        </div>
      ))}
      {preview.irreversible && (
        <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px' }}>
          ⚠ This action is irreversible once executed.
        </div>
      )}
    </div>
  );
}

export default function ActionEnginePage() {
  const [activeTab, setActiveTab] = useState('catalog');
  const [selectedAction, setSelectedAction] = useState(null);
  const [demoStep, setDemoStep] = useState(0);

  const shownSteps = DEMO_STEPS.slice(0, demoStep);
  const nextStep = DEMO_STEPS[demoStep];

  const TABS = [
    { id: 'catalog', label: 'Action Catalog' },
    { id: 'pipeline', label: 'Pipeline Architecture' },
    { id: 'demo', label: 'TPO Walkthrough Demo' },
  ];

  return (
    <div style={{ background: '#020617', minHeight: '100vh', color: '#f8fafc', fontFamily: "'Inter', -apple-system, sans-serif", padding: '28px 24px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, color: '#5b8def', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>PrepVista · Part 14</div>
        <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>AI Action Engine</div>
        <div style={{ fontSize: 14, color: '#64748b', maxWidth: 600 }}>
          Human-in-the-loop, permission-first action execution. Every consequential action passes through: propose → validate → preview → confirm → execute → audit.
        </div>
      </div>

      {/* Risk Level Legend */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {Object.entries(RISK_COLOR).map(([level, style]) => (
          <span key={level} style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: style.text, background: style.bg, border: `1px solid ${style.border}`, padding: '3px 10px', borderRadius: 4 }}>
            {level.replace(/_/g, ' ')}
          </span>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 16px', fontSize: 14, color: activeTab === t.id ? '#f8fafc' : '#64748b', fontWeight: activeTab === t.id ? 600 : 400, borderBottom: activeTab === t.id ? '2px solid #5b8def' : '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Catalog ── */}
      {activeTab === 'catalog' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedAction ? '1fr 1fr' : '1fr', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ACTION_CATALOG.map((a) => (
              <ActionCard key={a.id} action={a} onClick={(ac) => setSelectedAction(ac.id === selectedAction?.id ? null : ac)} selected={selectedAction?.id === a.id} />
            ))}
          </div>

          {selectedAction && (
            <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 18px', position: 'sticky', top: 24, alignSelf: 'start' }}>
              <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Action Detail</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', marginBottom: 6 }}>{selectedAction.label}</div>
              <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace", color: '#64748b', marginBottom: 14 }}>{selectedAction.id}</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16, lineHeight: 1.6 }}>{selectedAction.description}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Category', selectedAction.category],
                  ['Risk Level', selectedAction.risk],
                  ['Confirmation', selectedAction.confirmation],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span style={{ color: '#f8fafc', fontFamily: "'IBM Plex Mono', monospace" }}>{value}</span>
                  </div>
                ))}
              </div>

              {(selectedAction.risk === 'SENSITIVE_WRITE' || selectedAction.risk === 'HIGH_RISK') && (
                <div style={{ marginTop: 14, fontSize: 12, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '8px 10px', lineHeight: 1.5 }}>
                  Human confirmation is required unconditionally. No policy setting or automation rule can disable this.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Pipeline ── */}
      {activeTab === 'pipeline' && (
        <div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 1.6 }}>
            Every action — regardless of risk level — passes through all six stages. Higher-risk actions add additional guards at each stage.
          </div>
          <PipelineDiagram />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginTop: 8 }}>
            {[
              { stage: '1. Propose', desc: 'Input validated against the action\'s schema. institutionId and userId stamped from the authenticated context — never from client input. Idempotency key computed and persisted.' },
              { stage: '2. Validate', desc: 'checkPermission → checkPolicy → checkPreconditions → computeRisk → first preview built. Any failure leaves the action in FAILED with a recorded reason.' },
              { stage: '3. Preview', desc: 'Impact and risk surface to the TPO. Preview is rebuilt on demand (e.g. UI reopening a pending action). Side-effect free by contract.' },
              { stage: '4. Confirm', desc: 'The only path to CONFIRMED. Rejects expired previews (STALE_CONFIRMATION). For SENSITIVE/HIGH_RISK, rebuilds preview and hashes it against what the user saw (STALE_DATA check).' },
              { stage: '5. Execute', desc: 'Idempotency cache checked first — retries return the cached result. Requires correct pre-state, calls execute(), derives SUCCEEDED / PARTIALLY_SUCCEEDED / FAILED from real counts.' },
              { stage: '6. Audit', desc: 'Every stage writes to the append-only audit log with actor, role, session, and before/after status. The log is never modified after write.' },
            ].map((item) => (
              <div key={item.stage} style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#5b8def', marginBottom: 6 }}>{item.stage}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Demo Walkthrough ── */}
      {activeTab === 'demo' && (
        <div>
          <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
            Mirrors the verified <code style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>npm run demo</code> output from <code style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>src/demo.ts</code>. Click <strong style={{ color: '#f8fafc' }}>Next Step</strong> to walk through the TPO→AI action flow.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {shownSteps.map((step) => {
              const phaseStyle = step.phase ? PHASE_STYLE[step.phase] : null;
              return (
                <div key={step.id} style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 14, animation: 'fadeIn 0.3s ease' }}>
                  <div style={{ fontSize: 11, fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase', color: step.who === 'tpo' ? '#f8fafc' : '#5b8def', paddingTop: 3, fontWeight: step.who === 'tpo' ? 600 : 400 }}>
                    {step.who === 'tpo' ? 'TPO' : 'AI'}
                  </div>
                  <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '12px 14px' }}>
                    {phaseStyle && (
                      <span style={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", color: phaseStyle.color, background: phaseStyle.bg, padding: '2px 8px', borderRadius: 4, marginBottom: 8, display: 'inline-block' }}>
                        {phaseStyle.label}
                      </span>
                    )}
                    <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.55, marginTop: phaseStyle ? 6 : 0 }}>{step.text}</div>
                    {step.preview && <PreviewCard preview={step.preview} />}
                    {step.result && (
                      <div style={{ marginTop: 10, fontSize: 12, color: '#6ee7b7', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6, padding: '6px 10px' }}>
                        ✓ {step.result.summary}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {nextStep ? (
            <button onClick={() => setDemoStep(demoStep + 1)} style={{ background: '#5b8def', color: '#0b1420', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              ▸ {nextStep.who === 'tpo' ? `TPO: "${nextStep.text}"` : 'Next Step'}
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 14, color: '#6ee7b7' }}>✓ Demo complete — all actions executed and audited.</div>
              <button onClick={() => setDemoStep(0)} style={{ background: 'transparent', color: '#64748b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

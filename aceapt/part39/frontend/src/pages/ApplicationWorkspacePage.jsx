import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { SectionCard, StagePill, Badge, LoadingState, ErrorState, Button } from '../components/shared/UI.jsx';

const TRACKABLE_STAGES = ['SAVED', 'RESEARCHING', 'PREPARING', 'APPLIED', 'ASSESSMENT', 'RECRUITER_CONTACT', 'INTERVIEW_1', 'INTERVIEW_2', 'FINAL_ROUND'];
const STAGE_LABELS = {
  SAVED: 'Saved', RESEARCHING: 'Researching', PREPARING: 'Preparing', APPLIED: 'Applied', ASSESSMENT: 'Assessment',
  RECRUITER_CONTACT: 'Recruiter contact', INTERVIEW_1: 'Interview 1', INTERVIEW_2: 'Interview 2', FINAL_ROUND: 'Final round',
};
const OUTCOMES = [
  { key: 'OFFER', label: 'Offer received' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'WITHDRAWN', label: 'Withdrawn' },
  { key: 'CLOSED', label: 'Closed / no longer active' },
];

export default function ApplicationWorkspacePage() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [strategy, setStrategy] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [draftingKey, setDraftingKey] = useState(null);

  const load = useCallback(() => {
    Promise.all([api.getApplication(id), api.getStrategy(id)])
      .then(([app, strat]) => { setApplication(app); setStrategy(strat); })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleStage(stage) {
    setBusy(stage);
    try { await api.setStage(id, stage); load(); } finally { setBusy(null); }
  }

  async function handleOutcome(outcome) {
    setBusy(outcome);
    try { await api.recordOutcome(id, outcome); load(); } finally { setBusy(null); }
  }

  async function handleResumeSelect(resumeId) {
    await api.updateApplication(id, { resume_id: resumeId });
    load();
  }

  async function handleDraft(docType, questionKey) {
    const key = questionKey || docType;
    setDraftingKey(key);
    try {
      await api.generateDocument(id, docType, questionKey);
      const strat = await api.getStrategy(id);
      setStrategy(strat);
    } finally {
      setDraftingKey(null);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!application || !strategy) return <LoadingState label="Loading application workspace" />;

  const answerByQuestion = new Map(strategy.documents.filter((d) => d.doc_type === 'ANSWER').map((d) => [d.question, d]));
  const recruiterMessage = strategy.documents.find((d) => d.doc_type === 'RECRUITER_MESSAGE');
  const isPreApplied = ['SAVED', 'RESEARCHING', 'PREPARING'].includes(application.stage);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Link to="/applications" className="text-xs font-mono text-ink-faint hover:text-ink">&larr; Applications</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="font-display text-3xl">{application.opportunity?.role}</h1>
            <p className="text-ink-soft mt-1">{application.opportunity?.company}</p>
          </div>
          <StagePill stage={application.stage} />
        </div>
      </div>

      <SectionCard title="Positioning">
        <p className="text-sm text-ink leading-relaxed">{application.positioning_statement}</p>
        {strategy.emphasize.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1.5">Emphasize</p>
            <div className="flex flex-wrap gap-1.5">
              {strategy.emphasize.map((s) => <Badge key={s} tone="pine">{s}</Badge>)}
            </div>
          </div>
        )}
        {strategy.de_emphasize.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1.5">De-emphasize</p>
            <p className="text-xs text-ink-faint">Real, but less relevant here: {strategy.de_emphasize.join(', ')}.</p>
          </div>
        )}
      </SectionCard>

      <div className="grid sm:grid-cols-2 gap-4">
        <SectionCard title="Resume">
          <div className="space-y-2">
            {strategy.recommended_resumes.map((r) => (
              <label key={r.resume_id} className="flex items-center gap-3 rounded-xl border border-border-soft px-3 py-2.5 cursor-pointer has-[:checked]:border-ink/40 has-[:checked]:bg-ink/[0.03]">
                <input type="radio" name="resume" checked={strategy.selected_resume_id === r.resume_id} onChange={() => handleResumeSelect(r.resume_id)} />
                <span className="text-sm text-ink flex-1">{r.title}</span>
                <span className="text-xs font-mono text-ink-faint">match {r.score}</span>
              </label>
            ))}
            {strategy.recommended_resumes.length === 0 && <p className="text-sm text-ink-faint">No resumes on file yet.</p>}
          </div>
        </SectionCard>

        <SectionCard title="Best project">
          {strategy.best_project ? (
            <div>
              <p className="text-sm font-medium text-ink">{strategy.best_project.name}</p>
              <p className="text-sm text-ink-soft mt-1">{strategy.best_project.reason}</p>
            </div>
          ) : <p className="text-sm text-ink-faint">No strongly relevant project found.</p>}
          {strategy.secondary_projects?.length > 0 && (
            <p className="text-xs text-ink-faint mt-3">Also relevant: {strategy.secondary_projects.map((p) => p.name).join(', ')}</p>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Application questions" subtitle="Every draft is grounded in your recorded evidence and fully editable -- nothing is submitted automatically.">
        <div className="space-y-4">
          {strategy.question_types.map((q) => {
            const doc = answerByQuestion.get(q.key);
            return (
              <div key={q.key} className="border-b border-border-soft last:border-0 pb-4 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">{q.label}</p>
                  <Button variant="secondary" size="sm" onClick={() => handleDraft('ANSWER', q.key)} disabled={draftingKey === q.key}>
                    {draftingKey === q.key ? 'Drafting...' : doc ? 'Regenerate' : 'Draft answer'}
                  </Button>
                </div>
                {doc && (
                  <div className="mt-2">
                    <textarea readOnly value={doc.content} rows={3} className="w-full text-sm text-ink-soft bg-ink/[0.02] rounded-xl border border-border-soft px-3 py-2" />
                    {doc.flagged_claims?.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {doc.flagged_claims.map((f, i) => (
                          <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">&#9888; {f.reason}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Recruiter message">
        <Button variant="secondary" size="sm" onClick={() => handleDraft('RECRUITER_MESSAGE')} disabled={draftingKey === 'RECRUITER_MESSAGE'}>
          {draftingKey === 'RECRUITER_MESSAGE' ? 'Drafting...' : recruiterMessage ? 'Regenerate' : 'Draft message'}
        </Button>
        {recruiterMessage && (
          <div className="mt-3">
            <textarea readOnly value={recruiterMessage.content} rows={3} className="w-full text-sm text-ink-soft bg-ink/[0.02] rounded-xl border border-border-soft px-3 py-2" />
            {recruiterMessage.flagged_claims?.length > 0 && recruiterMessage.flagged_claims.map((f, i) => (
              <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-1.5">&#9888; {f.reason}</p>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Follow-up">
        {strategy.followups.length === 0 ? (
          <p className="text-sm text-ink-soft">No follow-up needed yet.</p>
        ) : (
          <div className="space-y-3">
            {strategy.followups.map((f) => (
              <div key={f.id} className="text-sm">
                <p className="text-ink">{f.reason}</p>
                <p className="text-ink-faint text-xs mt-1">via {f.channel}</p>
                <p className="text-ink-soft bg-ink/[0.03] rounded-xl px-3 py-2 mt-1.5">{f.message_draft}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={isPreApplied ? 'Submit' : 'Update stage'}
        subtitle="ACEAPT never submits an application for you -- this only updates your tracker after you apply on the company's site."
      >
        {isPreApplied ? (
          <Button onClick={() => handleStage('APPLIED')} disabled={busy === 'APPLIED'}>
            {busy === 'APPLIED' ? 'Updating...' : "I've submitted this application"}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {TRACKABLE_STAGES.filter((s) => s !== 'SAVED' && s !== 'RESEARCHING' && s !== 'PREPARING').map((s) => (
              <Button key={s} variant={application.stage === s ? 'primary' : 'secondary'} size="sm" onClick={() => handleStage(s)} disabled={busy === s}>
                {STAGE_LABELS[s]}
              </Button>
            ))}
          </div>
        )}

        {!isPreApplied && application.outcome === null && (
          <div className="mt-5 pt-5 border-t border-border-soft">
            <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-2">Record outcome</p>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <Button key={o.key} variant="secondary" size="sm" onClick={() => handleOutcome(o.key)} disabled={busy === o.key}>
                  {o.label}
                </Button>
              ))}
            </div>
          </div>
        )}
        {application.outcome && (
          <p className="text-sm text-ink-soft mt-4">Outcome recorded: <span className="font-medium text-ink">{application.outcome}</span></p>
        )}
      </SectionCard>
    </div>
  );
}

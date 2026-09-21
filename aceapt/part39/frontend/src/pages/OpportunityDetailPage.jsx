import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import {
  RECOMMENDATION_STYLES, RecommendationBadge, SafetyBadge, ConfidenceTag, MatchStatusIcon, FitDimensionBar,
  SectionCard, LoadingState, ErrorState, Button, Badge,
} from '../components/shared/UI.jsx';

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [opp, setOpp] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const load = useCallback(() => {
    api.getOpportunity(id).then(setOpp).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handlePrepare() {
    setStarting(true);
    try {
      const result = await api.startApplication(id);
      navigate(`/applications/${result.application.id}`);
    } catch (e) {
      setError(e.message);
      setStarting(false);
    }
  }

  async function handleSave() {
    const updated = await api.updateOpportunity(id, { status: opp.status === 'SAVED' ? 'NEW' : 'SAVED' });
    setOpp((prev) => ({ ...prev, ...updated }));
  }

  async function handleReanalyze() {
    setReanalyzing(true);
    try {
      const updated = await api.reanalyzeOpportunity(id);
      setOpp(updated);
    } finally {
      setReanalyzing(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!opp) return <LoadingState />;

  const a = opp.analysis;
  const recStyle = RECOMMENDATION_STYLES[a?.priority_recommendation] || RECOMMENDATION_STYLES.ANALYZING;

  return (
    <div className="space-y-6 pb-16">
      <div>
        <Link to="/opportunities" className="text-xs font-mono text-ink-faint hover:text-ink">&larr; Opportunities</Link>
        <div className="flex flex-wrap items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="font-display text-3xl">{opp.role || 'Untitled role'}</h1>
            <p className="text-ink-soft mt-1">{opp.company || 'Company not specified'}{opp.location ? ` -- ${opp.location}` : ''}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleSave}>{opp.status === 'SAVED' ? 'Saved' : 'Save'}</Button>
            <Button variant="ghost" size="sm" onClick={handleReanalyze} disabled={reanalyzing}>{reanalyzing ? 'Re-analyzing...' : 'Re-analyze'}</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs font-mono text-ink-faint">
          {opp.work_mode && opp.work_mode !== 'UNKNOWN' && <span>{opp.work_mode}</span>}
          {opp.seniority && opp.seniority !== 'UNKNOWN' && <span>&middot; {opp.seniority}</span>}
          {opp.compensation_text && <span>&middot; {opp.compensation_text}</span>}
          {opp.deadline && <span>&middot; Due {opp.deadline}</span>}
          <span>&middot; {opp.source_type.replace(/_/g, ' ').toLowerCase()}</span>
        </div>
      </div>

      {!a ? (
        <SectionCard title="Should I apply?">
          <p className="text-sm text-ink-soft">Analysis is still being prepared for this opportunity.</p>
        </SectionCard>
      ) : (
        <SectionCard title="Should I apply?">
          <div className="reasoning-thread space-y-5">
            <div className="thread-node is-positive">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display text-2xl sm:text-3xl">{recStyle.label}.</span>
                <RecommendationBadge recommendation={a.priority_recommendation} size="lg" />
              </div>
              <div className="mt-1"><ConfidenceTag confidence={a.confidence} /></div>
            </div>

            <div className="thread-node is-positive">
              <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1.5">Why</p>
              <ul className="space-y-1 text-sm text-ink">
                {a.why.map((w, i) => <li key={i} className="text-pine-700">&#10003; {w}</li>)}
              </ul>
            </div>

            {a.gaps.length > 0 && (
              <div className="thread-node is-caution">
                <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1.5">Gaps</p>
                <ul className="space-y-1 text-sm">
                  {a.gaps.map((g, i) => <li key={i} className="text-amber-700">&#9651; {g.explanation}</li>)}
                </ul>
              </div>
            )}

            <div className="thread-node">
              <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-1.5">Next action</p>
              <p className="text-sm text-ink">{a.next_action}</p>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-border-soft flex flex-wrap items-center gap-3">
            <Button onClick={handlePrepare} disabled={starting}>{starting ? 'Preparing...' : 'Prepare application'}</Button>
            <span className="text-xs text-ink-faint font-mono">Effort: {a.application_effort?.replace(/_/g, ' ').toLowerCase()}</span>
          </div>
        </SectionCard>
      )}

      {a && (
        <SectionCard title="Fit dimensions" subtitle="Separate, explainable dimensions -- never one black-box score.">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            <FitDimensionBar label="Career alignment" value={a.dimensions.career_alignment} band={a.dimensions.career_alignment_band} />
            <FitDimensionBar label="Capability fit" value={a.dimensions.capability_fit} band={a.dimensions.capability_fit_band} />
            <FitDimensionBar label="Evidence fit" value={a.dimensions.evidence_fit} band={a.dimensions.evidence_fit_band} />
            <FitDimensionBar label="Project relevance" value={a.dimensions.project_relevance} band={a.dimensions.project_relevance_band} />
            <FitDimensionBar label="Location fit" value={a.dimensions.location_fit} />
            <FitDimensionBar
              label="Opportunity quality"
              value={a.dimensions.opportunity_quality}
              band={a.dimensions.opportunity_quality >= 70 ? 'STRONG' : a.dimensions.opportunity_quality >= 40 ? 'MODERATE' : 'WEAK'}
            />
          </div>
        </SectionCard>
      )}

      {a && (
        <SectionCard title="Requirements & your evidence" subtitle="Every requirement mapped to what you can actually prove -- never just a keyword match.">
          <div className="divide-y divide-border-soft">
            {opp.requirements.map((r) => {
              const m = a.matches.find((mm) => mm.requirement_id === r.id);
              return (
                <div key={r.id} className="py-3 flex items-start gap-3">
                  <span className="mt-0.5"><MatchStatusIcon status={m?.match_status} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm text-ink font-medium">{r.skill_key || r.requirement_text}</p>
                      <Badge>{r.priority.toLowerCase()}</Badge>
                    </div>
                    {r.skill_key && <p className="text-xs text-ink-faint mt-0.5">{r.requirement_text}</p>}
                    <p className="text-sm text-ink-soft mt-1">{m?.explanation}</p>
                  </div>
                </div>
              );
            })}
            {opp.requirements.length === 0 && (
              <p className="text-sm text-ink-faint py-4">No specific requirements could be extracted from this posting yet -- try re-analyzing, or add the full job description text.</p>
            )}
          </div>
        </SectionCard>
      )}

      {a && (
        <div className="grid sm:grid-cols-2 gap-4">
          <SectionCard title="Your positioning">
            <p className="text-sm text-ink leading-relaxed">{opp.positioning_preview?.statement || 'Not enough evidence-backed skills to draft a positioning statement yet.'}</p>
            {opp.positioning_preview?.emphasize?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {opp.positioning_preview.emphasize.map((s) => <Badge key={s} tone="pine">{s}</Badge>)}
              </div>
            )}
          </SectionCard>
          <SectionCard title="Best project for this role">
            {a.best_project ? (
              <div>
                <p className="text-sm font-medium text-ink">{a.best_project.name}</p>
                <p className="text-sm text-ink-soft mt-1">{a.best_project_reason}</p>
                {a.secondary_projects?.length > 0 && (
                  <p className="text-xs text-ink-faint mt-3">Also relevant: {a.secondary_projects.map((p) => p.name).join(', ')}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-faint">No strongly relevant project found yet for this specific role.</p>
            )}
          </SectionCard>
        </div>
      )}

      {a && (
        <SectionCard title="Opportunity safety check" action={<SafetyBadge level={a.safety_concern_level} />}>
          {opp.safety_signals.length === 0 ? (
            <p className="text-sm text-ink-soft">No concern signals were detected. This isn't a guarantee -- always verify independently.</p>
          ) : (
            <ul className="space-y-2.5">
              {opp.safety_signals.map((s) => (
                <li key={s.id} className="text-sm">
                  <span className={`font-medium ${s.severity === 'HIGH' ? 'text-brick-700' : 'text-amber-700'}`}>{s.signal}.</span>{' '}
                  <span className="text-ink-soft">{s.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {opp.raw_jd_text && (
        <details className="rounded-2xl border border-border-soft bg-surface p-5">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">View original posting text</summary>
          <pre className="mt-3 text-xs text-ink-soft whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">{opp.raw_jd_text}</pre>
        </details>
      )}
    </div>
  );
}

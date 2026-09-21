import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { createSkillGraphClient } from '../api/skillGraphClient';
import type { RelatedEdge, RootCauseSignal, StudentSkillView } from '../api/types';
import { CONFIDENCE_LABEL, DOMAIN_META, STATE_META, formatCapability } from './theme';
import { RelationshipExplainer } from './RelationshipExplainer';

export interface SkillDetailPanelProps {
  client: ReturnType<typeof createSkillGraphClient>;
  studentId: string;
  skillCode: string;
  onClose: () => void;
  onOpenSkill: (code: string) => void;
}

interface DetailData {
  studentView: StudentSkillView | undefined;
  prerequisites: RelatedEdge[];
  dependents: RelatedEdge[];
  related: RelatedEdge[];
  rootCause: RootCauseSignal | null;
}

export function SkillDetailPanel({ client, studentId, skillCode, onClose, onOpenSkill }: SkillDetailPanelProps) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    Promise.all([client.getStudentGraph(studentId), client.getPrerequisites(skillCode), client.getDependents(skillCode), client.getRelated(skillCode), client.getRootCause(studentId, skillCode).catch(() => null)])
      .then(([graphRes, prereqRes, depRes, relRes, rootCause]) => {
        if (cancelled) return;
        setData({
          studentView: graphRes.skills.find((s) => s.code === skillCode),
          prerequisites: prereqRes.prerequisites,
          dependents: depRes.dependents,
          related: relRes.related,
          rootCause,
        });
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [client, studentId, skillCode]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-ink/30" role="dialog" aria-modal="true" aria-labelledby="detail-panel-heading" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-paper p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="mb-4 flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <X size={16} /> Close
        </button>

        {error && <p className="text-sm text-warn">Couldn't load this skill: {error}</p>}

        {!data && !error && <div className="animate-pulse space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-10 rounded-card bg-line/60" />)}</div>}

        {data?.studentView && (
          <>
            <p className={`skill-code ${DOMAIN_META[data.studentView.domain].text}`}>{data.studentView.code}</p>
            <h2 id="detail-panel-heading" className="mb-3 font-display text-2xl font-semibold text-ink">
              {data.studentView.displayName}
            </h2>

            <div className="mb-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-card border border-line bg-white/60 p-3">
                <p className="font-display text-xl font-semibold text-ink">{formatCapability(data.studentView.capability)}</p>
                <p className="text-xs text-ink-soft">Capability</p>
              </div>
              <div className="rounded-card border border-line bg-white/60 p-3">
                <p className={`font-display text-sm font-semibold ${STATE_META[data.studentView.state].text}`}>{STATE_META[data.studentView.state].label}</p>
                <p className="text-xs text-ink-soft">Status</p>
              </div>
              <div className="rounded-card border border-line bg-white/60 p-3">
                <p className="font-display text-sm font-semibold text-ink">{data.studentView.evidenceCount}</p>
                <p className="text-xs text-ink-soft">{CONFIDENCE_LABEL[data.studentView.confidence]}</p>
              </div>
            </div>

            {data.studentView.state === 'UNKNOWN' && (
              <p className="mb-5 rounded-card border border-line bg-white/60 px-3 py-2 text-sm text-ink-soft">
                You haven't attempted enough {data.studentView.displayName} questions yet for ACEAPT to estimate this — that's not the same as being weak here.
              </p>
            )}

            {data.rootCause?.possible_prerequisite_gap && (
              <div className="mb-5 rounded-card border border-focus/40 bg-focus-soft p-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-focus">Why it matters</p>
                <p className="text-sm text-ink">{data.rootCause.note}</p>
                <button type="button" onClick={() => onOpenSkill(data.rootCause!.possible_prerequisite_gap!)} className="mt-1 text-sm font-medium text-focus underline-offset-2 hover:underline">
                  Look at {data.rootCause.possible_prerequisite_gap} →
                </button>
              </div>
            )}

            {data.prerequisites.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 font-display text-sm font-semibold text-ink">Prerequisites</h3>
                <ul className="space-y-2">
                  {data.prerequisites.map((e) => (
                    <RelationshipExplainer key={e.relationshipId} subjectName={data.studentView!.displayName} edge={e} onOpenSkill={onOpenSkill} />
                  ))}
                </ul>
              </section>
            )}

            {data.dependents.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 font-display text-sm font-semibold text-ink">Skills this supports</h3>
                <ul className="space-y-2">
                  {data.dependents.map((e) => (
                    <RelationshipExplainer key={e.relationshipId} subjectName={data.studentView!.displayName} edge={e} onOpenSkill={onOpenSkill} />
                  ))}
                </ul>
              </section>
            )}

            {data.related.length > 0 && (
              <section className="mb-5">
                <h3 className="mb-2 font-display text-sm font-semibold text-ink">Related skills</h3>
                <ul className="space-y-2">
                  {data.related.map((e) => (
                    <RelationshipExplainer key={e.relationshipId} subjectName={data.studentView!.displayName} edge={e} onOpenSkill={onOpenSkill} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

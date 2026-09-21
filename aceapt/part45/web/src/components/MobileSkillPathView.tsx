import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { createSkillGraphClient } from '../api/skillGraphClient';
import type { RelatedEdge, StudentSkillView } from '../api/types';
import { formatCapability, STATE_META } from './theme';
import { RelationshipExplainer } from './RelationshipExplainer';

export interface MobileSkillPathViewProps {
  client: ReturnType<typeof createSkillGraphClient>;
  studentId: string;
  skillCode: string;
  onOpenSkill: (code: string) => void;
}

function Section({ title, count, children, defaultOpen = false }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between py-3 text-left">
        <span className="font-display text-sm font-semibold text-ink">
          {title} <span className="font-body font-normal text-ink-soft">({count})</span>
        </span>
        <ChevronDown size={16} className={`text-ink-soft transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

export function MobileSkillPathView({ client, studentId, skillCode, onOpenSkill }: MobileSkillPathViewProps) {
  const [studentView, setStudentView] = useState<StudentSkillView | undefined>();
  const [prerequisites, setPrerequisites] = useState<RelatedEdge[]>([]);
  const [related, setRelated] = useState<RelatedEdge[]>([]);
  const [dependents, setDependents] = useState<RelatedEdge[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.getStudentGraph(studentId), client.getPrerequisites(skillCode), client.getRelated(skillCode), client.getDependents(skillCode)]).then(([g, p, r, d]) => {
      if (cancelled) return;
      setStudentView(g.skills.find((s) => s.code === skillCode));
      setPrerequisites(p.prerequisites);
      setRelated(r.related);
      setDependents(d.dependents);
    });
    return () => {
      cancelled = true;
    };
  }, [client, studentId, skillCode]);

  if (!studentView) return <div className="h-32 animate-pulse rounded-card bg-line/60" aria-busy="true" />;

  return (
    <div className="mx-auto max-w-sm">
      <p className="skill-code">{studentView.code}</p>
      <h2 className="mb-1 font-display text-xl font-semibold text-ink">{studentView.displayName}</h2>
      <p className={`mb-4 text-sm font-medium ${STATE_META[studentView.state].text}`}>
        {formatCapability(studentView.capability)} · {STATE_META[studentView.state].label}
      </p>

      <Section title="Prerequisites" count={prerequisites.length} defaultOpen>
        <ul className="space-y-2">
          {prerequisites.map((e) => (
            <RelationshipExplainer key={e.relationshipId} subjectName={studentView.displayName} edge={e} onOpenSkill={onOpenSkill} />
          ))}
          {prerequisites.length === 0 && <p className="text-sm text-ink-soft">No prerequisites recorded — this is a foundational skill.</p>}
        </ul>
      </Section>

      <Section title="Related skills" count={related.length}>
        <ul className="space-y-2">
          {related.map((e) => (
            <RelationshipExplainer key={e.relationshipId} subjectName={studentView.displayName} edge={e} onOpenSkill={onOpenSkill} />
          ))}
        </ul>
      </Section>

      <Section title="Skills this supports" count={dependents.length}>
        <ul className="space-y-2">
          {dependents.map((e) => (
            <RelationshipExplainer key={e.relationshipId} subjectName={studentView.displayName} edge={e} onOpenSkill={onOpenSkill} />
          ))}
        </ul>
      </Section>
    </div>
  );
}

import type { RelatedEdge } from '../api/types';
import { RELATIONSHIP_SENTENCE } from './theme';

export interface RelationshipExplainerProps {
  subjectName: string;
  edge: RelatedEdge;
  onOpenSkill?: (code: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  PREREQUISITE: 'Prerequisite',
  DEPENDS_ON: 'Depends on',
  RELATED_TO: 'Related',
  BUILDS: 'Builds toward',
  TRANSFER_TO: 'Transfers to',
  PART_OF: 'Part of',
  COMMON_ERROR_SOURCE: 'Common error source',
};

export function RelationshipExplainer({ subjectName, edge, onOpenSkill }: RelationshipExplainerProps) {
  if (!edge.skill) return null;
  const sentenceFn = RELATIONSHIP_SENTENCE[edge.relationshipType];
  // direction: 'from' means edge.skill is the FROM side (e.g. a prerequisite of subject); 'to' means edge.skill is the TO side.
  const sentence = sentenceFn ? (edge.direction === 'from' ? sentenceFn(edge.skill.displayName, subjectName) : sentenceFn(subjectName, edge.skill.displayName)) : `${subjectName} and ${edge.skill.displayName} are connected (${edge.relationshipType}).`;

  return (
    <li className="flex items-start justify-between gap-3 rounded-card border border-line bg-white/50 px-3 py-2.5">
      <div className="min-w-0">
        <div className="mb-0.5 flex items-center gap-2 text-xs">
          <span className="rounded-full bg-line px-2 py-0.5 font-medium text-ink-soft">{TYPE_LABEL[edge.relationshipType] ?? edge.relationshipType}</span>
          {edge.confidence === 'LOW' && <span className="text-ink-soft">low-confidence link</span>}
        </div>
        <p className="text-sm text-ink">{sentence}</p>
        {edge.rationale && <p className="mt-0.5 text-xs text-ink-soft">{edge.rationale}</p>}
      </div>
      {onOpenSkill && edge.skill && (
        <button type="button" onClick={() => onOpenSkill(edge.skill!.code)} className="shrink-0 whitespace-nowrap text-xs font-medium text-quant underline-offset-2 hover:underline">
          {edge.skill.displayName}
        </button>
      )}
    </li>
  );
}

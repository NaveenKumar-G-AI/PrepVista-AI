import { generateId, now } from '../utils/misc.js';
import { Issue } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';

export interface ValidatorOutcome {
  issues: Issue[];
}

export function makeIssue(
  type: IssueType,
  severity: IssueSeverity,
  message: string,
  evidence?: Record<string, unknown>,
): Issue {
  return {
    id: generateId(),
    type,
    severity,
    message,
    evidence,
    status: 'OPEN',
    createdAt: now(),
  };
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
  [IssueSeverity.CRITICAL]: 4,
  [IssueSeverity.HIGH]: 3,
  [IssueSeverity.MEDIUM]: 2,
  [IssueSeverity.LOW]: 1,
  [IssueSeverity.INFO]: 0,
};

export function worstSeverity(issues: Issue[]): IssueSeverity | undefined {
  if (issues.length === 0) return undefined;
  return issues.reduce<IssueSeverity>(
    (worst, issue) => (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst] ? issue.severity : worst),
    issues[0].severity,
  );
}

export function severityRank(s: IssueSeverity): number {
  return SEVERITY_RANK[s];
}

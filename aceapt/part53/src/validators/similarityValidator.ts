import { jaccardSimilarity, normalizeText, structuralSignature } from '../domain/text.js';
import { QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { sha256 } from '../utils/misc.js';
import { makeIssue, ValidatorOutcome } from './types.js';

const SIMILARITY_THRESHOLD = 0.85;
const STRUCTURAL_OVERREP_THRESHOLD = 5;

/** Optional extension point for a real embedding-based semantic similarity service (section 95:
 *  "exact text hash, normalized text, lexical similarity, semantic similarity, structural
 *  similarity — not one method alone"). No-op by default; wire a real implementation in via
 *  `createEngine(repo, { semanticSimilarity })` when you have an embeddings provider. */
export interface SemanticSimilarityPort {
  mostSimilar(content: string, candidates: { id: string; content: string }[]): { id: string; score: number }[];
}

/**
 * Compares `version` against `pool` (other active questions, ideally pre-filtered to the same
 * skill by the caller) using three independent signals: exact-hash duplicate, lexical (Jaccard)
 * near-duplicate, and structural-signature over-representation (section 94/97).
 */
export function validateSimilarity(
  version: QuestionVersion,
  pool: QuestionVersion[],
  semanticSimilarityPort?: SemanticSimilarityPort,
): ValidatorOutcome {
  const issues = [];
  const selfHash = sha256(normalizeText(version.content ?? ''));
  const selfSignature = structuralSignature({
    primarySkill: version.skillMapping?.primarySkill,
    computationKind: version.computation?.kind,
    optionCount: version.options?.length ?? 0,
  });

  let exactMatches = 0;
  const nearMatches: { id: string; score: number }[] = [];
  let structuralMatches = 0;

  for (const other of pool) {
    if (other.questionId === version.questionId) continue;

    const otherHash = sha256(normalizeText(other.content ?? ''));
    if (otherHash === selfHash) {
      exactMatches++;
    } else {
      const sim = jaccardSimilarity(version.content ?? '', other.content ?? '');
      if (sim >= SIMILARITY_THRESHOLD) nearMatches.push({ id: other.questionId, score: sim });
    }

    const otherSignature = structuralSignature({
      primarySkill: other.skillMapping?.primarySkill,
      computationKind: other.computation?.kind,
      optionCount: other.options?.length ?? 0,
    });
    if (otherSignature === selfSignature) structuralMatches++;
  }

  if (exactMatches > 0) {
    issues.push(
      makeIssue(
        IssueType.STRUCTURAL_DUPLICATE,
        IssueSeverity.HIGH,
        `Question text is an exact normalized duplicate of ${exactMatches} other question(s) in the pool.`,
      ),
    );
  } else if (nearMatches.length > 0) {
    issues.push(
      makeIssue(
        IssueType.STRUCTURAL_DUPLICATE,
        IssueSeverity.MEDIUM,
        `Question text is highly similar (Jaccard >= ${SIMILARITY_THRESHOLD}) to ${nearMatches.length} other ` +
          `question(s): ${nearMatches.map((m) => `${m.id} (${m.score.toFixed(2)})`).join(', ')}.`,
        { nearMatches },
      ),
    );
  }

  if (structuralMatches >= STRUCTURAL_OVERREP_THRESHOLD) {
    issues.push(
      makeIssue(
        IssueType.STRUCTURAL_DUPLICATE,
        IssueSeverity.LOW,
        `Structural signature "${selfSignature}" is shared by ${structuralMatches} other questions — ` +
          'possible pool over-representation (section 94).',
      ),
    );
  }

  if (semanticSimilarityPort) {
    const semanticMatches = semanticSimilarityPort
      .mostSimilar(
        version.content ?? '',
        pool.filter((p) => p.questionId !== version.questionId).map((p) => ({ id: p.questionId, content: p.content })),
      )
      .filter((m) => m.score >= SIMILARITY_THRESHOLD);
    if (semanticMatches.length > 0) {
      issues.push(
        makeIssue(
          IssueType.STRUCTURAL_DUPLICATE,
          IssueSeverity.MEDIUM,
          `Semantic similarity search found ${semanticMatches.length} conceptually equivalent question(s) ` +
            'despite different wording.',
          { semanticMatches },
        ),
      );
    }
  }

  return { issues };
}

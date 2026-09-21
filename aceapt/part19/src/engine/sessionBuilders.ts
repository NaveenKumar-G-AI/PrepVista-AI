// ============================================================================
// Session builders: blind retrieval, contrastive recall, mixed retention.
//
// These are request-shaping helpers, not a question engine — they ask
// Feature 17 (QuestionPort) for the right *kind* of item and hand back
// what the client needs. They never author question content themselves.
// ============================================================================

import { QuestionPort, QuestionRef } from '../integration/featurePorts';

/**
 * Blind mode: no chapter name, formula, or hint may reach the student — the
 * client is responsible for rendering only `prompt`, never templateId,
 * method, or topicWrapper. This simulates identifying which knowledge
 * applies, the way a real placement test does.
 */
export async function fetchBlindRetrievalQuestions(
  conceptIds: string[],
  questions: QuestionPort
): Promise<QuestionRef[]> {
  const batches = await Promise.all(
    conceptIds.map(conceptId => questions.getQuestions({ conceptId, mode: 'blind', count: 1 }))
  );
  return batches.flat();
}

/**
 * Contrastive recall: related-but-distinct concepts served together (e.g.
 * Simple Interest vs. Compound Interest vs. Mixed) so the student has to
 * discriminate, not just recognize a pattern.
 */
export async function fetchContrastiveRecallSet(
  conceptIds: string[],
  questions: QuestionPort
): Promise<QuestionRef[]> {
  if (conceptIds.length < 2) {
    throw new Error('Contrastive recall needs at least two related concepts.');
  }
  const batches = await Promise.all(
    conceptIds.map(conceptId =>
      questions.getQuestions({
        conceptId,
        mode: 'contrastive',
        contrastWithConceptIds: conceptIds.filter(c => c !== conceptId),
        count: 1,
      })
    )
  );
  return batches.flat();
}

/**
 * Mixed retention: several unrelated concepts, unlabeled and shuffled, so
 * the student has to identify which concept applies before solving —
 * measuring real accessibility rather than cued recall.
 */
export async function fetchMixedRetentionSet(
  conceptIds: string[],
  questions: QuestionPort
): Promise<QuestionRef[]> {
  const batches = await Promise.all(
    conceptIds.map(conceptId => questions.getQuestions({ conceptId, mode: 'mixed', count: 1 }))
  );
  return shuffle(batches.flat());
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

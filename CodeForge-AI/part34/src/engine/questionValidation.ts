// ============================================================================
// Phase 11 — validate an AI-generated question before it's ever shown to a
// student: "role relevance, skill relevance, difficulty, duplication,
// ambiguity, unsupported assumptions, safety, answerability. Reject invalid
// questions. Regenerate safely when appropriate."
//
// Deliberately rule-based rather than a second AI call: these checks need to
// be fast, deterministic, and testable without network access, and they're
// the last line of defense against a malformed or ungrounded question
// reaching a student — they should not themselves depend on the AI gateway
// being available.
// ============================================================================

import type { QuestionValidationResult } from "../domain/types.js";

const UNSAFE_PATTERNS = [
  /(?=.*\bpassword\b)(?=.*\bshare\b)/i, // order-independent: "share...password" and "password...share" both count
  /\bssn\b/i,
  /\bcredit card\b/i,
  /\bhack (into|the)\b/i,
];

const VAGUE_STOCK_PHRASES = [/^tell me about yourself/i, /^what is your greatest weakness/i];

export interface QuestionValidationInput {
  text: string;
  skillId: string;
  skillKeywords: string[]; // simple keyword list per skill, e.g. SQL -> ["sql","query","index","join","database"]
  groundedOn: string[]; // from AIGeneratedQuestion.groundedOn
  evidenceSummariesOffered: string[]; // what was actually offered to the AI as grounding
  priorQuestionTexts: string[];
  requestedDifficulty: number; // 1-5
}

const SIMILARITY_DUPLICATE_THRESHOLD = 0.82;

export function validateQuestion(input: QuestionValidationInput): QuestionValidationResult {
  const failedChecks: QuestionValidationResult["failedChecks"] = [];
  const text = input.text.trim();

  // Safety
  if (UNSAFE_PATTERNS.some((p) => p.test(text))) {
    failedChecks.push("SAFETY");
  }

  // Answerability / ambiguity: too short, no question mark/imperative, or a
  // known vague stock phrase that isn't actually technical.
  if (text.length < 12) {
    failedChecks.push("ANSWERABILITY");
  }
  if (VAGUE_STOCK_PHRASES.some((p) => p.test(text)) || !/[?.:]|walk me through|describe|explain|how would|what would|why/i.test(text)) {
    failedChecks.push("AMBIGUITY");
  }

  // Skill relevance: the question text should reference at least one
  // keyword associated with the target skill, OR be explicitly grounded in
  // supplied evidence for that skill (code excerpt / evidence summary).
  const mentionsSkillKeyword = input.skillKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()));
  const isGrounded = input.groundedOn.length > 0;
  if (!mentionsSkillKeyword && !isGrounded) {
    failedChecks.push("SKILL_RELEVANCE");
  }

  // Role relevance is implicit in skill relevance for this reference
  // implementation (skills are already scoped to the role's requirement
  // list before a question is generated) — re-check that at least
  // something ties it to the skill/evidence rather than being generic.
  if (!mentionsSkillKeyword && !isGrounded && text.length < 40) {
    failedChecks.push("ROLE_RELEVANCE");
  }

  // Unsupported assumptions: everything the AI claims to have grounded the
  // question on must actually have been offered — this is the concrete,
  // checkable form of "must not hallucinate" (Phase 41) at the question
  // layer.
  const hallucinatedGrounding = input.groundedOn.filter(
    (claim) => !input.evidenceSummariesOffered.includes(claim) && claim !== "codeExcerpt",
  );
  if (hallucinatedGrounding.length > 0) {
    failedChecks.push("UNSUPPORTED_ASSUMPTION");
  }

  // Difficulty: reject wildly out-of-band difficulty requests (defensive
  // bound check; real difficulty *assessment* of the question text itself
  // is a soft judgment better left to human question-bank review than to a
  // brittle heuristic).
  if (input.requestedDifficulty < 1 || input.requestedDifficulty > 5) {
    failedChecks.push("DIFFICULTY");
  }

  // Duplication: reject near-duplicates of anything already asked this
  // session (Phase 9's "avoid repeatedly testing" extends to literal text,
  // not just skill-level repetition).
  if (input.priorQuestionTexts.some((prior) => similarity(prior, text) >= SIMILARITY_DUPLICATE_THRESHOLD)) {
    failedChecks.push("DUPLICATION");
  }

  return {
    isValid: failedChecks.length === 0,
    checkedAt: new Date().toISOString(),
    failedChecks,
  };
}

/**
 * Token-overlap (Jaccard) similarity — cheap, deterministic, no external
 * dependency, good enough to catch near-identical regenerations without
 * false-positiving on two different questions that happen to share a few
 * technical terms. Stop words are excluded first: without that, two
 * genuinely different questions that merely share ordinary scaffolding
 * ("walk me through", "what would you", "before shipping it") score
 * artificially high similarity, since those connective words dominate a
 * typical question's token count far more than the 2-4 content words that
 * actually distinguish it. Filtering them makes the check track *meaning*
 * overlap rather than *phrasing* overlap.
 */
export function similarity(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

// General-purpose English function words only — articles, pronouns,
// prepositions, conjunctions, auxiliary verbs, question words, common
// quantifiers. Deliberately excludes anything content-bearing: a
// duplication check that ignored domain words like "code" or "database"
// would under-detect genuine near-duplicates in production, which defeats
// the point of the check.
const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "this", "that", "with", "what", "would", "one", "its",
  "does", "did", "are", "was", "were", "been", "from", "into", "about", "over", "under",
  "between", "each", "how", "why", "when", "where", "which", "who", "will", "going", "make",
  "made", "making", "could", "should", "before", "after", "more", "most", "some", "any", "not",
  "than", "then", "such", "can", "cannot", "and", "but", "or", "nor", "yet", "so", "a", "an",
  "of", "to", "in", "on", "at", "by", "is", "it", "be", "as", "if",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP_WORDS.has(t)),
  );
}

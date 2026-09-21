// ============================================================================
// AI gateway adapters (Phase 10, 31, 40-42).
//
// AnthropicAIGatewayAdapter is the real, production-shaped adapter — it is
// NOT a mock. It reads its credential from ANTHROPIC_API_KEY and is left
// unconfigured on purpose: per the request, keys/secrets are left blank here
// for you to fill in via your own environment/secrets manager. Until a key is
// set it throws AIGatewayError("NOT_CONFIGURED"), which the orchestration
// layer already treats as a safe EVALUATION_PENDING/regenerate-safely case
// (Phase 42) rather than a crash — so the rest of the system is fully
// runnable and testable with zero keys.
//
// DeterministicFixtureAIGatewayAdapter is what tests and `npm run dev` use by
// default so behavior is reproducible without network access or spend.
// ============================================================================

import type {
  AIEvaluationContext,
  AIEvaluationRaw,
  AIGatewayPort,
  AIGeneratedQuestion,
  AIQuestionGenerationContext,
} from "../ports.js";
import { AIGatewayError } from "../ports.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

// ---- Real adapter ------------------------------------------------------------

export interface AnthropicAIGatewayConfig {
  /** Defaults to process.env.ANTHROPIC_API_KEY. Left unset intentionally — fill in via your secrets manager. */
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class AnthropicAIGatewayAdapter implements AIGatewayPort {
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: AnthropicAIGatewayConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? undefined;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 20_000;
  }

  private requireKey(): string {
    if (!this.apiKey) {
      throw new AIGatewayError(
        "ANTHROPIC_API_KEY is not set. Configure it in your environment/secrets manager to enable live question generation and evaluation.",
        "NOT_CONFIGURED",
      );
    }
    return this.apiKey;
  }

  private async callMessages(system: string, userContent: string): Promise<string> {
    const apiKey = this.requireKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1000,
          system,
          messages: [{ role: "user", content: userContent }],
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new AIGatewayError(`Anthropic API call timed out after ${this.timeoutMs}ms.`, "TIMEOUT");
      }
      throw new AIGatewayError(`Anthropic API call failed: ${(err as Error).message}`, "PROVIDER_ERROR");
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new AIGatewayError(`Anthropic API returned ${res.status}: ${body}`, "PROVIDER_ERROR");
    }

    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) {
      throw new AIGatewayError("Anthropic API response contained no text content.", "INVALID_RESPONSE_SHAPE");
    }
    return text;
  }

  private parseJson<T>(raw: string): T {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new AIGatewayError("Anthropic response was not valid JSON after cleanup.", "INVALID_RESPONSE_SHAPE");
    }
  }

  async generateQuestion(context: AIQuestionGenerationContext): Promise<AIGeneratedQuestion> {
    // Phase 41 grounding: the prompt is explicitly restricted to the supplied
    // evidence summaries and code excerpt — nothing else about the student,
    // their history, or the platform is included.
    const system = [
      "You write one technical interview question for a college placement platform.",
      "Rules:",
      "- Base the question ONLY on the evidence summaries and code excerpt provided below. Never invent details about the student, their project, or their history.",
      "- The question must be answerable from what a student who produced this evidence would know.",
      "- Prefer applied/scenario framing over asking for a bare definition.",
      "- Do not repeat or closely paraphrase any of the prior questions listed.",
      "- priorQuestionCountForSkill tells you how many questions this specific skill has already had in this session. If it's greater than 0, this is a repeat ask — vary your angle noticeably from a first-time question (different aspect, framing, or specificity), not just different wording for the same idea.",
      "- Respond with ONLY a JSON object: {\"text\": string, \"groundedOn\": string[]}. groundedOn must be a subset of the evidence summaries/excerpt labels you actually used. No prose, no markdown fences.",
    ].join("\n");

    const userContent = JSON.stringify({
      roleId: context.roleId,
      skillId: context.skillId,
      mode: context.mode,
      difficulty: context.difficulty,
      evidenceSummaries: context.evidenceSummaries,
      codeExcerpt: context.codeExcerpt ?? null,
      priorQuestionTextsInSession: context.priorQuestionTextsInSession,
      priorQuestionCountForSkill: context.priorQuestionCountForSkill,
    });

    const raw = await this.callMessages(system, userContent);
    const parsed = this.parseJson<{ text?: unknown; groundedOn?: unknown }>(raw);

    if (typeof parsed.text !== "string" || parsed.text.trim().length === 0) {
      throw new AIGatewayError("Generated question was missing a non-empty 'text' field.", "INVALID_RESPONSE_SHAPE");
    }
    const groundedOn = Array.isArray(parsed.groundedOn) ? parsed.groundedOn.filter((x): x is string => typeof x === "string") : [];

    return { text: parsed.text.trim(), groundedOn };
  }

  async evaluateResponse(context: AIEvaluationContext): Promise<AIEvaluationRaw> {
    const system = [
      "You evaluate one technical interview response for a college placement platform.",
      "Rules:",
      "- Judge ONLY against the question, the student's response, and the evidence/code excerpt supplied. Never assume facts not present.",
      "- Only populate dimensions from this list, and only those requested: " + context.dimensionsRequested.join(", ") + ".",
      "- correctness must be one of: CORRECT, MOSTLY_CORRECT, PARTIALLY_CORRECT, INCORRECT, INSUFFICIENT.",
      "- If the response is empty, off-topic, or 'I don't know', correctness must be INSUFFICIENT — never guess intent.",
      "- citedEvidence must list only entries you actually relied on, copied verbatim from the evidenceSummaries/codeExcerpt you were given.",
      "- Respond with ONLY a JSON object matching AIEvaluationRaw. No prose, no markdown fences.",
    ].join("\n");

    const userContent = JSON.stringify({
      questionText: context.questionText,
      studentResponseText: context.studentResponseText,
      skillId: context.skillId,
      roleId: context.roleId,
      evidenceSummaries: context.evidenceSummaries,
      codeExcerpt: context.codeExcerpt ?? null,
      dimensionsRequested: context.dimensionsRequested,
    });

    const raw = await this.callMessages(system, userContent);
    const parsed = this.parseJson<Partial<AIEvaluationRaw>>(raw);

    if (typeof parsed.correctness !== "string" || typeof parsed.rationale !== "string") {
      throw new AIGatewayError("Evaluation response was missing required fields (correctness, rationale).", "INVALID_RESPONSE_SHAPE");
    }

    return {
      correctness: parsed.correctness,
      reasoningQuality: parsed.reasoningQuality,
      understanding: parsed.understanding,
      depth: parsed.depth,
      application: parsed.application,
      communicationClarity: parsed.communicationClarity,
      consistency: parsed.consistency,
      rationale: parsed.rationale,
      citedEvidence: Array.isArray(parsed.citedEvidence) ? parsed.citedEvidence.filter((x): x is string => typeof x === "string") : [],
    };
  }
}

// ---- Deterministic fixture adapter for tests / offline dev -----------------

/**
 * No network calls. Same call SEQUENCE always produces the same output
 * sequence (that's what golden tests, Phase 73, need) — but note this
 * adapter is intentionally stateful (see usedAngleIndices below), so it is
 * NOT a pure function of a single call's context in isolation, and it must
 * NOT be shared across unrelated interview sessions. Construct one instance
 * per session (buildContainer() already does this — each call gets a fresh
 * container, hence a fresh adapter). This is a test/local-dev fixture only;
 * AnthropicAIGatewayAdapter has no such constraint since a real model
 * doesn't need a collision-avoidance trick to vary its own phrasing.
 */
export class DeterministicFixtureAIGatewayAdapter implements AIGatewayPort {
  // Tracks which angle indices have already been used, per evidence
  // category, for THIS adapter instance — which is naturally scoped to one
  // interview session via buildContainer() (each session gets its own
  // container, hence its own adapter). A hash-selected slot reduces
  // collisions between two different (skillId, count) pairs but can't
  // guarantee zero — this tracker turns "very unlikely" into "impossible
  // until the pool is exhausted": on a collision, generateQuestion() probes
  // forward to the next unused index instead of accepting a near-duplicate.
  private readonly usedAngleIndices: Record<"code" | "evidence" | "fallback", Set<number>> = {
    code: new Set(),
    evidence: new Set(),
    fallback: new Set(),
  };

  private claimAngleIndex(category: "code" | "evidence" | "fallback", startIndex: number): number {
    const used = this.usedAngleIndices[category];
    for (let offset = 0; offset < ENGINEERING_ANGLES.length; offset++) {
      const candidate = (startIndex + offset) % ENGINEERING_ANGLES.length;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
    // Pool fully exhausted for this category in this session (would require
    // more distinct questions in one category than any blueprint in this
    // codebase asks for) — fall back to the hash's own slot; at that point
    // questionValidation's duplication check is a legitimate, correct
    // rejection rather than a fixture artifact, and Phase 42's
    // safe-failure path applies.
    return startIndex;
  }

  async generateQuestion(context: AIQuestionGenerationContext): Promise<AIGeneratedQuestion> {
    const startIndex = simpleStringHash(`${context.skillId}::${context.priorQuestionCountForSkill}`) % ENGINEERING_ANGLES.length;

    if (context.codeExcerpt) {
      const angle = ENGINEERING_ANGLES[this.claimAngleIndex("code", startIndex)]!;
      return { text: angle.codeFrame(context.codeExcerpt.language, context.skillId), groundedOn: ["codeExcerpt"] };
    }
    const primaryEvidence = context.evidenceSummaries[0];
    if (primaryEvidence) {
      const angle = ENGINEERING_ANGLES[this.claimAngleIndex("evidence", startIndex)]!;
      return { text: angle.evidenceFrame(primaryEvidence), groundedOn: [primaryEvidence] };
    }
    const angle = ENGINEERING_ANGLES[this.claimAngleIndex("fallback", startIndex)]!;
    return { text: angle.fallbackFrame(context.skillId), groundedOn: [] };
  }

  async evaluateResponse(context: AIEvaluationContext): Promise<AIEvaluationRaw> {
    const trimmed = context.studentResponseText.trim();
    const lower = trimmed.toLowerCase();

    if (trimmed.length === 0 || lower === "i don't know" || lower === "idk" || lower === "not sure") {
      return {
        correctness: "INSUFFICIENT",
        rationale: "No substantive answer was provided.",
        citedEvidence: [],
      };
    }

    const wordCount = trimmed.split(/\s+/).length;
    const explainsReason = /because|so that|since|which means|this way/.test(lower);
    const referencesCode = context.codeExcerpt ? lower.includes(context.codeExcerpt.language.toLowerCase()) || wordCount > 25 : false;

    let correctness: AIEvaluationRaw["correctness"];
    if (wordCount >= 30 && explainsReason) correctness = "MOSTLY_CORRECT";
    else if (wordCount >= 12) correctness = "PARTIALLY_CORRECT";
    else correctness = "INSUFFICIENT";

    return {
      correctness,
      reasoningQuality: explainsReason ? "ADEQUATE" : "WEAK",
      understanding: wordCount >= 20 ? "PARTIAL" : "NOT_ASSESSED",
      depth: wordCount >= 40 ? "MODERATE" : "SURFACE",
      application: referencesCode ? "APPLIED_PARTIALLY" : "NOT_ASSESSED",
      communicationClarity: wordCount >= 8 ? "ADEQUATE" : "UNCLEAR",
      consistency: context.codeExcerpt ? "CONSISTENT" : undefined,
      rationale: "Deterministic fixture evaluation based on response length and explanatory language markers.",
      citedEvidence: context.evidenceSummaries.slice(0, 1),
    };
  }
}

/** Small deterministic string hash (djb2-style) — no crypto needed, just needs to spread different skillIds across variant indices reasonably evenly. */
function simpleStringHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Each angle is a genuinely distinct engineering concern — not a reworded
 * copy of another entry — so that two different (skill, count) pairs
 * landing on two different angles produce texts with low content-word
 * overlap even before accounting for the skill name itself. 24 entries
 * comfortably exceeds the largest per-category question count any blueprint
 * in this codebase can produce in one session.
 */
interface EngineeringAngle {
  codeFrame: (language: string, skillId: string) => string;
  evidenceFrame: (evidence: string) => string;
  fallbackFrame: (skillId: string) => string;
}

const ENGINEERING_ANGLES: EngineeringAngle[] = [
  {
    codeFrame: (lang, skill) => `Looking at this ${lang} snippet through a ${skill} lens: where would latency creep in first under heavy load, and how would you notice?`,
    evidenceFrame: (ev) => `You mentioned: "${ev}". What's a latency scenario where that choice would stop being the right one?`,
    fallbackFrame: (skill) => `For ${skill}: describe a latency problem you'd expect at scale, and how you'd track it down.`,
  },
  {
    codeFrame: (lang, skill) => `From a ${skill} angle, what happens to memory usage in this ${lang} snippet as the dataset grows, and where would you intervene?`,
    evidenceFrame: (ev) => `Given "${ev}" — what memory trade-off did you accept, and when would it stop being worth it?`,
    fallbackFrame: (skill) => `For ${skill}: what's a memory issue that commonly catches people off guard?`,
  },
  {
    codeFrame: (lang, skill) => `Security-wise, given ${skill}: what's the riskiest assumption this ${lang} snippet makes about its input?`,
    evidenceFrame: (ev) => `Building on "${ev}": what's the security implication someone reviewing this should ask about?`,
    fallbackFrame: (skill) => `For ${skill}: what's a security mistake that's easy to make and hard to notice in review?`,
  },
  {
    codeFrame: (lang, skill) => `Cost-wise, considering ${skill}: which part of this ${lang} snippet would get expensive at ten times today's scale?`,
    evidenceFrame: (ev) => `Thinking about "${ev}": what would this cost you at ten times the current scale?`,
    fallbackFrame: (skill) => `For ${skill}: how would rising cost show up first if this were built carelessly?`,
  },
  {
    codeFrame: (lang, skill) => `For backward compatibility and ${skill}: if you changed this ${lang} snippet's return shape, who downstream would break?`,
    evidenceFrame: (ev) => `Regarding "${ev}" — what backward-compatibility risk does this create for anyone downstream?`,
    fallbackFrame: (skill) => `For ${skill}: what's a backward-compatibility trap engineers fall into?`,
  },
  {
    codeFrame: (lang, skill) => `On an incident call about ${skill}: which line in this ${lang} snippet would you check first, and what would you expect to see?`,
    evidenceFrame: (ev) => `On "${ev}": if this broke in production at 2am, what's the first thing you'd check?`,
    fallbackFrame: (skill) => `For ${skill}: you're paged at 2am for this — what's your first move?`,
  },
  {
    codeFrame: (lang, skill) => `Reviewing this ${lang} snippet for ${skill} correctness: what test case is most obviously missing?`,
    evidenceFrame: (ev) => `About "${ev}" — what test would you write to prove this still works correctly?`,
    fallbackFrame: (skill) => `For ${skill}: what's a test case that's easy to forget but important?`,
  },
  {
    codeFrame: (lang, skill) => `Documentation-wise for ${skill}: what would a new hire misunderstand about this ${lang} snippet without being told?`,
    evidenceFrame: (ev) => `Given "${ev}": how would you explain this to a new teammate reading the code for the first time?`,
    fallbackFrame: (skill) => `For ${skill}: how would you explain the core idea to someone brand new to it?`,
  },
  {
    codeFrame: (lang, skill) => `From a concurrency standpoint in ${skill}: what would go wrong if two requests hit this ${lang} snippet at the exact same moment?`,
    evidenceFrame: (ev) => `On "${ev}": what race condition could this create under concurrent access?`,
    fallbackFrame: (skill) => `For ${skill}: describe a concurrency bug that's easy to introduce and hard to reproduce.`,
  },
  {
    codeFrame: (lang, skill) => `For monitoring and ${skill}: what metric would tell you this ${lang} snippet was starting to fail before users noticed?`,
    evidenceFrame: (ev) => `Given "${ev}" — what would you want to monitor to catch a regression early?`,
    fallbackFrame: (skill) => `For ${skill}: what's a signal you'd watch on a dashboard to catch trouble early?`,
  },
  {
    codeFrame: (lang, skill) => `If you had to roll this ${lang} snippet back after a bad deploy, what about ${skill} would make that risky?`,
    evidenceFrame: (ev) => `About "${ev}": what would make rolling this back difficult after the fact?`,
    fallbackFrame: (skill) => `For ${skill}: what's a change that's hard to safely roll back once it ships?`,
  },
  {
    codeFrame: (lang, skill) => `Doing a code review focused on ${skill}: what's the one comment you'd leave on this ${lang} snippet?`,
    evidenceFrame: (ev) => `Reviewing "${ev}" as a teammate: what's the first question you'd ask?`,
    fallbackFrame: (skill) => `For ${skill}: what's a code-review nitpick that actually matters?`,
  },
  {
    codeFrame: (lang, skill) => `Onboarding-wise for ${skill}: what part of this ${lang} snippet would confuse someone new to the codebase?`,
    evidenceFrame: (ev) => `About "${ev}" — what context would a new engineer need before touching this?`,
    fallbackFrame: (skill) => `For ${skill}: what trips up engineers who are new to it?`,
  },
  {
    codeFrame: (lang, skill) => `Thinking about deprecation and ${skill}: how would you safely retire this ${lang} snippet if it needed to go away?`,
    evidenceFrame: (ev) => `On "${ev}": how would you deprecate this safely if it needed to change?`,
    fallbackFrame: (skill) => `For ${skill}: how would you deprecate something safely without breaking callers?`,
  },
  {
    codeFrame: (lang, skill) => `From a rate-limiting angle in ${skill}: what happens to this ${lang} snippet if a client calls it far more than expected?`,
    evidenceFrame: (ev) => `Given "${ev}": what would you do if a client started calling this far too often?`,
    fallbackFrame: (skill) => `For ${skill}: how would you protect this from being called far more than expected?`,
  },
  {
    codeFrame: (lang, skill) => `On caching and ${skill}: would caching help this ${lang} snippet, and what would go stale if it did?`,
    evidenceFrame: (ev) => `About "${ev}": where would caching help here, and what risk would it introduce?`,
    fallbackFrame: (skill) => `For ${skill}: when does caching help, and when does it just hide a real problem?`,
  },
  {
    codeFrame: (lang, skill) => `Thinking about retries and ${skill}: what happens if this ${lang} snippet gets called twice by accident?`,
    evidenceFrame: (ev) => `On "${ev}": what would happen if this ran twice by accident?`,
    fallbackFrame: (skill) => `For ${skill}: what breaks if the same operation runs twice?`,
  },
  {
    codeFrame: (lang, skill) => `For idempotency and ${skill}: is this ${lang} snippet safe to retry, and how would you know?`,
    evidenceFrame: (ev) => `About "${ev}": how would you make this safe to retry?`,
    fallbackFrame: (skill) => `For ${skill}: what does it take to make an operation safely retryable?`,
  },
  {
    codeFrame: (lang, skill) => `From an observability angle in ${skill}: what would you log here in this ${lang} snippet to debug a future failure?`,
    evidenceFrame: (ev) => `Given "${ev}": what would you want logged to debug this later?`,
    fallbackFrame: (skill) => `For ${skill}: what's worth logging that people usually forget?`,
  },
  {
    codeFrame: (lang, skill) => `Capacity-planning-wise for ${skill}: what would you need to know to size infrastructure around this ${lang} snippet?`,
    evidenceFrame: (ev) => `On "${ev}": what would you need to know to plan capacity around this?`,
    fallbackFrame: (skill) => `For ${skill}: what would you measure before scaling this up?`,
  },
  {
    codeFrame: (lang, skill) => `Thinking about error handling in ${skill}: what's missing from how this ${lang} snippet handles a failure?`,
    evidenceFrame: (ev) => `About "${ev}": what failure case isn't handled yet?`,
    fallbackFrame: (skill) => `For ${skill}: what's an error case that's easy to forget to handle?`,
  },
  {
    codeFrame: (lang, skill) => `On data consistency and ${skill}: what could go out of sync if this ${lang} snippet ran partway and failed?`,
    evidenceFrame: (ev) => `Given "${ev}": what could end up inconsistent if this failed halfway through?`,
    fallbackFrame: (skill) => `For ${skill}: how do you keep things consistent when a step fails partway through?`,
  },
  {
    codeFrame: (lang, skill) => `From a configuration standpoint in ${skill}: what about this ${lang} snippet is hardcoded that probably shouldn't be?`,
    evidenceFrame: (ev) => `About "${ev}": what's hardcoded here that should probably be configurable?`,
    fallbackFrame: (skill) => `For ${skill}: what's a hardcoded assumption that tends to bite people later?`,
  },
  {
    codeFrame: (lang, skill) => `Thinking about access control in ${skill}: who shouldn't be able to trigger this ${lang} snippet, and does it actually stop them?`,
    evidenceFrame: (ev) => `On "${ev}": who shouldn't have access to this, and how would you enforce that?`,
    fallbackFrame: (skill) => `For ${skill}: what's an access-control mistake that's easy to make?`,
  },
];

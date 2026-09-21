/**
 * Onboarding summary generation (spec sections 24, 25, 36).
 *
 * `generateOnboardingSummary` ALWAYS resolves with usable text — it never throws, and the
 * caller never needs to render an "AI failed" state. If ANTHROPIC_API_KEY is unset, the request
 * times out, or the API errors, it silently falls back to `buildDeterministicSummary`, which is
 * built purely from structured fields already validated on the way in. Neither path can state a
 * capability is strong/weak, promise a score, or claim a diagnostic already happened — the AI
 * path enforces that through the system prompt below, and the deterministic path enforces it
 * structurally, by construction: it only ever renders back facts the student supplied.
 */
import type { StudentOnboardingContext, PrimaryObjective, PainPoint, TimelineCategory } from "./types";
import {
  labelForValue,
  GOAL_OPTIONS,
  OBJECTIVE_OPTIONS,
  TIMELINE_OPTIONS,
  EXPERIENCE_OPTIONS,
  PREVIOUS_PREP_OPTIONS,
  DIFFICULTY_AREA_OPTIONS,
  AVAILABILITY_OPTIONS,
  STUDY_TIME_OPTIONS,
  ASSISTANCE_OPTIONS,
  DIFFICULTY_PREF_OPTIONS,
  PAIN_POINT_OPTIONS,
  TARGET_SCORE_OPTIONS_UI,
} from "./flow";

const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const REQUEST_TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You are ACEAPT's onboarding summarizer. You write one short, warm, professional paragraph (4-6 sentences) reflecting a student's own onboarding answers back to them.

STRICT RULES — not optional:
- Use ONLY the facts present in the JSON provided in the user message. Never invent, assume, or infer anything not present.
- Never state or imply the student IS "strong" or "weak" at anything — that requires measured diagnostic data, which does not exist yet. You may reflect SELF-REPORTED confidence, but always framed as something they reported, never as an established fact.
- Never predict, promise, or imply a specific score or outcome.
- Never claim a diagnostic or assessment has already happened.
- If a field is absent from the JSON, simply don't mention it — do not guess a plausible-sounding value in its place.
- End with one sentence making clear this reflects how the student sees their preparation today, not a measured result.
- Plain prose only: second person ("you"), sentence case, no headers, no bullet points, no markdown, no emoji.`;

function toSummaryInput(ctx: StudentOnboardingContext): Record<string, unknown> {
  const input: Record<string, unknown> = {};

  if (ctx.preparationGoal) {
    input.preparationGoal =
      ctx.preparationGoal === "OTHER" && ctx.preparationGoalOther
        ? ctx.preparationGoalOther
        : labelForValue(ctx.preparationGoal, GOAL_OPTIONS);
  }
  if (ctx.daysAvailable != null) input.daysUntilTarget = ctx.daysAvailable;
  else if (ctx.timelineCategory) input.timelineWindow = labelForValue(ctx.timelineCategory, TIMELINE_OPTIONS);

  if (ctx.primaryObjective) input.primaryObjective = labelForValue(ctx.primaryObjective, OBJECTIVE_OPTIONS);
  if (ctx.secondaryObjectives.length)
    input.secondaryObjectives = ctx.secondaryObjectives.map((o) => labelForValue(o, OBJECTIVE_OPTIONS));

  if (ctx.experienceLevel) input.selfDescribedExperience = labelForValue(ctx.experienceLevel, EXPERIENCE_OPTIONS);
  if (ctx.previousPreparation)
    input.previousPreparation = labelForValue(ctx.previousPreparation, PREVIOUS_PREP_OPTIONS);
  if (ctx.previousDifficulties.length)
    input.previousDifficulties = ctx.previousDifficulties.map((d) => labelForValue(d, DIFFICULTY_AREA_OPTIONS));

  const conf = ctx.selfPerceivedConfidence;
  if (conf.quantitative || conf.logical || conf.verbal || conf.timePressure) {
    input.selfPerceivedConfidence = {
      quantitative: conf.quantitative,
      logical: conf.logical,
      verbal: conf.verbal,
      timePressure: conf.timePressure,
    };
  }

  if (ctx.dailyAvailability) input.dailyAvailability = labelForValue(ctx.dailyAvailability, AVAILABILITY_OPTIONS);
  if (ctx.preferredStudyTime && ctx.preferredStudyTime !== "FLEXIBLE")
    input.preferredStudyTime = labelForValue(ctx.preferredStudyTime, STUDY_TIME_OPTIONS);
  if (ctx.preferredAssistanceModes.length)
    input.preferredAssistanceModes = ctx.preferredAssistanceModes.map((m) => labelForValue(m, ASSISTANCE_OPTIONS));
  if (ctx.initialDifficultyPreference)
    input.initialDifficultyPreference = labelForValue(ctx.initialDifficultyPreference, DIFFICULTY_PREF_OPTIONS);

  if (ctx.primaryPainPoint) input.primaryPainPoint = labelForValue(ctx.primaryPainPoint, PAIN_POINT_OPTIONS);
  if (ctx.secondaryPainPoints.length)
    input.secondaryPainPoints = ctx.secondaryPainPoints.map((p) => labelForValue(p, PAIN_POINT_OPTIONS));

  if (ctx.targetScore) input.targetScore = labelForValue(ctx.targetScore, TARGET_SCORE_OPTIONS_UI);

  return input;
}

async function callAnthropicForSummary(
  context: StudentOnboardingContext,
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const input = toSummaryInput(context);
  if (Object.keys(input).length === 0) return null;

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Student's onboarding data (JSON):\n\n${JSON.stringify(input, null, 2)}\n\nWrite the summary paragraph now.`,
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[onboarding.summary] Anthropic API returned HTTP ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((block) => block.type === "text" && block.text)?.text?.trim();
    return text ? { text, model } : null;
  } catch (err) {
    console.error("[onboarding.summary] AI summary generation failed — using deterministic fallback:", err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const OBJECTIVE_PHRASES: Record<PrimaryObjective, string> = {
  IMPROVE_SCORE: "improve your aptitude score",
  BECOME_FASTER: "become faster at solving problems",
  FIX_WEAK_TOPICS: "fix your weak topics",
  BUILD_FUNDAMENTALS: "build stronger fundamentals",
  PREPARE_FOR_PLACEMENT_TESTS: "prepare specifically for placement tests",
  BUILD_CONFIDENCE_UNFAMILIAR: "build confidence solving unfamiliar problems",
  MAINTAIN_STRENGTH: "maintain the strength you already have",
};

const PAIN_POINT_PHRASES: Record<PainPoint, string> = {
  DONT_KNOW_WHERE_TO_START: "you're not sure where to start",
  FORGET_CONCEPTS: "you tend to forget concepts",
  CANT_SOLVE_NEW_QUESTIONS: "you understand examples but struggle once a question looks unfamiliar",
  TAKE_TOO_LONG: "you take too long to solve problems",
  CARELESS_MISTAKES: "careless mistakes creep in",
  PANIC_DURING_TESTS: "you panic during tests",
  CONFUSING_QUESTIONS: "questions often feel confusing",
  PRACTICE_NO_IMPROVEMENT: "you practice but don't see it translate into improvement",
  DONT_KNOW_WEAKNESS: "you're not sure what you're actually weak at",
  LOSE_MOTIVATION: "motivation is hard to sustain",
  EVERYTHING_DIFFICULT: "everything feels difficult right now",
  SOMETHING_ELSE: "something specific to your situation is getting in the way",
};

const TIMELINE_PHRASES: Record<TimelineCategory, string> = {
  WITHIN_2_WEEKS: "within the next 2 weeks",
  WITHIN_1_MONTH: "within about a month",
  ONE_TO_THREE_MONTHS: "within the next 1–3 months",
  THREE_TO_SIX_MONTHS: "within the next 3–6 months",
  NOT_SURE: "on a timeline you're still figuring out",
};

function availabilityPhrase(ctx: StudentOnboardingContext): string {
  if (ctx.dailyAvailability === "VARIES") return "a varying amount of time";
  if (ctx.dailyAvailabilityMinutes) {
    if (ctx.dailyAvailabilityMinutes >= 60) {
      const hrs = ctx.dailyAvailabilityMinutes / 60;
      return hrs === 1 ? "about 1 hour" : `about ${hrs} hours`;
    }
    return `about ${ctx.dailyAvailabilityMinutes} minutes`;
  }
  return "some time";
}

/** Purely template-driven — every clause traces back to a field the student actually answered.
 *  This is what renders whenever there's no API key configured, or the AI call fails. */
export function buildDeterministicSummary(ctx: StudentOnboardingContext): string {
  const sentences: string[] = [];

  if (ctx.preparationGoal) {
    const goalLabel =
      ctx.preparationGoal === "OTHER" && ctx.preparationGoalOther
        ? ctx.preparationGoalOther
        : labelForValue(ctx.preparationGoal, GOAL_OPTIONS);
    let s = `You're preparing for ${goalLabel}`;
    if (ctx.daysAvailable != null) {
      s += `, with about ${ctx.daysAvailable} day${ctx.daysAvailable === 1 ? "" : "s"} to go`;
    } else if (ctx.timelineCategory) {
      s += `, aiming to be ready ${TIMELINE_PHRASES[ctx.timelineCategory]}`;
    }
    sentences.push(s + ".");
  }

  if (ctx.dailyAvailability) {
    const studyTimeSuffix =
      ctx.preferredStudyTime && ctx.preferredStudyTime !== "FLEXIBLE"
        ? `, usually in the ${labelForValue(ctx.preferredStudyTime, STUDY_TIME_OPTIONS).toLowerCase()}`
        : "";
    sentences.push(`You can realistically study ${availabilityPhrase(ctx)} a day${studyTimeSuffix}.`);
  }

  if (ctx.primaryObjective) {
    const secondaryPhrase = ctx.secondaryObjectives.length
      ? `, along with ${ctx.secondaryObjectives.map((o) => OBJECTIVE_PHRASES[o]).join(" and ")}`
      : "";
    sentences.push(`Your main focus right now is to ${OBJECTIVE_PHRASES[ctx.primaryObjective]}${secondaryPhrase}.`);
  }

  if (ctx.experienceLevel) {
    sentences.push(
      `By your own description, you're at: "${labelForValue(ctx.experienceLevel, EXPERIENCE_OPTIONS)}."`,
    );
  }

  if (ctx.primaryPainPoint) {
    sentences.push(`The challenge you flagged as biggest is that ${PAIN_POINT_PHRASES[ctx.primaryPainPoint]}.`);
  }

  if (ctx.preferredAssistanceModes.length) {
    const modes = ctx.preferredAssistanceModes.map((m) => labelForValue(m, ASSISTANCE_OPTIONS).toLowerCase());
    const verb = modes.length > 1 ? "tend" : "tends";
    sentences.push(`When you're stuck, ${modes.join(" and ")} ${verb} to help you most.`);
  }

  if (sentences.length === 0) {
    return "We don't have enough information yet to summarize your preparation context — answer a few questions and this will update automatically.";
  }

  sentences.push(
    "This reflects how you see your preparation today — your diagnostic will show what you can actually do.",
  );

  return sentences.join(" ");
}

export async function generateOnboardingSummary(
  context: StudentOnboardingContext,
): Promise<{ text: string; source: "ai" | "deterministic"; model: string | null }> {
  const aiResult = await callAnthropicForSummary(context);
  if (aiResult) {
    return { text: aiResult.text, source: "ai", model: aiResult.model };
  }
  return { text: buildDeterministicSummary(context), source: "deterministic", model: null };
}

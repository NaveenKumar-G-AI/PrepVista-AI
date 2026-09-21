import type { PoolClient } from "pg";
import { EvaluationResult, IncidentInstance, IncidentTemplate } from "@/lib/engine/types";
import {
  computeCategoryScores,
  computeEngineeringJudgment,
  computeIndependence,
  computeOverall,
  topStrengthAndGap,
} from "@/lib/engine/scoring";
import { extractEvidence } from "@/lib/engine/evidence";
import { buildCoachingBundle, generateCoaching } from "@/lib/engine/aiCoaching";
import { transition } from "@/lib/engine/stateMachine";
import { noopMasteryAdapter } from "@/lib/engine/masteryAdapter";
import { listActions, listEvents, listHypotheses, listMessages } from "./investigation";
import { getPostmortem } from "./postmortem";
import { updateIncidentInstance } from "./instance";
import { createEvaluation, insertEvidence } from "./evaluation";

/**
 * The one place in this codebase where "the deterministic engine finished,
 * now optionally ask AI to comment on it" actually happens. Every score
 * here is computed BEFORE the AI call and does not change based on what
 * the AI says — see aiCoaching.ts's header comment for why, and
 * tests/e2e_incident_flow.test.ts for a run that asserts the evaluation
 * is identical whether or not an AI provider key is configured.
 */
export async function evaluateIncident(
  client: PoolClient,
  template: IncidentTemplate,
  instance: IncidentInstance
): Promise<EvaluationResult> {
  if (instance.state !== "POSTMORTEM") {
    throw new Error(`Cannot evaluate incident from state ${instance.state}; must be in POSTMORTEM first.`);
  }

  const [events, hypotheses, actionLog, messages, postmortem] = await Promise.all([
    listEvents(client, instance.id),
    listHypotheses(client, instance.id),
    listActions(client, instance.id),
    listMessages(client, instance.id),
    getPostmortem(client, instance.id),
  ]);

  const categoryScores = computeCategoryScores(template, instance, events, hypotheses, actionLog, messages, postmortem);
  const overall = computeOverall(template.scoringRubric, categoryScores);
  const engineeringJudgment = computeEngineeringJudgment(template, events, actionLog);
  const independence = computeIndependence(events);
  const { topStrength, topGap, nextRecommendation } = topStrengthAndGap(categoryScores);

  const confirmedRoot = hypotheses.find(
    (h) => h.status === "CONFIRMED" && h.category === "ROOT_CAUSE" && h.implicatedCauseKey === template.rootCauseKey
  );
  const findActionType = (predicate: (isM: boolean, isF: boolean) => boolean) =>
    actionLog.find((a) => {
      const def = template.actionDefs.find(
        (d) => d.actionType === a.actionType && (d.targetServiceKey ?? undefined) === (a.targetServiceKey ?? undefined)
      );
      return def ? predicate(def.isMitigation, def.isPermanentFix) : false;
    })?.actionType ?? null;

  const mitigationActionType = findActionType((isM) => isM);
  const permanentFixActionType = findActionType((_isM, isF) => isF);

  const draftForCoaching: EvaluationResult = {
    incidentId: instance.id,
    version: 0, // not yet assigned — createEvaluation below computes the real version
    categoryScores,
    engineeringJudgment,
    overall,
    topStrength,
    topGap,
    nextRecommendation,
    independence,
    aiFeedback: null,
  };

  const bundle = buildCoachingBundle(
    template,
    draftForCoaching,
    Boolean(confirmedRoot),
    mitigationActionType,
    permanentFixActionType,
    postmortem?.status === "SUBMITTED",
    (postmortem?.fiveWhys ?? []).filter((w) => w.trim().length > 0).length
  );
  const aiFeedback = await generateCoaching(bundle);

  const saved = await createEvaluation(client, instance.id, instance.ownerId, {
    incidentId: instance.id,
    categoryScores,
    engineeringJudgment,
    overall,
    topStrength,
    topGap,
    nextRecommendation,
    independence,
    aiFeedback,
  });

  const evidenceRows = extractEvidence(template, saved, hypotheses, actionLog, messages, postmortem);
  await insertEvidence(client, instance.id, instance.ownerId, evidenceRows);

  await noopMasteryAdapter.recordEvidence({
    userId: instance.ownerId,
    incidentId: instance.id,
    templateSlug: template.slug,
    targetRole: template.targetRole,
    targetSkills: template.targetSkills,
    evidence: evidenceRows,
    evaluation: saved,
  });

  await updateIncidentInstance(client, instance.id, { state: transition(instance.state, "EVALUATED") });

  return saved;
}

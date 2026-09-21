import {
  ActionLogRow,
  CategoryScores,
  EngineeringEvidenceRow,
  EvaluationResult,
  HypothesisRow,
  IncidentTemplate,
  MessageRow,
  PostmortemRow,
} from "./types";

/**
 * Builds the structured evidence rows described in the brief's
 * "ENGINEERING EVIDENCE" section, grounded entirely in what actually
 * happened during the attempt (scores already computed deterministically,
 * plus the raw artifacts that justify them). Nothing here is invented —
 * every payload field traces back to a real row from this incident.
 */
export function extractEvidence(
  template: IncidentTemplate,
  evaluation: EvaluationResult,
  hypotheses: HypothesisRow[],
  actionLog: ActionLogRow[],
  messages: MessageRow[],
  postmortem: PostmortemRow | null
): EngineeringEvidenceRow[] {
  const s: CategoryScores = evaluation.categoryScores;
  const rows: EngineeringEvidenceRow[] = [];

  rows.push({
    category: "DEBUGGING",
    payload: {
      incidentType: template.incidentType,
      difficulty: template.difficulty,
      investigationScore: s.investigation,
      rootCauseScore: s.rootCause,
      actionsTaken: actionLog.map((a) => a.actionType),
    },
  });

  rows.push({
    category: "OBSERVABILITY",
    payload: {
      evidenceQualityScore: s.evidenceQuality,
      expectedEvidenceKeys: template.expectedEvidenceKeys.length,
      citedEvidenceRefs: Array.from(new Set(hypotheses.flatMap((h) => h.evidenceRefs))),
    },
  });

  const confirmedRootCause = hypotheses.find((h) => h.status === "CONFIRMED" && h.category === "ROOT_CAUSE");
  rows.push({
    category: "ROOT_CAUSE_ANALYSIS",
    payload: {
      rootCauseScore: s.rootCause,
      correctRootCauseIdentified: confirmedRootCause?.implicatedCauseKey === template.rootCauseKey,
      fiveWhysCompleted: (postmortem?.fiveWhys ?? []).filter((w) => w.trim().length > 0).length,
    },
  });

  rows.push({
    category: "INCIDENT_RESPONSE",
    payload: {
      detectionScore: s.detection,
      mitigationScore: s.mitigation,
      permanentFixScore: s.permanentFix,
      overall: evaluation.overall,
    },
  });

  if (template.incidentType.includes("LATENCY") || template.incidentType.includes("PERFORMANCE")) {
    rows.push({
      category: "PERFORMANCE",
      payload: { investigationScore: s.investigation, mitigationScore: s.mitigation },
    });
  }

  if (template.incidentType.includes("DATABASE")) {
    rows.push({
      category: "DATABASE",
      payload: { rootCauseScore: s.rootCause, permanentFixScore: s.permanentFix },
    });
  }

  if (template.incidentType.includes("SECURITY") || template.incidentType.includes("AUTHORIZATION")) {
    rows.push({
      category: "SECURITY",
      payload: { rootCauseScore: s.rootCause, mitigationScore: s.mitigation },
    });
  }

  rows.push({
    category: "PRODUCTION_REASONING",
    payload: {
      engineeringJudgment: evaluation.engineeringJudgment,
      actionValidityBreakdown: actionLog.map((a) => a.actionType),
    },
  });

  rows.push({
    category: "COMMUNICATION",
    payload: {
      communicationScore: s.communication,
      messagesSent: messages.filter((m) => m.direction === "OUTBOUND").length,
    },
  });

  rows.push({
    category: "ENGINEERING_JUDGMENT",
    payload: {
      engineeringJudgment: evaluation.engineeringJudgment,
      independence: evaluation.independence,
      topStrength: evaluation.topStrength,
      topGap: evaluation.topGap,
    },
  });

  return rows;
}

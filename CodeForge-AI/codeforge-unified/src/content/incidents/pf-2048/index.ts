import { IncidentTemplate, ScoringRubric, EscalationRule } from "@/engines/incidents/types";
import { services } from "./services";
import { timeline } from "./timeline";
import { deployments } from "./deployments";
import { alerts } from "./alerts";
import { logLines } from "./logs";
import { traces } from "./traces";
import { metricSeries } from "./metrics";
import { actionDefs } from "./actions";
import {
  ROOT_CAUSE_KEY,
  candidateCauseKeys,
  expectedEvidenceKeys,
  candidatePreventiveActions,
  preventiveActionKeys,
  rootCauseSummary,
  contributingFactorSummary,
} from "./causesAndPrevention";
import { stakeholderTriggers } from "./messages";

const scoringRubric: ScoringRubric = {
  detection: 10,
  investigation: 20,
  evidenceQuality: 15,
  rootCause: 20,
  mitigation: 10,
  permanentFix: 10,
  communication: 5,
  prevention: 10,
};

const escalationRules: EscalationRule[] = [
  { afterMinutesWithoutMitigation: 30, errorRateMultiplier: 1.67, addAlertType: "DATABASE_CONNECTION_EXHAUSTION" },
];

/**
 * The one fully-authored, end-to-end deterministic incident in this build
 * (see README "Known limitations" for why this ships with one incident,
 * not the full 20-type x 5-difficulty matrix the brief describes). The
 * schema, engine, and UI underneath it are generic — authoring a second
 * template means adding another folder like this one and inserting it via
 * the same seed script, not touching any engine code.
 */
export const PF2048_TEMPLATE: IncidentTemplate = {
  id: "00000000-0000-4000-8000-0000000f2048", // stable fixed UUID for local/dev seeding
  slug: "pf-2048",
  incidentType: "DATABASE_PERFORMANCE",
  difficulty: "INTERMEDIATE",
  title: "Placement applications experiencing failures",
  severity: "SEV-2",
  description:
    "Students of the placement program are unable to reliably submit job applications. Requests are timing out " +
    "and a meaningful share are failing outright.",
  businessImpact:
    "18% of application-submission requests are failing. Placement deadlines are affected for active applicants; " +
    "support ticket volume is elevated.",
  targetRole: "Backend",
  targetSkills: ["Database", "Debugging", "Observability", "Incident Response"],
  incidentStartedOffsetMinutes: 23,

  rootCauseKey: ROOT_CAUSE_KEY,
  rootCauseSummary,
  contributingFactorSummary,
  candidateCauseKeys,
  expectedEvidenceKeys,
  candidatePreventiveActions,
  preventiveActionKeys,
  scoringRubric,
  escalationRules,

  services,
  timeline,
  deployments,
  alerts,
  logLines,
  traces,
  metricSeries,
  actionDefs,
  stakeholderTriggers,

  published: true,
};

export const ALL_TEMPLATES: IncidentTemplate[] = [PF2048_TEMPLATE];

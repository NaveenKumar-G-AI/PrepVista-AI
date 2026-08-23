/**
 * PrepVista AI — Part 15 → Part 12 integration surface.
 * Strategy tools (target/gap/opportunity/recommendation) plus the ONE
 * student-facing tool in this whole module: get_personal_outlook. That
 * handler returns only the PersonalOutlook whitelist type — see Section 52.
 */

import type { CallerContext, PersonalOutlook, ToolDefinition } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { TargetService } from "../../services/strategy/TargetService.js";
import { GapAnalysisService } from "../../services/strategy/GapAnalysisService.js";
import { RecommendationEngine } from "../../services/strategy/RecommendationEngine.js";
import { StrategicGapService } from "../../services/strategy/StrategicGapService.js";
import { RoadmapService, DemoActionSystemAdapter } from "../../services/strategy/RoadmapService.js";
import { OpportunityCoverageService, isReady } from "../../services/opportunity-intelligence/OpportunityCoverageService.js";
import { SkillSupplyDemandService } from "../../services/opportunity-intelligence/SkillSupplyDemandService.js";
import { CompanyConcentrationService } from "../../services/opportunity-intelligence/CompanyConcentrationService.js";
import { assertInstitutionalAccess, assertOwnStudentAccess } from "../../rbac/access-control.js";

export function createStrategyTools(repo: PlacementDataRepository, actionAdapter: DemoActionSystemAdapter = new DemoActionSystemAdapter()): ToolDefinition[] {
  const targetService = new TargetService(repo);
  const gapService = new GapAnalysisService(repo);
  const recommendationEngine = new RecommendationEngine(repo);
  const strategicGapService = new StrategicGapService(repo);
  const roadmapService = new RoadmapService(repo, actionAdapter);
  const coverageService = new OpportunityCoverageService(repo);
  const skillService = new SkillSupplyDemandService(repo);
  const companyService = new CompanyConcentrationService(repo);

  const institutional = (caller: CallerContext) => assertInstitutionalAccess(caller);

  return [
    {
      name: "get_target_gap",
      description: "Current placement % vs active target, gap in points, and required additional verified placements.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        const gap = await targetService.getTargetGapSummary(args.asOf);
        return gap ?? { dataAvailable: false, reason: "No active PLACEMENT_PCT target configured for the current season." };
      },
    },
    {
      name: "get_strategic_gaps",
      description: "The six strategic gap types (student/opportunity/skill/funnel/joining/data) currently evidenced, with affected-student counts.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        return strategicGapService.getStrategicGaps(args.asOf);
      },
    },
    {
      name: "get_strategic_recommendations",
      description: "Ranked, evidenced recommendations (impact × urgency × feasibility × confidence), including the funnel-stage explanation for target-gap questions like 'what should we do to reach 85%?'.",
      parameters: { type: "object", properties: { asOf: { type: "string" }, limit: { type: "number" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string; limit?: number }, caller) => {
        institutional(caller);
        const [recommendations, gapExplanation] = await Promise.all([
          recommendationEngine.getRecommendations(args.asOf, args.limit ?? 8),
          gapService.explainGap(args.asOf),
        ]);
        return { recommendations, gapExplanation };
      },
    },
    {
      name: "get_strategy_actions",
      description: "Strategic recommendations that have been proposed as actions (pending Part 14 confirmation/execution), and their current status.",
      parameters: { type: "object", properties: {} },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (_args: Record<string, never>, caller) => {
        institutional(caller);
        return actionAdapter.getProposals();
      },
    },
    {
      name: "get_opportunity_coverage",
      description: "Placement-ready students vs those matched to at least one currently open, eligible, skill-matching drive.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        return coverageService.getCoverage(args.asOf);
      },
    },
    {
      name: "get_skill_demand",
      description: "Per-skill active role demand vs student supply meeting the threshold, sorted by demand descending. Same underlying table as get_skill_supply — demand and supply are two views of one comparison, kept as separate named tools because Part 12 may be asked either question directly.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        return skillService.getSkillDemandSupply(args.asOf);
      },
    },
    {
      name: "get_skill_supply",
      description: "Per-skill student supply vs active role demand — see get_skill_demand.",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        return skillService.getSkillDemandSupply(args.asOf);
      },
    },
    {
      name: "get_company_concentration",
      description: "Top-N company share of verified offers this season, and concentration ratio — reported neutrally, never auto-labeled 'bad'.",
      parameters: { type: "object", properties: { topN: { type: "number" } } },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { topN?: number }, caller) => {
        institutional(caller);
        return companyService.getCompanyConcentration(args.topN ?? 5);
      },
    },
    {
      name: "get_industry_concentration",
      description: "Offer share by industry, using the institution's configured industry taxonomy on company records.",
      parameters: { type: "object", properties: {} },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (_args: Record<string, never>, caller) => {
        institutional(caller);
        return companyService.getIndustryConcentration();
      },
    },
    {
      name: "get_strategy_roadmap",
      description: "Recommendations bucketed into a week-by-week plan (Section 43).",
      parameters: { type: "object", properties: { asOf: { type: "string" } }, required: ["asOf"] },
      requiresRole: ["TPO", "MANAGEMENT"],
      handler: async (args: { asOf: string }, caller) => {
        institutional(caller);
        return roadmapService.buildRoadmap(args.asOf);
      },
    },
    // ── The one student-facing tool in this module — Section 52 ──
    {
      name: "get_personal_outlook",
      description: "Student-safe personal forecasting only: readiness trend, eligible active opportunity count, recommended training. Never institution-level forecasts, department risk, or company intelligence.",
      parameters: { type: "object", properties: { studentId: { type: "string" }, asOf: { type: "string" } }, required: ["studentId", "asOf"] },
      requiresRole: ["STUDENT", "TPO", "MANAGEMENT"],
      handler: async (args: { studentId: string; asOf: string }, caller): Promise<PersonalOutlook> => {
        assertOwnStudentAccess(caller, args.studentId);
        const [student, drives] = await Promise.all([repo.getStudentById(args.studentId, args.asOf), repo.getActiveDrives(await repo.getCurrentSeasonId())]);
        if (!student) throw new Error("Student not found.");
        const eligible = drives.filter((d) => d.eligibleDepartmentIds.includes(student.departmentId) && d.requiredSkills.some((s) => student.skillTags.includes(s)));
        const readinessTrend: PersonalOutlook["readinessTrend"] = student.readinessScore >= 75 ? "IMPROVING" : student.readinessScore >= 60 ? "STEADY" : "DECLINING";
        const recommendedTraining = isReady(student) ? [] : ["Interview readiness workshop", "Resume & portfolio review"];
        return {
          readinessTrend,
          readinessScore: student.readinessScore,
          eligibleActiveOpportunities: eligible.length,
          recommendedTraining,
          message:
            readinessTrend === "IMPROVING"
              ? "Based on your current progress, your readiness is improving."
              : recommendedTraining.length > 0
              ? "You may benefit from completing this training before applying to more roles."
              : `You currently have ${eligible.length} eligible active opportunit${eligible.length === 1 ? "y" : "ies"}.`,
        };
      },
    },
  ];
}

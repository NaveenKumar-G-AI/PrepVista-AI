/**
 * PrepVista AI — Part 15
 * Framework-agnostic handlers for strategy, opportunity-intelligence, and
 * scenario endpoints. Scenario/opportunity-intelligence live here rather
 * than in their own api/ folders because Section 87's merge-safety list only
 * reserves api/forecast/** and api/strategy/** — see api/forecast/router.ts
 * for the request/response shape and an Express adapter example.
 */

import type { CallerContext, ScenarioInput } from "../../types/placement-strategy.types.js";
import type { PlacementDataRepository } from "../../repository/PlacementDataRepository.js";
import { TargetService } from "../../services/strategy/TargetService.js";
import { GapAnalysisService } from "../../services/strategy/GapAnalysisService.js";
import { RecommendationEngine } from "../../services/strategy/RecommendationEngine.js";
import { StrategicGapService } from "../../services/strategy/StrategicGapService.js";
import { RoadmapService, DemoActionSystemAdapter } from "../../services/strategy/RoadmapService.js";
import { OpportunityCoverageService } from "../../services/opportunity-intelligence/OpportunityCoverageService.js";
import { SkillSupplyDemandService } from "../../services/opportunity-intelligence/SkillSupplyDemandService.js";
import { CompanyConcentrationService } from "../../services/opportunity-intelligence/CompanyConcentrationService.js";
import { OutreachPriorityService } from "../../services/opportunity-intelligence/OutreachPriorityService.js";
import { ScenarioService } from "../../services/scenario/ScenarioService.js";
import { AuthorizationError, assertInstitutionalAccess, assertOwnStudentAccess, assertTpoAccess } from "../../rbac/access-control.js";

export interface ApiRequest {
  caller: CallerContext;
  params: Record<string, string>;
  query: Record<string, string>;
  body?: unknown;
}

export interface ApiResult<T = unknown> {
  status: number;
  body: T;
}

function handleError(err: unknown): ApiResult {
  if (err instanceof AuthorizationError) return { status: 403, body: { error: err.message } };
  return { status: 500, body: { error: err instanceof Error ? err.message : "Unknown error" } };
}

export function createStrategyApiHandlers(repo: PlacementDataRepository, actionAdapter: DemoActionSystemAdapter = new DemoActionSystemAdapter()) {
  const targetService = new TargetService(repo);
  const gapService = new GapAnalysisService(repo);
  const recommendationEngine = new RecommendationEngine(repo);
  const strategicGapService = new StrategicGapService(repo);
  const roadmapService = new RoadmapService(repo, actionAdapter);
  const coverageService = new OpportunityCoverageService(repo);
  const skillService = new SkillSupplyDemandService(repo);
  const companyService = new CompanyConcentrationService(repo);
  const outreachService = new OutreachPriorityService(repo);
  const scenarioService = new ScenarioService(repo);

  return {
    // GET /api/strategy/target-gap?asOf=...
    getTargetGap: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        const gap = await targetService.getTargetGapSummary(asOf);
        return { status: 200, body: gap ?? { dataAvailable: false, reason: "No active target configured." } };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/gap-explanation?asOf=...
    getGapExplanation: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        const explanation = await gapService.explainGap(asOf);
        return { status: 200, body: explanation ?? { dataAvailable: false, reason: "No active target configured." } };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/gaps?asOf=...
    getStrategicGaps: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await strategicGapService.getStrategicGaps(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/recommendations?asOf=...
    getRecommendations: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await recommendationEngine.getRecommendations(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // POST /api/strategy/recommendations/:id/accept
    acceptRecommendation: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertTpoAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        const recs = await recommendationEngine.getRecommendations(asOf);
        const rec = recs.find((r) => r.id === req.params.id);
        if (!rec) return { status: 404, body: { error: "Recommendation not found for the given asOf snapshot." } };
        const result = await roadmapService.acceptRecommendation(rec, req.caller);
        return { status: 201, body: result };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/roadmap?asOf=...
    getRoadmap: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await roadmapService.buildRoadmap(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/opportunity-coverage?asOf=...
    getOpportunityCoverage: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await coverageService.getCoverage(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/skills?asOf=...
    getSkillDemandSupply: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await skillService.getSkillDemandSupply(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/company-concentration?topN=5
    getCompanyConcentration: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const topN = req.query.topN ? parseInt(req.query.topN, 10) : 5;
        return { status: 200, body: await companyService.getCompanyConcentration(topN) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/industry-concentration
    getIndustryConcentration: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        return { status: 200, body: await companyService.getIndustryConcentration() };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/outreach-priorities?asOf=...  (TPO-only, never recruiter-facing)
    getOutreachPriorities: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertTpoAccess(req.caller);
        const asOf = req.query.asOf;
        if (!asOf) return { status: 400, body: { error: "asOf required" } };
        return { status: 200, body: await outreachService.getOutreachPriorities(asOf) };
      } catch (err) {
        return handleError(err);
      }
    },

    // POST /api/strategy/scenarios/run  { asOf, label, ...deltas }
    runScenario: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const body = req.body as ({ asOf: string } & ScenarioInput) | undefined;
        if (!body?.asOf || !body?.label) return { status: 400, body: { error: "asOf and label are required in the request body" } };
        const { asOf, ...input } = body;
        return { status: 200, body: await scenarioService.runScenario(asOf, input) };
      } catch (err) {
        return handleError(err);
      }
    },

    // POST /api/strategy/scenarios/compare  { asOf, scenarios: ScenarioInput[] }
    compareScenarios: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        assertInstitutionalAccess(req.caller);
        const body = req.body as { asOf: string; scenarios: ScenarioInput[] } | undefined;
        if (!body?.asOf || !Array.isArray(body?.scenarios)) return { status: 400, body: { error: "asOf and scenarios[] are required in the request body" } };
        return { status: 200, body: await scenarioService.compareScenarios(body.asOf, body.scenarios) };
      } catch (err) {
        return handleError(err);
      }
    },

    // GET /api/strategy/students/:studentId/personal-outlook?asOf=...   (student-safe)
    getPersonalOutlook: async (req: ApiRequest): Promise<ApiResult> => {
      try {
        const studentId = req.params.studentId;
        const asOf = req.query.asOf;
        if (!studentId || !asOf) return { status: 400, body: { error: "studentId path param and asOf query param are required" } };
        assertOwnStudentAccess(req.caller, studentId);
        const student = await repo.getStudentById(studentId, asOf);
        if (!student) return { status: 404, body: { error: "Student not found." } };
        const drives = await repo.getActiveDrives(await repo.getCurrentSeasonId());
        const eligible = drives.filter((d) => d.eligibleDepartmentIds.includes(student.departmentId) && d.requiredSkills.some((s) => student.skillTags.includes(s)));
        return {
          status: 200,
          body: {
            readinessScore: student.readinessScore,
            eligibleActiveOpportunities: eligible.length,
          },
        };
      } catch (err) {
        return handleError(err);
      }
    },
  };
}

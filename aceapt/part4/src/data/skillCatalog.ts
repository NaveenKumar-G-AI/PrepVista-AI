import type { Skill } from "../domain/types.js";

/**
 * A small but genuinely branching aptitude skill graph:
 *
 *   percentage-fundamentals ─▶ percentage-application ─▶ profit-loss ─▶ discount
 *                                                              └────────────┴──▶ commercial-arithmetic
 *   ratio-fundamentals ─▶ ratio-application
 *
 * commercial-arithmetic has two prerequisites on purpose — it lets the
 * priority engine's downstream-impact factor actually differ between
 * percentage-application (blocks 3 things) and ratio-application (blocks 0).
 */
export const SKILL_CATALOG: Skill[] = [
  {
    id: "percentage-fundamentals",
    name: "Percentage Fundamentals",
    category: "quantitative-aptitude",
    prerequisiteIds: [],
    baseRelevance: { PLACEMENT_PREP: 0.9, APTITUDE_PREP: 0.9, GENERAL_MASTERY: 0.7 },
    estimatedLearnMinutes: 20,
  },
  {
    id: "percentage-application",
    name: "Percentage Application",
    category: "quantitative-aptitude",
    prerequisiteIds: ["percentage-fundamentals"],
    baseRelevance: { PLACEMENT_PREP: 0.9, APTITUDE_PREP: 0.9, GENERAL_MASTERY: 0.7 },
    estimatedLearnMinutes: 25,
  },
  {
    id: "profit-loss",
    name: "Profit & Loss",
    category: "quantitative-aptitude",
    prerequisiteIds: ["percentage-application"],
    baseRelevance: { PLACEMENT_PREP: 0.85, APTITUDE_PREP: 0.85, GENERAL_MASTERY: 0.65 },
    estimatedLearnMinutes: 25,
  },
  {
    id: "discount",
    name: "Discount",
    category: "quantitative-aptitude",
    prerequisiteIds: ["profit-loss"],
    baseRelevance: { PLACEMENT_PREP: 0.7, APTITUDE_PREP: 0.7, GENERAL_MASTERY: 0.55 },
    estimatedLearnMinutes: 20,
  },
  {
    id: "commercial-arithmetic",
    name: "Commercial Arithmetic",
    category: "quantitative-aptitude",
    prerequisiteIds: ["profit-loss", "discount"],
    baseRelevance: { PLACEMENT_PREP: 0.75, APTITUDE_PREP: 0.75, GENERAL_MASTERY: 0.6 },
    estimatedLearnMinutes: 30,
  },
  {
    id: "ratio-fundamentals",
    name: "Ratio Fundamentals",
    category: "quantitative-aptitude",
    prerequisiteIds: [],
    baseRelevance: { PLACEMENT_PREP: 0.55, APTITUDE_PREP: 0.6, GENERAL_MASTERY: 0.6 },
    estimatedLearnMinutes: 20,
  },
  {
    id: "ratio-application",
    name: "Ratio Application",
    category: "quantitative-aptitude",
    prerequisiteIds: ["ratio-fundamentals"],
    baseRelevance: { PLACEMENT_PREP: 0.55, APTITUDE_PREP: 0.6, GENERAL_MASTERY: 0.6 },
    estimatedLearnMinutes: 25,
  },
];

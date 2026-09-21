import type { SkillNode } from "@/lib/domain/types";

/**
 * The diagnostic skill hierarchy for this prototype.
 *
 * Deliberately narrow and deep rather than broad and shallow (spec section
 * 69: "a small high-quality diagnostic can outperform a huge generic
 * question bank if the adaptive behavior is real"). Two chains are three
 * levels deep on purpose, so root-cause investigation
 * (rootCauseEngine.ts) has real prerequisite relationships to walk:
 *
 *   Q_PCT_F -> Q_PCT_A -> Q_PNL      (percentage fundamentals -> application -> profit & loss)
 *   L_SEAT_L -> L_SEAT_C             (linear -> circular seating)
 *   Q_RP_F -> Q_RP_A                 (ratio fundamentals -> application)
 *   V_VOC -> V_RC                    (vocabulary -> reading inference)
 */
export const SKILLS: SkillNode[] = [
  // ---- Quantitative ----------------------------------------------------
  {
    id: "Q_NS",
    domain: "QUANTITATIVE",
    topic: "Number Systems",
    subtopic: "Divisibility & Remainders",
    concept: "Remainder arithmetic",
    displayName: "Number Systems — Divisibility & Remainders",
    description: "Divisibility rules, remainder arithmetic, and combining remainder conditions.",
    prerequisiteSkillId: null,
  },
  {
    id: "Q_PCT_F",
    domain: "QUANTITATIVE",
    topic: "Arithmetic",
    subtopic: "Percentages",
    concept: "Percentage fundamentals",
    displayName: "Percentage Fundamentals",
    description: "Computing percentages of a quantity and reversing a percentage change.",
    prerequisiteSkillId: null,
  },
  {
    id: "Q_PCT_A",
    domain: "QUANTITATIVE",
    topic: "Arithmetic",
    subtopic: "Percentages",
    concept: "Percentage application",
    displayName: "Percentage Application",
    description: "Successive percentage changes, votes/population style problems, multi-step percentage reasoning.",
    prerequisiteSkillId: "Q_PCT_F",
  },
  {
    id: "Q_PNL",
    domain: "QUANTITATIVE",
    topic: "Arithmetic",
    subtopic: "Profit & Loss",
    concept: "Cost/selling price reasoning",
    displayName: "Profit & Loss",
    description: "Cost price, selling price, markup/discount composition, and combined profit-loss scenarios.",
    prerequisiteSkillId: "Q_PCT_A",
  },
  {
    id: "Q_RP_F",
    domain: "QUANTITATIVE",
    topic: "Arithmetic",
    subtopic: "Ratio & Proportion",
    concept: "Ratio fundamentals",
    displayName: "Ratio Fundamentals",
    description: "Dividing a quantity in a given ratio; combining two ratios.",
    prerequisiteSkillId: null,
  },
  {
    id: "Q_RP_A",
    domain: "QUANTITATIVE",
    topic: "Arithmetic",
    subtopic: "Ratio & Proportion",
    concept: "Ratio application",
    displayName: "Ratio & Proportion Application",
    description: "Multi-party shares and age/proportion problems built on ratio reasoning.",
    prerequisiteSkillId: "Q_RP_F",
  },

  // ---- Logical Reasoning -------------------------------------------------
  {
    id: "L_SEQ",
    domain: "LOGICAL",
    topic: "Series & Patterns",
    subtopic: "Number & letter series",
    concept: "Pattern extrapolation",
    displayName: "Number & Letter Series",
    description: "Identifying the rule governing a sequence and extrapolating it.",
    prerequisiteSkillId: null,
  },
  {
    id: "L_SEAT_L",
    domain: "LOGICAL",
    topic: "Arrangements",
    subtopic: "Seating Arrangement — Linear",
    concept: "Linear positional constraints",
    displayName: "Seating Arrangement — Linear",
    description: "Placing people in a row from relative-position constraints.",
    prerequisiteSkillId: null,
  },
  {
    id: "L_SEAT_C",
    domain: "LOGICAL",
    topic: "Arrangements",
    subtopic: "Seating Arrangement — Circular",
    concept: "Circular positional constraints",
    displayName: "Seating Arrangement — Circular",
    description: "Placing people around a circular table; adds wraparound and 'opposite' reasoning on top of linear placement skills.",
    prerequisiteSkillId: "L_SEAT_L",
  },
  {
    id: "L_BR",
    domain: "LOGICAL",
    topic: "Relations",
    subtopic: "Blood Relations",
    concept: "Family-relation chains",
    displayName: "Blood Relations",
    description: "Resolving family relationships from chained descriptions.",
    prerequisiteSkillId: null,
  },

  // ---- Verbal -------------------------------------------------------------
  {
    id: "V_VOC",
    domain: "VERBAL",
    topic: "Vocabulary",
    subtopic: "Vocabulary in Context",
    concept: "Synonym/antonym & contextual fit",
    displayName: "Vocabulary in Context",
    description: "Synonyms, antonyms, and choosing the word that fits a sentence's meaning.",
    prerequisiteSkillId: null,
  },
  {
    id: "V_RC",
    domain: "VERBAL",
    topic: "Reading Comprehension",
    subtopic: "Inference",
    concept: "Passage-based inference",
    displayName: "Reading Comprehension — Inference",
    description: "Drawing supported conclusions from a short passage without over-reaching beyond what's stated.",
    prerequisiteSkillId: "V_VOC",
  },
  {
    id: "V_GRAM",
    domain: "VERBAL",
    topic: "Grammar",
    subtopic: "Error Identification",
    concept: "Subject-verb agreement",
    displayName: "Grammar — Error Identification",
    description: "Spotting grammatical errors, including less-obvious subject-verb agreement rules.",
    prerequisiteSkillId: null,
  },
];

export const SKILL_MAP: Record<string, SkillNode> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s])
);

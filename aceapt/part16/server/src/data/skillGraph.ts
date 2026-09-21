/**
 * Micro-skill breakdown so a diagnosis can point at the specific failing
 * component instead of labelling the whole topic weak (Section 22).
 *
 * In a real deployment this graph already lives in Feature 14/15's skill
 * taxonomy — this module exists only because that system isn't part of this
 * codebase. Replace with a real lookup against your skill graph service.
 */
export interface MicroSkill {
  id: string;
  skillId: string; // parent topic skill
  label: string;
  order: number;
  prerequisiteMicroSkillIds: string[];
}

export const PROFIT_LOSS_SKILL_ID = 'skill_profit_loss';

export const PROFIT_LOSS_MICRO_SKILLS: MicroSkill[] = [
  { id: 'ms_cost_price', skillId: PROFIT_LOSS_SKILL_ID, label: 'Cost price', order: 1, prerequisiteMicroSkillIds: [] },
  { id: 'ms_selling_price', skillId: PROFIT_LOSS_SKILL_ID, label: 'Selling price', order: 2, prerequisiteMicroSkillIds: ['ms_cost_price'] },
  { id: 'ms_profit_loss', skillId: PROFIT_LOSS_SKILL_ID, label: 'Profit / loss amount', order: 3, prerequisiteMicroSkillIds: ['ms_selling_price'] },
  { id: 'ms_percentage', skillId: PROFIT_LOSS_SKILL_ID, label: 'Profit / loss percentage', order: 4, prerequisiteMicroSkillIds: ['ms_profit_loss'] },
  { id: 'ms_reverse', skillId: PROFIT_LOSS_SKILL_ID, label: 'Reverse problems (find CP/SP from %)', order: 5, prerequisiteMicroSkillIds: ['ms_percentage'] },
  { id: 'ms_mixed', skillId: PROFIT_LOSS_SKILL_ID, label: 'Mixed applications', order: 6, prerequisiteMicroSkillIds: ['ms_reverse'] },
];

export interface QuestionTemplate {
  id: string;
  microSkillId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  strategyLabel: string; // which method this template targets/tests
  render: (seed: number) => { prompt: string; answer: string; params: Record<string, number> };
}

function pick(seed: number, options: string[]): string {
  return options[seed % options.length];
}

/**
 * Deterministic parameterised templates for the "reverse problems" micro-skill —
 * the specific component exercised in the Section 48 demo scenario. Numbers,
 * context and phrasing vary by seed so the student can't pattern-match on
 * memorised numbers (Section 24).
 */
export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  {
    id: 'qt_reverse_from_profit_pct',
    microSkillId: 'ms_reverse',
    difficulty: 'medium',
    strategyLabel: 'Find CP from SP and profit %',
    render: (seed: number) => {
      const trader = pick(seed, ['a shopkeeper', 'a wholesaler', 'a trader', 'an online seller']);
      const item = pick(seed, ['a bicycle', 'a table', 'a mobile phone', 'a watch']);
      const profitPct = 10 + (seed % 5) * 5; // 10,15,20,25,30
      const cp = 400 + (seed % 12) * 50;
      const sp = Math.round(cp * (1 + profitPct / 100));
      return {
        prompt: `${trader} sold ${item} for ₹${sp}, making a profit of ${profitPct}%. What was the cost price?`,
        answer: `₹${cp}`,
        params: { profitPct, sp, cp },
      };
    },
  },
  {
    id: 'qt_reverse_from_loss_pct',
    microSkillId: 'ms_reverse',
    difficulty: 'medium',
    strategyLabel: 'Find CP from SP and loss %',
    render: (seed: number) => {
      const trader = pick(seed, ['a dealer', 'a retailer', 'a vendor']);
      const item = pick(seed, ['a chair', 'a laptop bag', 'a pair of shoes']);
      const lossPct = 5 + (seed % 4) * 5; // 5,10,15,20
      const cp = 300 + (seed % 10) * 40;
      const sp = Math.round(cp * (1 - lossPct / 100));
      return {
        prompt: `${trader} sold ${item} for ₹${sp}, incurring a loss of ${lossPct}%. What was the cost price?`,
        answer: `₹${cp}`,
        params: { lossPct, sp, cp },
      };
    },
  },
  {
    id: 'qt_strategy_check_reverse',
    microSkillId: 'ms_reverse',
    difficulty: 'easy',
    strategyLabel: 'Strategy-selection check (no calculation required)',
    render: (seed: number) => {
      return {
        prompt:
          'A trader sold an item at a known selling price and a known profit %. To find the cost price, should you divide the SP by (1 + profit%) or multiply the SP by (1 + profit%)?',
        answer: 'Divide the SP by (1 + profit%)',
        params: {},
      };
    },
  },
];

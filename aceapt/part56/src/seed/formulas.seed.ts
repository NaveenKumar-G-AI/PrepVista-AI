import { Formula, FormulaRelationship } from '../types';
import { validateAllDerivedForms } from '../validation/formulaValidator';
import { FormulaRepository } from '../repositories';

/**
 * Example canonical content for three formula families, matching the
 * worked scenarios in the Feature 56 spec (sections 100, 195, 244-249):
 * Speed-Distance-Time, and the Simple-vs-Compound-Interest confusion pair.
 *
 * THIS IS SEED / EXAMPLE CONTENT, not a content pipeline. In a real
 * deployment, canonical formulas come from your verified content team
 * (spec section 13) through whatever content-management flow Feature 56
 * reuses (section 146) - this file exists so the engine has something real
 * to run against out of the box, and so the automated tests in tests/ are
 * exercising real algebra rather than mocks.
 */

const now = new Date();

const speedDistanceTimeRaw: Formula = {
  formulaId: 'fx-speed-distance-time',
  canonicalName: 'Speed, Distance & Time',
  canonicalExpression: 'D = S * T',
  domain: 'Speed, Distance & Time',
  concept: 'speed-distance-time',
  meaning: 'Distance covered equals speed multiplied by the time spent travelling at that speed.',
  variables: [
    { symbol: 'D', meaning: 'Distance travelled', unit: 'km' },
    { symbol: 'S', meaning: 'Speed of travel', unit: 'km/h' },
    { symbol: 'T', meaning: 'Time taken', unit: 'h' },
  ],
  conditions: {
    whenToUse: 'Speed is constant over the interval, or a single average speed for the whole interval is given.',
    whenNotToUse:
      'Speed changes partway through the journey without an overall average being given - use total distance / total time instead of applying this directly to one leg.',
  },
  derivedForms: [
    { targetVariable: 'S', expression: 'S = D / T' },
    { targetVariable: 'T', expression: 'T = D / S' },
  ],
  status: 'PUBLISHED',
  version: 1,
  source: 'seed-content',
  createdAt: now,
  updatedAt: now,
};

const simpleInterestRaw: Formula = {
  formulaId: 'fx-simple-interest',
  canonicalName: 'Simple Interest',
  canonicalExpression: 'SI = (P * R * T) / 100',
  domain: 'Interest',
  concept: 'simple-interest',
  meaning:
    'Interest is calculated only on the original principal for every period - interest already earned is never itself added to the balance that earns further interest.',
  variables: [
    { symbol: 'SI', meaning: 'Simple interest earned', unit: 'currency' },
    { symbol: 'P', meaning: 'Principal (initial amount)', unit: 'currency' },
    { symbol: 'R', meaning: 'Annual interest rate', unit: '% per annum' },
    { symbol: 'T', meaning: 'Time period', unit: 'years' },
  ],
  conditions: {
    whenToUse: 'Interest for each period is computed on the original principal only, and is not reinvested into a growing balance.',
    whenNotToUse:
      'Interest earned in one period is added back into the balance and itself earns interest in later periods - that is compound interest, not simple interest.',
  },
  derivedForms: [
    { targetVariable: 'P', expression: 'P = (SI * 100) / (R * T)' },
    { targetVariable: 'R', expression: 'R = (SI * 100) / (P * T)' },
    { targetVariable: 'T', expression: 'T = (SI * 100) / (P * R)' },
  ],
  status: 'PUBLISHED',
  version: 1,
  source: 'seed-content',
  createdAt: now,
  updatedAt: now,
};

const compoundInterestRaw: Formula = {
  formulaId: 'fx-compound-interest',
  canonicalName: 'Compound Interest (annual compounding)',
  canonicalExpression: 'A = P * (1 + R / 100) ^ T',
  domain: 'Interest',
  concept: 'compound-interest',
  meaning:
    'Interest earned each year is added to the balance, so later years earn interest on the previously accumulated interest as well as on the original principal.',
  variables: [
    { symbol: 'A', meaning: 'Amount after T years', unit: 'currency' },
    { symbol: 'P', meaning: 'Principal (initial amount)', unit: 'currency' },
    { symbol: 'R', meaning: 'Annual interest rate', unit: '% per annum' },
    { symbol: 'T', meaning: 'Time period', unit: 'years' },
  ],
  conditions: {
    whenToUse: 'Interest earned each year is added to the balance and itself earns interest in subsequent years.',
    whenNotToUse:
      'Interest is paid out or otherwise not reinvested each period - that is simple interest, not compound interest.',
  },
  derivedForms: [
    { targetVariable: 'P', expression: 'P = A / (1 + R / 100) ^ T' },
    { targetVariable: 'T', expression: 'T = log(A / P) / log(1 + R / 100)' },
  ],
  status: 'PUBLISHED',
  version: 1,
  source: 'seed-content',
  createdAt: now,
  updatedAt: now,
};

function withValidatedDerivedForms(formula: Formula): Formula {
  const variableSymbols = formula.variables.map((v) => v.symbol);
  return {
    ...formula,
    derivedForms: validateAllDerivedForms(formula.canonicalExpression, formula.derivedForms, variableSymbols),
  };
}

export const SEED_FORMULAS: Formula[] = [
  withValidatedDerivedForms(speedDistanceTimeRaw),
  withValidatedDerivedForms(simpleInterestRaw),
  withValidatedDerivedForms(compoundInterestRaw),
];

export const SEED_RELATIONSHIPS: FormulaRelationship[] = [
  {
    id: 'rel-si-ci-confused',
    sourceFormulaId: 'fx-simple-interest',
    targetFormulaId: 'fx-compound-interest',
    relationshipType: 'OFTEN_CONFUSED_WITH',
    evidenceBacked: true,
  },
  {
    id: 'rel-si-ci-related',
    sourceFormulaId: 'fx-simple-interest',
    targetFormulaId: 'fx-compound-interest',
    relationshipType: 'RELATED_TO',
    evidenceBacked: true,
  },
];

export async function seedFormulaRepository(repo: FormulaRepository): Promise<void> {
  for (const formula of SEED_FORMULAS) {
    // Fail loudly if seed content ships with a broken derived form -
    // canonical content should never silently publish invalid algebra
    // (spec section 108).
    for (const form of formula.derivedForms) {
      if (form.validated === false) {
        throw new Error(`Seed formula "${formula.formulaId}" has an invalid derived form: ${form.expression}`);
      }
    }
    await repo.saveFormula(formula);
  }
  for (const relationship of SEED_RELATIONSHIPS) {
    await repo.saveRelationship(relationship);
  }
}

/**
 * Port for Feature 56 - Formula Intelligence (Section 39). Feature 47
 * decides WHEN to surface a formula; it never owns the formula catalog
 * itself.
 */
export interface FormulaLookup {
  name: string;
  expression: string;
  variables: string[];
  conditions?: string[];
  units?: Record<string, string>;
  relatedConcepts?: string[];
}

export interface FormulaIntelligencePort {
  getFormula(conceptId: string): Promise<FormulaLookup | null>;
}

export class NullFormulaIntelligencePort implements FormulaIntelligencePort {
  async getFormula(_conceptId: string): Promise<FormulaLookup | null> {
    return null;
  }
}

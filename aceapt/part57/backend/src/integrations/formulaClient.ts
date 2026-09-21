/** Feature 56 (Formula Intelligence) integration seam. See ./README.md. */
export interface FormulaSummary {
  formulaId: string;
  name: string;
  expression: string;
}

export interface FormulaClient {
  getFormula(formulaId: string): Promise<FormulaSummary | null>;
}

export class StubFormulaClient implements FormulaClient {
  async getFormula(_formulaId: string): Promise<FormulaSummary | null> {
    return null;
  }
}

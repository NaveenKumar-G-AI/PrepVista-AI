import { Formula, FormulaStatus } from '../types';
import { FormulaRepository } from '../repositories';

/**
 * Canonical lookup, search and status/version resolution (spec section
 * 165). This is the only place that decides "is this formula visible right
 * now" - everything else asks the registry rather than talking to the
 * repository directly, so that rule stays in one place.
 */
export class FormulaRegistry {
  constructor(private readonly repo: FormulaRepository) {}

  async getFormula(formulaId: string, opts?: { includeUnpublished?: boolean }): Promise<Formula | null> {
    const formula = await this.repo.getFormula(formulaId);
    if (!formula) return null;
    if (!opts?.includeUnpublished && formula.status !== 'PUBLISHED') return null;
    return formula;
  }

  /** For admin/content tooling - bypasses the published-only filter. */
  async getFormulaForAdmin(formulaId: string): Promise<Formula | null> {
    return this.repo.getFormula(formulaId);
  }

  async listByDomain(domain: string): Promise<Formula[]> {
    return this.repo.listFormulas({ domain, status: 'PUBLISHED' });
  }

  async listByStatus(status: FormulaStatus): Promise<Formula[]> {
    return this.repo.listFormulas({ status });
  }

  /**
   * Plain-text search over name/concept/domain/variables (spec section 83).
   * Semantic search ("I know speed and time, need distance") is a separate,
   * higher-effort capability layered on top of this - see
   * docs/INTEGRATION.md for where an AI-assisted semantic layer would plug
   * in (spec sections 84, 194), and section 107: don't spend an LLM call on
   * what a plain index can already answer.
   */
  async searchFormulas(query: string): Promise<Formula[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const published = await this.repo.listFormulas({ status: 'PUBLISHED' });
    return published.filter((formula) => {
      if (formula.canonicalName.toLowerCase().includes(q)) return true;
      if (formula.concept.toLowerCase().includes(q)) return true;
      if (formula.domain.toLowerCase().includes(q)) return true;
      return formula.variables.some((v) => v.symbol.toLowerCase() === q || v.meaning.toLowerCase().includes(q));
    });
  }
}

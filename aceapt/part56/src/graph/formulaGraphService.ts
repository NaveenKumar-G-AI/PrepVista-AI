import { FormulaRelationship, RelationshipType } from '../types';
import { FormulaRepository } from '../repositories';

/**
 * Formula relationships, confusion pairs, and derived/inverse-form lookups
 * (spec sections 20-22, 82, 166). Deliberately does not duplicate the
 * general Aptitude Skill Graph (Feature 45 in the source spec) - this graph
 * is scoped to formula-to-formula relationships only.
 */
export class FormulaGraphService {
  constructor(private readonly repo: FormulaRepository) {}

  async getRelationships(formulaId: string, type?: RelationshipType): Promise<FormulaRelationship[]> {
    const all = await this.repo.getRelationships(formulaId);
    return type ? all.filter((r) => r.relationshipType === type) : all;
  }

  /** IDs of formulas on the other end of an OFTEN_CONFUSED_WITH edge (symmetric). */
  async getConfusionPairs(formulaId: string): Promise<string[]> {
    const rels = await this.getRelationships(formulaId, 'OFTEN_CONFUSED_WITH');
    return rels.map((r) => (r.sourceFormulaId === formulaId ? r.targetFormulaId : r.sourceFormulaId));
  }

  async getRelated(formulaId: string): Promise<string[]> {
    const rels = await this.getRelationships(formulaId, 'RELATED_TO');
    return rels.map((r) => (r.sourceFormulaId === formulaId ? r.targetFormulaId : r.sourceFormulaId));
  }

  /**
   * True if formulaB is a known confusable/related formula for formulaA -
   * used by the error classifier to distinguish a condition-recognition
   * mistake (picked a real, closely related formula that just doesn't fit
   * this problem's condition) from a plain selection/recall lapse (picked
   * something unrelated). See spec sections 18-19, 39, 42, 211.
   */
  async areRelatedOrConfusable(formulaA: string, formulaB: string): Promise<boolean> {
    if (formulaA === formulaB) return false;
    const rels = await this.repo.getRelationships(formulaA);
    return rels.some(
      (r) =>
        (r.relationshipType === 'OFTEN_CONFUSED_WITH' ||
          r.relationshipType === 'RELATED_TO' ||
          r.relationshipType === 'SPECIAL_CASE_OF') &&
        (r.sourceFormulaId === formulaB || r.targetFormulaId === formulaB),
    );
  }
}

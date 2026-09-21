import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryFormulaRepository } from '../src/repositories';
import { FormulaRegistry } from '../src/registry/formulaRegistry';
import { FormulaGraphService } from '../src/graph/formulaGraphService';
import { seedFormulaRepository } from '../src/seed/formulas.seed';

describe('FormulaRegistry + FormulaGraphService', () => {
  let repo: InMemoryFormulaRepository;
  let registry: FormulaRegistry;
  let graph: FormulaGraphService;

  beforeEach(async () => {
    repo = new InMemoryFormulaRepository();
    await seedFormulaRepository(repo);
    registry = new FormulaRegistry(repo);
    graph = new FormulaGraphService(repo);
  });

  it('looks up a published formula by id', async () => {
    const formula = await registry.getFormula('fx-speed-distance-time');
    expect(formula?.canonicalName).toBe('Speed, Distance & Time');
  });

  it('does not return unpublished formulas from the student-facing lookup', async () => {
    const base = await repo.getFormula('fx-speed-distance-time');
    await repo.saveFormula({ ...(base as NonNullable<typeof base>), formulaId: 'fx-draft-example', status: 'DRAFT' });

    expect(await registry.getFormula('fx-draft-example')).toBeNull();
    expect(await registry.getFormulaForAdmin('fx-draft-example')).not.toBeNull();
  });

  it('searches by name, concept and variable meaning', async () => {
    const byName = await registry.searchFormulas('interest');
    expect(byName.map((f) => f.formulaId).sort()).toEqual(['fx-compound-interest', 'fx-simple-interest']);

    const byVariable = await registry.searchFormulas('principal');
    expect(byVariable.some((f) => f.formulaId === 'fx-simple-interest')).toBe(true);
  });

  it('returns nothing for an empty query', async () => {
    expect(await registry.searchFormulas('   ')).toEqual([]);
  });

  it('flags Simple Interest and Compound Interest as confusable', async () => {
    const confusable = await graph.getConfusionPairs('fx-simple-interest');
    expect(confusable).toContain('fx-compound-interest');
  });

  it('treats a confusable formula as "related" for condition-error classification', async () => {
    const related = await graph.areRelatedOrConfusable('fx-simple-interest', 'fx-compound-interest');
    expect(related).toBe(true);

    const unrelated = await graph.areRelatedOrConfusable('fx-simple-interest', 'fx-speed-distance-time');
    expect(unrelated).toBe(false);
  });
});

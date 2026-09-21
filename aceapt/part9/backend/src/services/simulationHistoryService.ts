import { DimensionScores, Simulation, SimulationComparison, SimulationHistoryEntry } from '../domain/types';
import { SimulationRepository } from '../repositories/simulationRepository';
import { round1 } from '../util/math';

// ============================================================
// SIMULATION HISTORY SERVICE  (spec sections 32, 33, 48)
// ============================================================
// Compares the student against their OWN history, not just a generic
// benchmark - spec section 32 is explicit about this.

const DIMENSION_KEYS: (keyof DimensionScores)[] = [
  'accuracy',
  'speed',
  'decisionQuality',
  'timeManagement',
  'consistency',
  'recovery',
  'endurance',
];

export class SimulationHistoryService {
  constructor(private repo: SimulationRepository) {}

  async getHistory(studentId: string): Promise<SimulationHistoryEntry[]> {
    const [simulations, results] = await Promise.all([
      this.repo.findByStudent(studentId),
      this.repo.getResultsForStudent(studentId),
    ]);
    const resultBySimId = new Map(results.map((r) => [r.simulationId, r]));

    return simulations
      .filter((s) => s.status === 'COMPLETED' && resultBySimId.has(s.id))
      .map((s) => {
        const result = resultBySimId.get(s.id)!;
        return {
          simulationId: s.id,
          completedAt: s.completedAt,
          overallScore: result.overallScore,
          dimensions: result.dimensions,
        };
      })
      .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  }

  /** Most recently completed simulation for this student BEFORE `current`. */
  async findPrevious(studentId: string, current: Simulation): Promise<SimulationHistoryEntry | undefined> {
    const history = await this.getHistory(studentId);
    const before = history.filter((h) => h.simulationId !== current.id && (h.completedAt ?? 0) < (current.completedAt ?? Infinity));
    return before.at(-1);
  }

  buildComparison(
    previous: SimulationHistoryEntry,
    currentSimulationId: string,
    currentOverallScore: number,
    currentDimensions: DimensionScores,
  ): SimulationComparison {
    const overallScoreDelta = round1(currentOverallScore - previous.overallScore);

    const dimensionDeltas = Object.fromEntries(
      DIMENSION_KEYS.map((key) => [key, round1(currentDimensions[key] - previous.dimensions[key])]),
    ) as unknown as DimensionScores;

    const [biggestGainKey, biggestGainValue] = (Object.entries(dimensionDeltas) as [keyof DimensionScores, number][]).reduce(
      (max, cur) => (cur[1] > max[1] ? cur : max),
    );

    const direction = overallScoreDelta >= 0 ? 'improved' : 'declined';
    const narrative =
      biggestGainValue > 0
        ? `Overall simulation performance ${direction} by ${Math.abs(overallScoreDelta)} points, with the largest improvement in ${splitCamel(biggestGainKey)}.`
        : `Overall simulation performance ${direction} by ${Math.abs(overallScoreDelta)} points versus the last simulation.`;

    return {
      previousSimulationId: previous.simulationId,
      overallScoreDelta,
      dimensionDeltas,
      narrative,
    };
  }
}

function splitCamel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').toLowerCase();
}

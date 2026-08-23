import type { MetricDefinitionRepository } from "../repositories/metricDefinitionRepository.js";
import type {
  ApplicationRepository,
  JoiningRepository,
  OfferRepository,
  StudentRepository,
} from "../repositories/sourceRepositories.js";
import type { MetricValue, Offer, Student } from "../types.js";

/**
 * DESIGN NOTE — why calculator_key instead of interpreting formula_definition:
 * metric_definitions.formula_definition is a human-readable string, shown
 * verbatim on every report so readers know exactly what a number means
 * (spec section 3). It is intentionally NOT parsed and executed as a DSL —
 * a generic formula interpreter is a large, fragile surface area (division
 * edge cases, injection risk if it ever touches raw SQL, near-impossible to
 * unit test exhaustively). Instead, calculator_key names a function below,
 * so every metric is: documented in plain language for humans, computed by
 * versioned, unit-tested code for the report. Adding a new institutional
 * metric = add a row to metric_definitions + register a calculator here.
 */

interface MetricContext {
  institutionId: string;
  season: string;
  department?: string;
  repos: {
    students: StudentRepository;
    applications: ApplicationRepository;
    offers: OfferRepository;
    joining: JoiningRepository;
  };
}

type CalculatorResult = { value: number; numerator: number; denominator: number };
type Calculator = (ctx: MetricContext) => CalculatorResult;

/** Students with a VERIFIED joined status this season — the only population that counts as "placed". */
function verifiedPlacements(ctx: MetricContext): { student: Student; offer: Offer }[] {
  const students = ctx.repos.students.findAll({
    institutionId: ctx.institutionId,
    season: ctx.season,
    department: ctx.department,
  });
  const studentById = new Map(students.map((s) => [s.id, s]));
  const offers = ctx.repos.offers.findAll({
    institutionId: ctx.institutionId,
    season: ctx.season,
  });

  const out: { student: Student; offer: Offer }[] = [];
  for (const offer of offers) {
    const student = studentById.get(offer.studentId);
    if (!student) continue; // outside this department/filter
    const joining = ctx.repos.joining.findByOfferId(offer.id);
    if (joining && joining.status === "joined" && joining.verified) {
      out.push({ student, offer });
    }
  }
  return out;
}

function medianOf(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const CALCULATORS: Record<string, Calculator> = {
  placement_rate(ctx) {
    const seeking = ctx.repos.students
      .findAll({ institutionId: ctx.institutionId, season: ctx.season, department: ctx.department })
      .filter((s) => s.seekingPlacement);
    const placedStudentIds = new Set(verifiedPlacements(ctx).map((p) => p.student.id));
    const denominator = seeking.length;
    const numerator = seeking.filter((s) => placedStudentIds.has(s.id)).length;
    return { numerator, denominator, value: denominator === 0 ? 0 : (numerator / denominator) * 100 };
  },

  median_ctc(ctx) {
    const ctcs = verifiedPlacements(ctx)
      .map((p) => p.offer.ctcFixed + p.offer.ctcVariable)
      .sort((a, b) => a - b);
    return { numerator: medianOf(ctcs), denominator: ctcs.length, value: medianOf(ctcs) };
  },

  average_ctc(ctx) {
    const ctcs = verifiedPlacements(ctx).map((p) => p.offer.ctcFixed + p.offer.ctcVariable);
    const avg = ctcs.length ? ctcs.reduce((a, b) => a + b, 0) / ctcs.length : 0;
    return { numerator: avg, denominator: ctcs.length, value: avg };
  },

  highest_ctc(ctx) {
    const ctcs = verifiedPlacements(ctx).map((p) => p.offer.ctcFixed + p.offer.ctcVariable);
    const max = ctcs.length ? Math.max(...ctcs) : 0;
    return { numerator: max, denominator: ctcs.length, value: max };
  },
};

/** Metrics where a tiny denominator makes the number misleading (spec sections 17-18). */
const SMALL_SAMPLE_METRICS = new Set(["median_ctc", "average_ctc", "highest_ctc"]);
const SMALL_SAMPLE_THRESHOLD = 5;

export class MetricService {
  constructor(
    private definitions: MetricDefinitionRepository,
    private students: StudentRepository,
    private applications: ApplicationRepository,
    private offers: OfferRepository,
    private joining: JoiningRepository
  ) {}

  registeredCalculatorKeys(): string[] {
    return Object.keys(CALCULATORS);
  }

  compute(
    institutionId: string,
    name: string,
    season: string,
    department?: string
  ): MetricValue {
    const def = this.definitions.getActive(institutionId, name);
    const calculator = CALCULATORS[def.calculatorKey];
    if (!calculator) {
      throw new Error(
        `metric_definition "${name}" references calculator_key "${def.calculatorKey}", ` +
          `which is not registered. Registered keys: ${this.registeredCalculatorKeys().join(", ")}`
      );
    }
    const ctx: MetricContext = {
      institutionId,
      season,
      department,
      repos: {
        students: this.students,
        applications: this.applications,
        offers: this.offers,
        joining: this.joining,
      },
    };
    const { value, numerator, denominator } = calculator(ctx);

    let caution: string | undefined;
    if (SMALL_SAMPLE_METRICS.has(name) && denominator > 0 && denominator < SMALL_SAMPLE_THRESHOLD) {
      caution = `Based on only ${denominator} record(s) — too small a group for a reliable ${name.replace(/_/g, " ")}.`;
    }

    return {
      metricName: name,
      value,
      numerator,
      denominator,
      definitionId: def.id,
      definitionVersion: def.version,
      formulaDefinition: def.formulaDefinition,
      denominatorDefinition: def.denominatorDefinition,
      computedAt: new Date().toISOString(),
      caution,
    };
  }
}

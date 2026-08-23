/**
 * PrepVista AI — Part 15
 * Forecast reliability thresholds — real business logic, not demo data.
 *
 * This constant used to live in repository/demo/seed.ts, which meant
 * services/forecast/ForecastService.ts and services/strategy/RecommendationEngine.ts
 * — both "real" architecture — imported a business rule from a file whose
 * entire purpose is to be deleted at integration time. That's the kind of
 * inconsistency `docs/PART15_INTEGRATION.md` explicitly promises doesn't
 * exist ("services only ever depend on the interface type"). Caught by
 * grepping for cross-references into repository/demo from outside
 * tests/demo/bootstrap, fixed by giving this constant a real home.
 *
 * Institutions should be able to tune this — a department with 15 students
 * might be plenty reliable for a well-established program and not enough for
 * a highly variable one. Exported as a plain constant for now; promote to a
 * per-institution config value (alongside PlacementTarget) if that need
 * becomes concrete.
 */

export const MIN_DEPARTMENT_SAMPLE_SIZE = 15;

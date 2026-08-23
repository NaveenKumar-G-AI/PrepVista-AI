export * from "./types.js";
export { evaluate, explain, evaluateStudent, pickPrimaryFailureCategory } from "./evaluate.js";
export { validateRuleTree, isRuleTreeValid } from "./validate.js";
export type { ValidationIssue } from "./validate.js";
export { summarizeCohort } from "./summarize.js";
export type { CohortSummary } from "./summarize.js";
export { simulateEligibility } from "./simulate.js";
export type { SimulationResult } from "./simulate.js";
export { openDb, migrate } from "./db.js";
export { canTransition, legalNextStates } from "./status.js";
export type { DriveStatus } from "./status.js";
export {
  createDrive, addRuleVersion, calculateAndSnapshotEligibility,
  transitionDriveStatus, getDrive, getAuditLog,
} from "./driveRepository.js";
export type { CreateDriveInput, AddRuleVersionResult, SnapshotResult, TransitionResult } from "./driveRepository.js";

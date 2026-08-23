import { actionRegistry } from "../registry/actionDefinition.js";
import { listUnappliedStudents } from "./listUnappliedStudents.js";
import { prepareApplicationReminder } from "./prepareApplicationReminder.js";
import { sendApplicationReminder } from "./sendApplicationReminder.js";
import { assignTrainingToCohort } from "./assignTrainingToCohort.js";
import { createTpoTask } from "./createTpoTask.js";
import { publishInterviewResults } from "./publishInterviewResults.js";
import { acceptOffer } from "./acceptOffer.js";
import { notifyStudentResultPublished } from "./notifyStudentResultPublished.js";

let registered = false;

/**
 * Registers the action catalog exactly once. This is the single choke point
 * for "which actions exist" (spec section 8: Action Catalog) — nothing else
 * in the codebase is allowed to call actionRegistry.register directly.
 */
export function registerActionCatalog(): void {
  if (registered) return;
  actionRegistry.register(listUnappliedStudents); // LEVEL 0 - READ
  actionRegistry.register(prepareApplicationReminder); // LEVEL 1 - PREPARE
  actionRegistry.register(createTpoTask); // LEVEL 2 - LOW_RISK_WRITE
  actionRegistry.register(sendApplicationReminder); // LEVEL 3 - SENSITIVE_WRITE
  actionRegistry.register(assignTrainingToCohort); // LEVEL 3 (escalates to 4)
  actionRegistry.register(publishInterviewResults); // LEVEL 4 - HIGH_RISK
  actionRegistry.register(acceptOffer); // LEVEL 4 - HIGH_RISK (student, own record only)
  actionRegistry.register(notifyStudentResultPublished); // LEVEL 2 - used by automation rules
  registered = true;
}

/**
 * Public surface of the ai-actions module (spec section 70):
 *
 *   proposeAction() / validateAction() / previewAction() / confirmAction() /
 *   executeAction() / getActionStatus() / cancelAction()
 *
 * Part 12 (the conversational AI layer) calls these instead of ever touching
 * a database directly. Part 13 (proactive signals) turns a `recommended_action`
 * into a proposeAction() call and stops there — Part 14 (this module) owns
 * everything from preview onward (spec section 71).
 */
import { registerActionCatalog } from "./actions/index.js";

export { actionEngine } from "./engine/actionEngine.js";
export { registerActionCatalog };
export { actionRegistry } from "./registry/actionDefinition.js";
export { automationRuleEngine, type AutomationRule, type DomainEvent } from "./automation/automationRuleEngine.js";
export { getAuditTrail } from "./engine/auditLogger.js";
export { auditRepo, actionRepo } from "./db/actionStore.js";
export * from "./types/action.types.js";

registerActionCatalog();

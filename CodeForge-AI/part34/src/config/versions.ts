// ============================================================================
// Phase 38 — "Every interview session should preserve: interview version,
// role model version, evaluation version. Historical results must remain
// interpretable after future system changes."
//
// Single source of truth for the two versions this codebase owns (interview
// engine + evaluation pipeline). roleModelVersion always comes from
// RoleContext (Phase 5 — sourced externally, never invented here). Bump
// these whenever blueprint semantics or evaluation scoring logic changes in
// a way that would make old sessions non-comparable to new ones.
// ============================================================================

export const INTERVIEW_ENGINE_VERSION = "interview-engine-2026.1";
export const EVALUATION_PIPELINE_VERSION = "eval-pipeline-2026.1";

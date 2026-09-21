# Frontend reference components

These four files are a working reference for the student-facing loop, not a
finished UI: **AdaptiveDiagnosticPage** (orchestrates start -> question loop ->
complete -> result, plus pause/resume and error recovery), **AdaptiveQuestion**
(renders a question and captures the response + response time), **DiagnosticProgress**
(the subtle "Building your aptitude profile" status - spec section 47), and
**DiagnosticResult** (capability summary + "Why?" + next-best-action, spec
sections 50-53).

The spec (section 63) names eight components; several of those collapse
naturally into one file here (e.g. `AdaptiveStatus` lives inside
`DiagnosticProgress`, and `CapabilitySummary` / `EvidenceExplanation` /
`NextBestAction` live inside `DiagnosticResult`) rather than being split into
near-empty files. Split them back apart if your design system's component
boundaries want that.

**Before using these for real:**

1. They are plain inline-styled components, not built against ACEAPT's
   actual design system/tokens (which this session didn't have access to).
   Treat the styling as a placeholder to reskin, not a deliverable.
2. `api.ts`'s `BASE_URL` is blank - point it at your real backend, and
   replace the `x-student-id` dev header in `src/api/middleware/auth.ts`
   with your real auth.
3. `AdaptiveQuestion`'s fallback renderer only handles a toy
   `{stem, choices, correctChoiceId}` shape so the file runs standalone -
   pass your existing question-rendering component in via
   `renderQuestionContent` instead (question content and grading are owned
   by your existing systems, not this engine - see spec section 4).

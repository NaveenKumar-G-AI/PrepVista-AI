/**
 * EvidenceExplorer — the drill-down behind one dimension's score.
 *
 * Renders the exact chain the spec requires: Concept -> Probe -> Student
 * Response -> Expected Evidence -> Observed Evidence -> Assessment ->
 * Recommendation. Nothing here is summarized away; this is the "show your
 * work" view for a score that already appeared, once, on DimensionCard.
 */
import type { EvidenceItem, Recommendation, UnderstandingDimension } from "@/types/index.js";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

function resultColorVar(result: EvidenceItem["result"]): string {
  if (result === "correct") return "var(--strong)";
  if (result === "partially_correct" || result === "ambiguous") return "var(--moderate)";
  return "var(--weak)";
}

const RESULT_LABEL: Record<EvidenceItem["result"], string> = {
  correct: "Correct",
  partially_correct: "Partially correct",
  incorrect: "Incorrect",
  ambiguous: "Ambiguous — needs follow-up",
  no_response: "No response",
};

export interface EvidenceExplorerProps {
  dimensionLabel: string;
  dimension: UnderstandingDimension;
  evidence: EvidenceItem[];
  recommendation?: Recommendation;
  onClose?: () => void;
}

export default function EvidenceExplorer({ dimensionLabel, evidence, recommendation, onClose }: EvidenceExplorerProps) {
  return (
    <div
      className="flex flex-col gap-4 rounded-xl border p-6"
      style={{
        // @ts-expect-error -- CSS custom properties are valid inline style keys.
        "--canvas": "#0B1210",
        "--surface": "#131B19",
        "--line": "#223330",
        "--ink": "#E7F1EC",
        "--ink-dim": "#8FA69D",
        "--strong": "#4FD1AE",
        "--moderate": "#E8B84B",
        "--weak": "#E2645A",
        backgroundColor: "var(--canvas)",
        borderColor: "var(--line)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg" style={{ fontFamily: FONT_SANS, color: "var(--ink)" }}>
          {dimensionLabel} — evidence
        </h3>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs outline-none focus-visible:ring-2"
            style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)", border: "1px solid var(--line)" }}
          >
            Close
          </button>
        )}
      </div>

      {evidence.length === 0 ? (
        <p className="text-sm" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
          No probes have been asked on this dimension yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-0">
          {evidence.map((item, idx) => (
            <li key={item.id} className="relative flex gap-4 pb-6 last:pb-0">
              {idx < evidence.length - 1 && (
                <span className="absolute left-[5px] top-4 h-full w-px" style={{ backgroundColor: "var(--line)" }} aria-hidden />
              )}
              <span
                className="relative z-10 mt-1 h-3 w-3 flex-none rounded-full"
                style={{ backgroundColor: resultColorVar(item.result) }}
                aria-hidden
              />
              <div className="flex flex-1 flex-col gap-2">
                <div className="text-[11px] uppercase tracking-[0.1em]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
                  {item.probe_type.replace(/_/g, " ")} · {item.concept}
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", backgroundColor: "var(--surface)" }}>
                  <div className="mb-1 text-[10px]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
                    PROBE
                  </div>
                  <p className="text-sm" style={{ fontFamily: FONT_SANS, color: "var(--ink)" }}>
                    {item.question}
                  </p>
                </div>

                <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                  <div className="mb-1 text-[10px]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
                    STUDENT RESPONSE
                  </div>
                  <p className="text-sm" style={{ fontFamily: FONT_SANS, color: "var(--ink)" }}>
                    {item.student_response || <em style={{ color: "var(--ink-dim)" }}>(no response)</em>}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-[10px]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
                      EXPECTED EVIDENCE
                    </div>
                    <p className="text-xs" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
                      {item.expected_evidence}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-[10px]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
                      OBSERVED EVIDENCE
                    </div>
                    <p className="text-xs" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
                      {item.observed_evidence}
                    </p>
                  </div>
                </div>

                <div
                  className="inline-flex w-fit items-center gap-2 rounded-full px-2 py-1 text-[11px]"
                  style={{ fontFamily: FONT_MONO, color: resultColorVar(item.result), border: `1px solid ${resultColorVar(item.result)}` }}
                >
                  {RESULT_LABEL[item.result]} · confidence {item.confidence}%
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {recommendation && (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--moderate)" }}>
          <div className="mb-1 text-[10px] uppercase tracking-[0.1em]" style={{ fontFamily: FONT_MONO, color: "var(--moderate)" }}>
            Recommended practice
          </div>
          <p className="text-sm" style={{ fontFamily: FONT_SANS, color: "var(--ink)" }}>
            {recommendation.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

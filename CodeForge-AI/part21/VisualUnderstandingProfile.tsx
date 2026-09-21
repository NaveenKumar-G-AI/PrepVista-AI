/**
 * VisualUnderstandingProfile — the top-level result view.
 *
 * Leads with the thing CodeForge's Understanding Check actually proves:
 * procedural competence and conceptual understanding are tracked as two
 * independent numbers, not one blended score (spec: "Procedural: 94,
 * Conceptual: 61 — this must be possible."). The dimension grid beneath it
 * is where a student goes to see WHY.
 */
import { DIMENSION_LABELS, UNDERSTANDING_DIMENSIONS, type EvidenceItem, type UnderstandingDimension, type UnderstandingProfile } from "@/types/index.js";
import DimensionCard from "./DimensionCard.js";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

const CLASSIFICATION_COPY: Record<UnderstandingProfile["classification"], { label: string; tone: "strong" | "moderate" | "weak" }> = {
  STRONG_UNDERSTANDING: { label: "Strong understanding demonstrated", tone: "strong" },
  UNDERSTANDING_DEMONSTRATED: { label: "Understanding demonstrated", tone: "strong" },
  PARTIAL_UNDERSTANDING: { label: "Partial understanding — some depth not yet shown", tone: "moderate" },
  UNDERSTANDING_GAP: { label: "Understanding gap identified", tone: "weak" },
  INSUFFICIENT_EVIDENCE: { label: "Not enough evidence yet", tone: "moderate" },
  UNCERTAIN: { label: "Evidence is mixed", tone: "moderate" },
};

function toneColor(tone: "strong" | "moderate" | "weak"): string {
  return tone === "strong" ? "var(--strong)" : tone === "moderate" ? "var(--moderate)" : "var(--weak)";
}

export interface VisualUnderstandingProfileProps {
  profile: UnderstandingProfile;
  evidence: EvidenceItem[];
  onOpenDimension?: (dimension: UnderstandingDimension) => void;
}

export default function VisualUnderstandingProfile({ profile, evidence, onOpenDimension }: VisualUnderstandingProfileProps) {
  const classification = CLASSIFICATION_COPY[profile.classification];
  const evidenceByDimension = new Map<UnderstandingDimension, EvidenceItem[]>();
  for (const dim of UNDERSTANDING_DIMENSIONS) evidenceByDimension.set(dim, []);
  for (const item of evidence) evidenceByDimension.get(item.dimension)?.push(item);

  return (
    <div
      className="flex flex-col gap-6 rounded-xl border p-6"
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
      <div>
        <div
          className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs"
          style={{ fontFamily: FONT_MONO, color: toneColor(classification.tone), border: `1px solid ${toneColor(classification.tone)}` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: toneColor(classification.tone) }} />
          {profile.classification.replace(/_/g, " ")}
        </div>
        <h2 className="text-xl" style={{ fontFamily: FONT_SANS, color: "var(--ink)" }}>
          {classification.label}
        </h2>
      </div>

      {/* Procedural vs Conceptual — the core differentiator. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
          <div className="text-[11px] uppercase tracking-[0.14em]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
            Procedural
          </div>
          <div className="text-4xl" style={{ fontFamily: FONT_MONO, color: "var(--ink)" }}>
            {profile.procedural_score}
          </div>
          <div className="text-xs" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
            Can reproduce the method
          </div>
        </div>
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--line)" }}>
          <div className="text-[11px] uppercase tracking-[0.14em]" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
            Conceptual
          </div>
          <div className="text-4xl" style={{ fontFamily: FONT_MONO, color: "var(--ink)" }}>
            {profile.conceptual_score}
          </div>
          <div className="text-xs" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
            Can explain, predict, debug, adapt, transfer
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
        <span>Confidence {profile.overall_confidence}%</span>
        <span>·</span>
        <span>Evidence strength: {profile.overall_evidence_strength}</span>
        <span>·</span>
        <span>{profile.probes_asked}/{profile.max_probes} probes</span>
      </div>

      {/* Dimension grid. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {UNDERSTANDING_DIMENSIONS.map((dim) => (
          <DimensionCard
            key={dim}
            label={DIMENSION_LABELS[dim]}
            profile={profile.dimensions[dim]}
            evidence={evidenceByDimension.get(dim) ?? []}
            onOpen={onOpenDimension}
          />
        ))}
      </div>
    </div>
  );
}

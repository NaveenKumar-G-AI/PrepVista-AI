/**
 * DimensionCard — one understanding dimension.
 *
 * Design intent (see frontend-design skill): this is a diagnostic-console
 * aesthetic, not a dashboard-template one. The signature element is the
 * "evidence thread" — a literal row of marks, one per evidence item, colored
 * by result. The point is structural: a score alone is unfalsifiable, but a
 * thread of individually-inspectable marks is not. It directly answers the
 * spec's "do not hide assessment logic behind a single unexplained score."
 *
 * Token system (scoped via inline CSS vars so this drops into a host app
 * without touching its Tailwind config):
 *   --surface   #131B19   card background
 *   --line      #223330   hairline borders/dividers
 *   --ink       #E7F1EC   primary text
 *   --ink-dim   #8FA69D   secondary text
 *   --strong    #4FD1AE   strong evidence / demonstrated / correct
 *   --moderate  #E8B84B   developing / partially correct / moderate
 *   --weak      #E2645A   gap / incorrect / weak
 * Type: label/numeric text in IBM Plex Mono, body text in IBM Plex Sans —
 * load both in the host app's root layout; system-ui fallback keeps this
 * component functional without them.
 */
import type { DimensionProfile, EvidenceItem } from "@/types/index.js";

const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const FONT_SANS = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";

const STATUS_LABEL: Record<DimensionProfile["status"], string> = {
  not_assessed: "Not yet assessed",
  insufficient_evidence: "Insufficient evidence",
  developing: "Developing",
  demonstrated: "Demonstrated",
  strong: "Strong",
  gap_identified: "Gap identified",
};

function statusColorVar(status: DimensionProfile["status"]): string {
  if (status === "strong" || status === "demonstrated") return "var(--strong)";
  if (status === "developing") return "var(--moderate)";
  if (status === "gap_identified") return "var(--weak)";
  return "var(--ink-dim)";
}

function resultColorVar(result: EvidenceItem["result"]): string {
  if (result === "correct") return "var(--strong)";
  if (result === "partially_correct" || result === "ambiguous") return "var(--moderate)";
  return "var(--weak)";
}

export interface DimensionCardProps {
  label: string;
  profile: DimensionProfile;
  evidence: EvidenceItem[];
  onOpen?: (dimension: DimensionProfile["dimension"]) => void;
}

export default function DimensionCard({ label, profile, evidence, onOpen }: DimensionCardProps) {
  const interactive = Boolean(onOpen);

  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => onOpen?.(profile.dimension) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.(profile.dimension);
              }
            }
          : undefined
      }
      className="group relative flex flex-col gap-3 rounded-lg border p-4 outline-none transition-colors focus-visible:ring-2"
      style={{
        // @ts-expect-error -- CSS custom properties are valid inline style keys.
        "--surface": "#131B19",
        "--line": "#223330",
        "--ink": "#E7F1EC",
        "--ink-dim": "#8FA69D",
        "--strong": "#4FD1AE",
        "--moderate": "#E8B84B",
        "--weak": "#E2645A",
        backgroundColor: "var(--surface)",
        borderColor: "var(--line)",
        cursor: interactive ? "pointer" : "default",
        outlineColor: "var(--strong)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[11px] uppercase tracking-[0.14em]"
          style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}
        >
          {label}
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            fontFamily: FONT_MONO,
            color: statusColorVar(profile.status),
            border: `1px solid ${statusColorVar(profile.status)}`,
          }}
        >
          {STATUS_LABEL[profile.status]}
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <div className="text-[10px]" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
            Score
          </div>
          <div className="text-3xl leading-none" style={{ fontFamily: FONT_MONO, color: "var(--ink)" }}>
            {profile.status === "not_assessed" ? "—" : profile.score}
          </div>
        </div>
        <div>
          <div className="text-[10px]" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
            Confidence
          </div>
          <div className="text-lg leading-none" style={{ fontFamily: FONT_MONO, color: "var(--ink-dim)" }}>
            {profile.status === "not_assessed" ? "—" : `${profile.confidence}%`}
          </div>
        </div>
      </div>

      {/* Signature element: the evidence thread. */}
      <div>
        <div className="mb-1 text-[10px]" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
          Evidence thread ({evidence.length})
        </div>
        <div className="flex gap-1" aria-hidden={evidence.length === 0}>
          {evidence.length === 0 ? (
            <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: "var(--line)" }} />
          ) : (
            evidence.map((item) => (
              <span
                key={item.id}
                title={`${item.probe_type} — ${item.result} (confidence ${item.confidence})`}
                className="h-1.5 flex-1 rounded-full transition-transform group-hover:scale-y-125"
                style={{ backgroundColor: resultColorVar(item.result) }}
              />
            ))
          )}
        </div>
      </div>

      {profile.identified_gaps.length > 0 && (
        <p className="line-clamp-2 text-xs" style={{ fontFamily: FONT_SANS, color: "var(--ink-dim)" }}>
          {profile.identified_gaps[0]}
        </p>
      )}
    </div>
  );
}

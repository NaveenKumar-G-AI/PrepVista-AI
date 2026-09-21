import React from "react";
import { EvidenceGauge } from "./EvidenceGauge";
import type { InterviewCoverageReport, SkillCoverageState } from "../src/domain/types";

// Coverage (assessment completeness) and evidence STATE (VERIFIED etc.) are
// different axes — this view only has the former from the API response
// shape used by useInterviewSession. Map coverage state to the nearest
// honest evidence-gauge zone rather than pretending to know more.
function coverageToGaugeState(s: SkillCoverageState): "UNASSESSED" | "UNCERTAIN" | "PARTIALLY_VERIFIED" | "VERIFIED" {
  if (s === "SUFFICIENTLY_ASSESSED") return "VERIFIED";
  if (s === "PARTIALLY_ASSESSED") return "PARTIALLY_VERIFIED";
  return "UNASSESSED";
}

export interface PostInterviewReportProps {
  coverage: InterviewCoverageReport;
  targetRole: string;
}

export function PostInterviewReport({ coverage, targetRole }: PostInterviewReportProps) {
  return (
    <div className="cf-root" style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
      <div className="cf-eyebrow">Interview report · {targetRole}</div>
      <h1 style={{ fontFamily: "var(--cf-font-display)", fontSize: 30, margin: "10px 0 4px" }}>
        Here's what the evidence shows.
      </h1>

      {!coverage.isComplete && (
        <div style={{
          background: "var(--cf-uncertain-bg)", color: "var(--cf-uncertain)", borderRadius: "var(--cf-radius)",
          padding: "12px 16px", margin: "16px 0", fontSize: 14,
        }}>
          This interview ended before every target skill was fully assessed. The skills marked below as
          "not yet assessed" or "partially verified" genuinely weren't covered in enough depth — this
          report says so plainly rather than rounding up.
        </div>
      )}

      <section style={{ display: "flex", flexWrap: "wrap", gap: 28, margin: "28px 0" }}>
        {coverage.requiredSkills.map((skill) => (
          <EvidenceGauge key={skill} skill={skill} state={coverageToGaugeState(coverage.perSkill[skill] ?? "UNASSESSED")} />
        ))}
      </section>

      <ReportSection title="Sufficiently verified" items={coverage.sufficientlyAssessed} tone="verified" empty="Nothing reached full verification this session." />
      <ReportSection title="Partially assessed" items={coverage.partiallyAssessed} tone="uncertain" empty="Nothing landed in this band." />
      <ReportSection title="Not yet assessed" items={coverage.unassessed} tone="gap" empty="Every target skill was at least touched on." />
    </div>
  );
}

function ReportSection({ title, items, tone, empty }: { title: string; items: string[]; tone: "verified" | "uncertain" | "gap"; empty: string }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <h2 style={{ fontFamily: "var(--cf-font-display)", fontSize: 17, marginBottom: 8 }}>{title}</h2>
      {items.length === 0 ? (
        <p style={{ color: "var(--cf-ink-faint)", fontSize: 14, fontStyle: "italic" }}>{empty}</p>
      ) : (
        <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((skill) => (
            <li key={skill} style={{
              fontFamily: "var(--cf-font-mono)", fontSize: 12, padding: "5px 10px", borderRadius: 6,
              background: `var(--cf-${tone}-bg)`, color: `var(--cf-${tone})`,
            }}>
              {skill}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

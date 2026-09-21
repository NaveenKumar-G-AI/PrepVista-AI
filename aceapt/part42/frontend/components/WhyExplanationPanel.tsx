import type { EvidenceTrace } from "../../src/types/domain.js";

export function WhyExplanationPanel({ traces }: { traces: EvidenceTrace[] }) {
  if (traces.length === 0) {
    return (
      <section className="diag-section">
        <h2 className="diag-h2">Why</h2>
        <p className="diag-lede">We need more evidence to confidently identify the reasons behind your results.</p>
      </section>
    );
  }

  return (
    <section className="diag-section">
      <h2 className="diag-h2">Why</h2>
      {traces.map((trace, i) => (
        <div key={i} className="diag-why-item">
          <p className="diag-why-conclusion">{trace.conclusion}</p>
          <p className="diag-why-evidence">{trace.supportingEvidence.join(" ")}</p>
        </div>
      ))}
    </section>
  );
}

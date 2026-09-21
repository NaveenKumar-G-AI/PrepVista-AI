import type { StudentDiagnosticProfile } from "../../src/types/domain.js";
import { CapabilitySkyline } from "./CapabilitySkyline.js";

function patternSentences(profile: StudentDiagnosticProfile): string[] {
  const sentences: string[] = [];

  for (const speed of profile.speedProfile) {
    const domain = profile.domainProfiles.find((d) => d.skillNodeId === speed.scopeNodeId);
    if (!domain || speed.label === "insufficient_evidence") continue;
    const accuracy = profile.accuracyProfile.find((a) => a.scopeNodeId === speed.scopeNodeId);
    if (speed.label === "fast" && accuracy && accuracy.accuracy < 0.6) {
      sentences.push(`In ${domain.nodeLabel}, you're moving quickly, but accuracy suggests some of that pace may be costing you.`);
    } else if (speed.label === "slow" && accuracy && accuracy.accuracy >= 0.7) {
      sentences.push(`In ${domain.nodeLabel}, your accuracy is solid, but questions are taking longer than expected — the knowledge is there, fluency may need work.`);
    }
  }

  for (const calibration of profile.confidenceCalibration) {
    const domain = profile.domainProfiles.find((d) => d.skillNodeId === calibration.scopeNodeId);
    if (!domain) continue;
    if (calibration.pattern === "overconfident") {
      sentences.push(`In ${domain.nodeLabel}, confidence has been running ahead of accuracy — worth double-checking answers you feel sure about.`);
    } else if (calibration.pattern === "underconfident") {
      sentences.push(`In ${domain.nodeLabel}, you're getting more right than your confidence ratings suggest — you may know more than you think here.`);
    }
  }

  for (const consistency of profile.consistency) {
    if (!consistency.isConsistent && consistency.chunkAccuracies.length > 0) {
      sentences.push("Performance has varied noticeably across the session rather than settling into a steady pattern — that's worth another look before drawing firm conclusions.");
      break; // one mention is enough at the top level; per-skill detail lives in the Why panel
    }
  }

  return sentences;
}

export function PerformancePatternPanel({ profile }: { profile: StudentDiagnosticProfile }) {
  const sentences = patternSentences(profile);
  const primaryBoundary = profile.difficultyBoundaries.find((b) => b.boundaryDetected) ?? profile.difficultyBoundaries[0];

  return (
    <section className="diag-section">
      <h2 className="diag-h2">Your performance pattern</h2>

      {primaryBoundary && (
        <div style={{ marginBottom: "1.5rem" }}>
          <CapabilitySkyline
            boundary={primaryBoundary}
            title={profile.domainProfiles.find((d) => d.skillNodeId === primaryBoundary.domainOrTopicNodeId)?.nodeLabel ?? "this domain"}
          />
        </div>
      )}

      {sentences.length > 0 ? (
        sentences.map((s, i) => (
          <p key={i} className="diag-lede" style={{ marginBottom: "0.75rem" }}>
            {s}
          </p>
        ))
      ) : (
        <p className="diag-lede">No unusual speed, confidence, or consistency patterns stood out yet — performance has been fairly steady.</p>
      )}
    </section>
  );
}

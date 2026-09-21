import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { DiagnosticResultPage } from "../../frontend/components/DiagnosticResultPage.js";
import { CapabilitySkyline } from "../../frontend/components/CapabilitySkyline.js";
import { buildStudentProfile } from "../../src/engine/studentProfileBuilder.js";
import { makeTestBlueprint, NODE } from "../fixtures/blueprintFixture.js";
import {
  runThroughRealPipeline,
  studentA_strongAcrossAllDomains,
  studentH_strongFoundationWeakAdvanced,
} from "../fixtures/studentArchetypes.js";

const blueprint = makeTestBlueprint();

describe("SSR render — DiagnosticResultPage", () => {
  it("renders a rich profile (strengths, weaknesses, boundary, recommendations) without throwing", () => {
    const profile = runThroughRealPipeline(blueprint, "s1", "student-h", studentH_strongFoundationWeakAdvanced(NODE.percentageBasics));
    const html = renderToString(<DiagnosticResultPage profile={profile} />);
    expect(html).toContain("Your aptitude starting point");
    expect(html).toContain("Your next best step");
  });

  it("renders a strong-across-the-board profile (weaknesses list legitimately empty)", () => {
    const skillIds = [NODE.percentageBasics, NODE.percentageChange, NODE.ratioBasics, NODE.numberSeriesBasics];
    const profile = runThroughRealPipeline(blueprint, "s2", "student-a", studentA_strongAcrossAllDomains(skillIds));
    const html = renderToString(<DiagnosticResultPage profile={profile} />);
    expect(html).toContain("Your strengths");
    expect(html).not.toContain("undefined");
  });

  it("renders a completely empty (zero-evidence) profile without crashing — Module 56 zero-responses case reaching the UI layer", () => {
    const profile = buildStudentProfile({ sessionId: "s3", studentId: "student-empty", blueprint, responses: [] });
    const html = renderToString(<DiagnosticResultPage profile={profile} />);
    expect(html).toContain("Still gathering evidence");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });

  it("renders the 'no urgent recommendation' branch when nothing needs_focus/developing exists", () => {
    const skillIds = [NODE.percentageBasics, NODE.percentageChange, NODE.ratioBasics, NODE.numberSeriesBasics];
    const profile = runThroughRealPipeline(blueprint, "s4", "student-a2", studentA_strongAcrossAllDomains(skillIds));
    const html = renderToString(<DiagnosticResultPage profile={profile} />);
    // Student A is strong everywhere, so recommendedNextStep should be empty or advance-only
    expect(html).not.toContain("undefined");
  });
});

describe("SSR render — CapabilitySkyline in isolation", () => {
  it("renders the no-boundary-detected branch", () => {
    const html = renderToString(
      <CapabilitySkyline
        boundary={{ domainOrTopicNodeId: "x", accuracyByDifficulty: { easy: 0.8, medium: 0.75 }, boundaryDetected: false, interpretation: "steady" }}
        title="Test Domain"
      />,
    );
    expect(html).toContain("svg");
    expect(html).not.toContain("breakdown point");
  });

  it("renders the boundary-detected branch with the annotated marker", () => {
    const html = renderToString(
      <CapabilitySkyline
        boundary={{ domainOrTopicNodeId: "x", accuracyByDifficulty: { easy: 0.95, medium: 0.82, hard: 0.41 }, boundaryDetected: true, interpretation: "drops at hard" }}
        title="Test Domain"
      />,
    );
    expect(html).toContain("breakdown point");
  });

  it("renders the empty-evidence branch (no crash, no NaN in coordinates)", () => {
    const html = renderToString(
      <CapabilitySkyline boundary={{ domainOrTopicNodeId: "x", accuracyByDifficulty: {}, boundaryDetected: false, interpretation: "none yet" }} title="Test Domain" />,
    );
    expect(html).not.toContain("NaN");
  });
});

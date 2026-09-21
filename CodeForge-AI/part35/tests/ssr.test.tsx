import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "react-dom/server";
import { EvidenceGauge } from "../frontend/EvidenceGauge";
import { PostInterviewReport } from "../frontend/PostInterviewReport";
import InterviewSessionView from "../frontend/InterviewSession";
import type { InterviewCoverageReport, EvidenceState } from "../src/domain/types";

describe("§53-54 real React SSR — every major render branch", () => {
  test("EvidenceGauge renders all four zones without crashing", () => {
    const states: EvidenceState[] = ["UNASSESSED", "UNCERTAIN", "PARTIALLY_VERIFIED", "VERIFIED"];
    for (const state of states) {
      const html = renderToString(React.createElement(EvidenceGauge, { skill: "SQL", state }));
      assert.ok(html.includes("<svg"), `EvidenceGauge(${state}) should render an svg`);
      assert.ok(html.length > 100);
    }
  });

  test("InterviewSessionView renders its start screen (pre-hook-call state) without crashing", () => {
    const html = renderToString(
      React.createElement(InterviewSessionView, {
        api: { apiBaseUrl: "http://localhost:8035", orgId: "org1", actorId: "cand1" },
        candidateId: "cand1",
        targetRole: "Backend Engineer",
        mode: "PROJECT_DEFENSE",
      })
    );
    assert.ok(html.includes("Start interview"));
    assert.ok(html.includes("Backend Engineer"));
  });

  test("PostInterviewReport renders complete coverage correctly (all three sections populated appropriately)", () => {
    const coverage: InterviewCoverageReport = {
      requiredSkills: ["SQL", "API_DESIGN"],
      perSkill: { SQL: "SUFFICIENTLY_ASSESSED", API_DESIGN: "SUFFICIENTLY_ASSESSED" },
      sufficientlyAssessed: ["SQL", "API_DESIGN"],
      partiallyAssessed: [],
      unassessed: [],
      isComplete: true,
    };
    const html = renderToString(React.createElement(PostInterviewReport, { coverage, targetRole: "Backend Engineer" }));
    assert.ok(!html.includes("ended before every target skill"), "must NOT show the incomplete-coverage banner when isComplete is true");
    assert.ok(html.includes("SQL"));
    assert.ok(html.includes("API_DESIGN"));
  });

  test("PostInterviewReport honestly surfaces incomplete coverage — the banner and the unassessed section both render", () => {
    const coverage: InterviewCoverageReport = {
      requiredSkills: ["SQL", "API_DESIGN"],
      perSkill: { SQL: "SUFFICIENTLY_ASSESSED", API_DESIGN: "UNASSESSED" },
      sufficientlyAssessed: ["SQL"],
      partiallyAssessed: [],
      unassessed: ["API_DESIGN"],
      isComplete: false,
    };
    const html = renderToString(React.createElement(PostInterviewReport, { coverage, targetRole: "Backend Engineer" }));
    assert.ok(html.includes("ended before every target skill"), "must show the incomplete-coverage banner when isComplete is false");
    assert.ok(html.includes("Not yet assessed"));
  });

  test("PostInterviewReport renders its empty-state copy when a section has zero skills, rather than an empty list", () => {
    const coverage: InterviewCoverageReport = {
      requiredSkills: ["SQL"],
      perSkill: { SQL: "SUFFICIENTLY_ASSESSED" },
      sufficientlyAssessed: ["SQL"],
      partiallyAssessed: [],
      unassessed: [],
      isComplete: true,
    };
    const html = renderToString(React.createElement(PostInterviewReport, { coverage, targetRole: "Backend Engineer" }));
    assert.ok(html.includes("Nothing landed in this band"));
    assert.ok(html.includes("Every target skill was at least touched on"));
  });
});

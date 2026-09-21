import { test, describe } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MasteryPath from "../../web/components/MasteryPath.js";
import NodeDetail from "../../web/components/NodeDetail.js";
import WhyThisPanel from "../../web/components/WhyThisPanel.js";
import TodaysMission from "../../web/components/TodaysMission.js";
import type { PathNodeView, PathVersionView } from "../../web/components/types.js";

function node(overrides: Partial<PathNodeView> = {}): PathNodeView {
  return {
    skillId: "sk1",
    skillName: "Percentage Application",
    order: 0,
    status: "IN_PROGRESS",
    priorityScore: 0.64,
    reason: "Application evidence needs more data.",
    estimatedMinutes: 25,
    action: { actionType: "PRACTICE", reason: "Application evidence needs more data." },
    ...overrides,
  };
}

describe("MasteryPath SSR — every status branch", () => {
  const statuses: PathNodeView["status"][] = ["VERIFIED", "IN_PROGRESS", "UPCOMING", "DEFERRED", "REVIEW_DUE"];

  for (const status of statuses) {
    test(`renders without throwing for status=${status}`, () => {
      const path: PathVersionView = { versionNumber: 1, reason: "test", tradeoffMessage: null, nodes: [node({ status })] };
      const html = renderToStaticMarkup(React.createElement(MasteryPath, { path }));
      assert.ok(html.includes("Percentage Application"));
    });
  }

  test("renders the empty-path branch when there are zero nodes", () => {
    const path: PathVersionView = { versionNumber: 1, reason: "Nothing left", tradeoffMessage: null, nodes: [] };
    const html = renderToStaticMarkup(React.createElement(MasteryPath, { path }));
    assert.ok(html.includes("Not enough evidence"));
  });

  test("renders the tradeoff banner branch when present", () => {
    const path: PathVersionView = { versionNumber: 2, reason: "test", tradeoffMessage: "Limited time before your deadline.", nodes: [node()] };
    const html = renderToStaticMarkup(React.createElement(MasteryPath, { path }));
    assert.ok(html.includes("Limited time"));
  });

  test("renders the overflow branch when there are more than MAX_VISIBLE_NODES", () => {
    const many = Array.from({ length: 9 }, (_, i) => node({ skillId: `sk${i}`, skillName: `Skill ${i}`, order: i }));
    const path: PathVersionView = { versionNumber: 1, reason: "test", tradeoffMessage: null, nodes: many };
    const html = renderToStaticMarkup(React.createElement(MasteryPath, { path }));
    assert.ok(html.includes("more further down your path"));
  });

  test("a single-node path does not crash the trail-curve math (division-by-zero guard)", () => {
    const path: PathVersionView = { versionNumber: 1, reason: "test", tradeoffMessage: null, nodes: [node()] };
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(MasteryPath, { path })));
  });
});

describe("NodeDetail SSR", () => {
  const why = { what: "Percentage Application", why: "Current focus: test", evidence: "foundation: 5 attempts, developing", impact: "Supports Profit & Loss.", next: "Targeted application practice." };

  test("renders with all three action buttons present", () => {
    const html = renderToStaticMarkup(
      React.createElement(NodeDetail, { node: node(), why, onStart: () => {}, onSkip: () => {}, onPostpone: () => {} })
    );
    assert.ok(html.includes("Start") && html.includes("Skip") && html.includes("Postpone"));
  });

  test("renders with no action buttons (read-only / verified node)", () => {
    const html = renderToStaticMarkup(React.createElement(NodeDetail, { node: node({ status: "VERIFIED" }), why }));
    assert.ok(html.includes("Verified"));
  });
});

describe("WhyThisPanel SSR", () => {
  test("renders all five rows", () => {
    const why = { what: "A", why: "B", evidence: "C", impact: "D", next: "E" };
    const html = renderToStaticMarkup(React.createElement(WhyThisPanel, { why }));
    for (const label of ["WHAT", "WHY", "EVIDENCE", "IMPACT", "NEXT"]) assert.ok(html.includes(label));
    for (const value of ["A", "B", "C", "D", "E"]) assert.ok(html.includes(`>${value}<`));
  });
});

describe("TodaysMission SSR", () => {
  test("renders segments and total minutes", () => {
    const mission = { totalMinutes: 25, segments: [{ label: "Warm-up", minutes: 5, description: "x" }, { label: "Practice", minutes: 20, description: "y" }] };
    const html = renderToStaticMarkup(React.createElement(TodaysMission, { mission, skillName: "Percentage Application" }));
    assert.ok(html.includes("25 min") && html.includes("Warm-up") && html.includes("Practice"));
  });

  test("renders the Start button branch only when onStart is provided", () => {
    const mission = { totalMinutes: 10, segments: [{ label: "Drill", minutes: 10, description: "x" }] };
    const withStart = renderToStaticMarkup(React.createElement(TodaysMission, { mission, skillName: "S", onStart: () => {} }));
    const withoutStart = renderToStaticMarkup(React.createElement(TodaysMission, { mission, skillName: "S" }));
    assert.ok(withStart.includes("<button"));
    assert.ok(!withoutStart.includes("<button"));
  });

  test("handles a zero-minute segment without dividing by zero in the bar width", () => {
    const mission = { totalMinutes: 0, segments: [{ label: "Nothing", minutes: 0, description: "x" }] };
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(TodaysMission, { mission, skillName: "S" })));
  });
});

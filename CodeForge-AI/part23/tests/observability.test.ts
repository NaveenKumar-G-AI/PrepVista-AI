import { describe, it, expect } from "vitest";
import { InMemoryMetricsSink, newCorrelationId, startTimer } from "../src/observability/metrics.js";

describe("InMemoryMetricsSink", () => {
  it("captures events in order and never receives free-text fields (type check enforces this at compile time)", () => {
    const sink = new InMemoryMetricsSink();
    const correlationId = newCorrelationId();
    sink.record({ type: "action_selected", correlationId, coachStateId: "s1", action: "INSPECT_VARIABLE", aiGenerated: true, informationGain: "HIGH" });
    sink.record({ type: "hint_escalation", correlationId, coachStateId: "s1", fromLevel: "QUESTION", toLevel: "DIRECTION" });
    expect(sink.events).toHaveLength(2);
    expect(sink.events[0]!.type).toBe("action_selected");
  });
});

describe("newCorrelationId", () => {
  it("produces distinct IDs across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newCorrelationId()));
    expect(ids.size).toBe(20);
  });
});

describe("startTimer", () => {
  it("measures a non-negative, monotonically sane duration", async () => {
    const elapsed = startTimer();
    await new Promise((r) => setTimeout(r, 10));
    const ms = elapsed();
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect } from "vitest";
import { PF2048_TEMPLATE } from "@/content/incidents/pf-2048";
import { activeEscalationRules, resolveEscalationLevel } from "@/lib/engine/escalation";

describe("escalation resolution", () => {
  it("stays at 0 before any rule threshold is crossed", () => {
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 10, false)).toBe(0);
  });

  it("escalates once the configured minutes-without-mitigation threshold passes", () => {
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 29, false)).toBe(0);
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 30, false)).toBe(1);
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 90, false)).toBe(1);
  });

  it("mitigation resets escalation to 0 regardless of elapsed time", () => {
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 90, true)).toBe(0);
  });

  it("is a pure function of its inputs (reproducibility)", () => {
    expect(resolveEscalationLevel(PF2048_TEMPLATE, 45, false)).toBe(resolveEscalationLevel(PF2048_TEMPLATE, 45, false));
  });

  it("activeEscalationRules returns the specific rule(s) once crossed, for alert-gating", () => {
    expect(activeEscalationRules(PF2048_TEMPLATE, 10, false)).toHaveLength(0);
    const active = activeEscalationRules(PF2048_TEMPLATE, 31, false);
    expect(active).toHaveLength(1);
    expect(active[0]!.addAlertType).toBe("DATABASE_CONNECTION_EXHAUSTION");
  });
});

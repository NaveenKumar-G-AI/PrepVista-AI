import { describe, it, expect } from "vitest";
import { canTransition, legalNextStates, type DriveStatus } from "../src/status.js";

describe("Drive status machine", () => {
  it("allows the documented happy path", () => {
    const path: [DriveStatus, DriveStatus][] = [
      ["DRAFT", "UNDER_REVIEW"],
      ["UNDER_REVIEW", "APPROVED"],
      ["APPROVED", "PUBLISHED"],
      ["PUBLISHED", "APPLICATIONS_OPEN"],
      ["APPLICATIONS_OPEN", "APPLICATIONS_CLOSED"],
      ["APPLICATIONS_CLOSED", "IN_PROGRESS"],
      ["IN_PROGRESS", "COMPLETED"],
    ];
    for (const [from, to] of path) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it("rejects skipping states", () => {
    expect(canTransition("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
  });

  it("rejects moving backward except UNDER_REVIEW -> DRAFT", () => {
    expect(canTransition("PUBLISHED", "APPROVED")).toBe(false);
    expect(canTransition("UNDER_REVIEW", "DRAFT")).toBe(true);
  });

  it("treats ARCHIVED as terminal", () => {
    expect(legalNextStates("ARCHIVED")).toEqual([]);
  });

  it("allows cancellation from every non-terminal state", () => {
    const nonTerminal: DriveStatus[] = [
      "DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED",
      "APPLICATIONS_OPEN", "APPLICATIONS_CLOSED", "IN_PROGRESS", "SELECTION_PENDING",
    ];
    for (const s of nonTerminal) {
      expect(canTransition(s, "CANCELLED")).toBe(true);
    }
  });
});

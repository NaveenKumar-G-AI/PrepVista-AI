"use client";

import { use, useState } from "react";
import styles from "./workspace.module.css";
import { HintLadderPanel } from "@/components/hint-ladder/HintLadderPanel";

const STARTER_CODE = `def solve(nums):
    total = 0
    for i in range(len(nums) - 1):
        total += nums[i]
    return total
`;

const VERDICT_OPTIONS = [
  { value: "WRONG_ANSWER:6", label: "Wrong answer — 6/10", verdict: "WRONG_ANSWER", passed: 6 },
  { value: "WRONG_ANSWER:8", label: "Wrong answer — 8/10", verdict: "WRONG_ANSWER", passed: 8 },
  { value: "RUNTIME_ERROR:0", label: "Runtime error", verdict: "RUNTIME_ERROR", passed: 0 },
  { value: "ACCEPTED:10", label: "Accepted — 10/10", verdict: "ACCEPTED", passed: 10 },
] as const;

export default function WorkspacePage({ params }: { params: Promise<{ problemId: string }> }) {
  const { problemId } = use(params);
  const [code, setCode] = useState(STARTER_CODE);
  const [selectedVerdict, setSelectedVerdict] = useState<(typeof VERDICT_OPTIONS)[number]["value"]>("WRONG_ANSWER:6");
  const [submitting, setSubmitting] = useState(false);
  const [lastRunNote, setLastRunNote] = useState<string | null>(null);

  const handleSimulateRun = async () => {
    setSubmitting(true);
    const option = VERDICT_OPTIONS.find((o) => o.value === selectedVerdict)!;
    try {
      const res = await fetch("/api/hint-ladder/demo-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId: problemId,
          code,
          simulatedVerdict: option.verdict,
          simulatedTestsPassed: option.passed,
        }),
      });
      if (res.status === 401) {
        setLastRunNote("Sign in to simulate a run — the demo needs an authenticated user id (see README).");
      } else if (res.ok) {
        setLastRunNote(`Recorded: ${option.label}. Ask the Hint Ladder for help now to see it react to this.`);
      } else {
        setLastRunNote("Could not record the simulated submission.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.editorPane}>
        <div className={styles.problemHeader}>
          <h1>Sum of Array Elements</h1>
          <p>
            Given an array of integers nums, return the sum of all elements in the array. Your solution should visit every valid index
            exactly once.
          </p>
        </div>

        <textarea className={styles.codeEditor} value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} />

        <div className={styles.demoControls}>
          <span className={styles.demoLabel}>Demo control — simulates execution, does not run code</span>
          <select className={styles.demoSelect} value={selectedVerdict} onChange={(e) => setSelectedVerdict(e.target.value as typeof selectedVerdict)}>
            {VERDICT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button className={styles.runButton} onClick={handleSimulateRun} disabled={submitting}>
            {submitting ? "Recording…" : "Simulate submission"}
          </button>
          {lastRunNote && <span className={styles.demoLabel}>{lastRunNote}</span>}
        </div>
      </div>

      <div className={styles.hintPane}>
        <HintLadderPanel
          problemId={problemId}
          onNavigateToLocation={(loc) => {
            // A real editor integration would scroll to loc.startLine here.
            // eslint-disable-next-line no-console
            console.log("Navigate to", loc);
          }}
        />
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { HypothesisCategory, HypothesisRow } from "@/lib/engine/types";
import { Panel, EmptyState } from "@/components/ui";

const CATEGORIES: HypothesisCategory[] = ["SYMPTOM", "IMMEDIATE_CAUSE", "ROOT_CAUSE", "CONTRIBUTING_FACTOR"];

export function HypothesisWorkspace({
  incidentId,
  candidateCauses,
  citedEvidence,
}: {
  incidentId: string;
  candidateCauses: { key: string; label: string; category: HypothesisCategory }[];
  citedEvidence: string[];
}) {
  const [hypotheses, setHypotheses] = useState<HypothesisRow[] | null>(null);
  const [statement, setStatement] = useState("");
  const [category, setCategory] = useState<HypothesisCategory>("ROOT_CAUSE");
  const [causeKey, setCauseKey] = useState(candidateCauses[0]?.key ?? "");
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.listHypotheses(incidentId).then((r) => setHypotheses(r.hypotheses));
  }
  useEffect(refresh, [incidentId]);

  async function submit() {
    if (statement.trim().length < 5) return;
    setSubmitting(true);
    try {
      await api.createHypothesis(incidentId, { statement, category, implicatedCauseKey: causeKey, evidenceRefs: selectedEvidence });
      setStatement("");
      setSelectedEvidence([]);
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(id: string, status: "CONFIRMED" | "REJECTED") {
    await api.updateHypothesis(incidentId, id, status);
    refresh();
  }

  return (
    <Panel title="Hypothesis workspace">
      <div className="space-y-2.5">
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          placeholder="What do you think is happening, and why?"
          rows={2}
          className="w-full rounded-md border border-console-border bg-console-raised px-2.5 py-2 text-xs outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as HypothesisCategory)}
            className="rounded-md border border-console-border bg-console-raised px-2 py-1.5 font-data text-[11px]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            value={causeKey}
            onChange={(e) => setCauseKey(e.target.value)}
            className="min-w-[220px] flex-1 rounded-md border border-console-border bg-console-raised px-2 py-1.5 font-data text-[11px]"
          >
            {candidateCauses.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {citedEvidence.length > 0 && (
          <div>
            <p className="mb-1 font-data text-[10px] uppercase tracking-wide text-console-textFaint">Attach evidence you&apos;ve cited</p>
            <div className="flex flex-wrap gap-1.5">
              {citedEvidence.map((ev) => (
                <button
                  key={ev}
                  onClick={() => setSelectedEvidence((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))}
                  className={`rounded border px-2 py-1 font-data text-[10px] ${
                    selectedEvidence.includes(ev)
                      ? "border-accent/40 bg-accent/15 text-accent-glow"
                      : "border-console-border bg-console-raised text-console-textMuted"
                  }`}
                >
                  {ev}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || statement.trim().length < 5}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-glow disabled:opacity-50"
        >
          Add hypothesis
        </button>
      </div>

      <div className="mt-4 space-y-2 border-t border-console-borderMuted pt-3">
        {!hypotheses ? (
          <EmptyState>Loading…</EmptyState>
        ) : hypotheses.length === 0 ? (
          <EmptyState>No hypotheses yet.</EmptyState>
        ) : (
          hypotheses.map((h) => (
            <div key={h.id} className="rounded-md border border-console-borderMuted p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">{h.category.replace("_", " ")}</span>
                  <p className="mt-0.5 text-xs">{h.statement}</p>
                  {h.evidenceRefs.length > 0 && (
                    <p className="mt-1 font-data text-[10px] text-console-textFaint">Evidence: {h.evidenceRefs.join(", ")}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-data text-[10px] font-semibold ${
                    h.status === "CONFIRMED"
                      ? "bg-sev-healthy/15 text-sev-healthy"
                      : h.status === "REJECTED"
                        ? "bg-console-raised text-console-textFaint line-through"
                        : "bg-sev-medium/15 text-sev-medium"
                  }`}
                >
                  {h.status}
                </span>
              </div>
              {h.status === "OPEN" && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setStatus(h.id, "CONFIRMED")} className="rounded border border-sev-healthy/30 px-2 py-0.5 font-data text-[10px] text-sev-healthy hover:bg-sev-healthy/10">
                    Confirm
                  </button>
                  <button onClick={() => setStatus(h.id, "REJECTED")} className="rounded border border-console-border px-2 py-0.5 font-data text-[10px] text-console-textFaint hover:bg-console-raised">
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

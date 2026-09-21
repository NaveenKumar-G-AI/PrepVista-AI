"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { EvaluationResults } from "@/components/EvaluationResults";
import { api } from "@/lib/client/api";
import { EvaluationResult } from "@/lib/engine/types";

function EvaluationPageInner({ incidentId }: { incidentId: string }) {
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const existing = await api.getEvaluation(incidentId);
      if (existing.evaluation) {
        setEvaluation(existing.evaluation);
      } else {
        const created = await api.runEvaluation(incidentId);
        setEvaluation(created.evaluation);
      }
      setLoading(false);
    })();
  }, [incidentId]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href={`/incidents/${incidentId}`} className="font-data text-xs text-console-textFaint hover:text-console-textMuted">
        ← Back to workspace
      </Link>
      <h1 className="mt-3 mb-6 text-xl font-semibold">Evaluation</h1>
      {loading || !evaluation ? (
        <p className="text-sm text-console-textMuted">Evaluating your response…</p>
      ) : (
        <EvaluationResults evaluation={evaluation} />
      )}
    </main>
  );
}

export default function EvaluationPage({ params }: { params: { incidentId: string } }) {
  return (
    <AuthGate>
      <EvaluationPageInner incidentId={params.incidentId} />
    </AuthGate>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { PostmortemForm } from "@/components/PostmortemForm";
import { api } from "@/lib/client/api";
import { IncidentTemplatePublic } from "@/lib/engine/types";

function PostmortemPageInner({ incidentId }: { incidentId: string }) {
  const [template, setTemplate] = useState<IncidentTemplatePublic | null>(null);

  useEffect(() => {
    api.getIncident(incidentId).then((r) => setTemplate(r.template));
  }, [incidentId]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href={`/incidents/${incidentId}`} className="font-data text-xs text-console-textFaint hover:text-console-textMuted">
        ← Back to workspace
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Postmortem</h1>
      <p className="mt-1 text-sm text-console-textMuted">Every section is required before you can submit for evaluation.</p>
      <div className="mt-6">{template && <PostmortemForm incidentId={incidentId} template={template} />}</div>
    </main>
  );
}

export default function PostmortemPage({ params }: { params: { incidentId: string } }) {
  return (
    <AuthGate>
      <PostmortemPageInner incidentId={params.incidentId} />
    </AuthGate>
  );
}

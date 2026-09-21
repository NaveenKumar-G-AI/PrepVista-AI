"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";
import { IncidentTemplatePublic, PostmortemRow } from "@/lib/engine/types";

const SECTIONS: { key: keyof typeof EMPTY; label: string; placeholder: string }[] = [
  { key: "summary", label: "Incident summary", placeholder: "What happened, in a couple of sentences?" },
  { key: "businessImpact", label: "Business impact", placeholder: "Who / what was affected, and how badly?" },
  { key: "timeline", label: "Timeline", placeholder: "Key timestamps from deploy to resolution." },
  { key: "rootCause", label: "Root cause", placeholder: "The actual underlying cause — not just the symptom." },
  { key: "contributingFactors", label: "Contributing factors", placeholder: "What made this possible or worse?" },
  { key: "detection", label: "Detection", placeholder: "How was this detected?" },
  { key: "mitigation", label: "Mitigation", placeholder: "What stopped the bleeding?" },
  { key: "permanentFix", label: "Permanent fix", placeholder: "What actually fixed the root cause?" },
  { key: "whatWentWell", label: "What went well", placeholder: "" },
  { key: "whatWentWrong", label: "What went wrong", placeholder: "" },
];

const EMPTY = {
  summary: "",
  businessImpact: "",
  timeline: "",
  rootCause: "",
  contributingFactors: "",
  detection: "",
  mitigation: "",
  permanentFix: "",
  whatWentWell: "",
  whatWentWrong: "",
  preventiveActionsNotes: "",
};

export function PostmortemForm({ incidentId, template }: { incidentId: string; template: IncidentTemplatePublic }) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [preventive, setPreventive] = useState<string[]>([]);
  const [fiveWhys, setFiveWhys] = useState<string[]>(["", "", "", "", ""]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    api.getPostmortem(incidentId).then((r) => {
      const pm = r.postmortem;
      if (!pm) return;
      setForm({
        summary: pm.summary ?? "",
        businessImpact: pm.businessImpact ?? "",
        timeline: pm.timeline ?? "",
        rootCause: pm.rootCause ?? "",
        contributingFactors: pm.contributingFactors ?? "",
        detection: pm.detection ?? "",
        mitigation: pm.mitigation ?? "",
        permanentFix: pm.permanentFix ?? "",
        whatWentWell: pm.whatWentWell ?? "",
        whatWentWrong: pm.whatWentWrong ?? "",
        preventiveActionsNotes: pm.preventiveActionsNotes ?? "",
      });
      setPreventive(pm.preventiveActionKeys ?? []);
      if (pm.fiveWhys?.length === 5) setFiveWhys(pm.fiveWhys);
    });
  }, [incidentId]);

  async function saveDraft() {
    setSaving(true);
    try {
      await api.savePostmortemDraft(incidentId, { ...form, preventiveActionKeys: preventive, fiveWhys });
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setErrors([]);
    await saveDraft();
    try {
      await api.submitPostmortem(incidentId);
      router.push(`/incidents/${incidentId}`);
    } catch (e) {
      const err = e as Error & { payload?: { errors?: string[] } };
      setErrors(err.payload?.errors ?? [err.message]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {SECTIONS.map((s) => (
        <div key={s.key}>
          <label className="mb-1 block font-data text-xs font-semibold uppercase tracking-wide text-console-textMuted">{s.label}</label>
          <textarea
            value={form[s.key]}
            onChange={(e) => setForm((prev) => ({ ...prev, [s.key]: e.target.value }))}
            placeholder={s.placeholder}
            rows={2}
            className="w-full rounded-md border border-console-border bg-console-raised px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
      ))}

      <div>
        <label className="mb-1 block font-data text-xs font-semibold uppercase tracking-wide text-console-textMuted">Preventive actions</label>
        <div className="flex flex-wrap gap-1.5">
          {template.candidatePreventiveActions.map((a) => (
            <button
              key={a.key}
              onClick={() => setPreventive((prev) => (prev.includes(a.key) ? prev.filter((k) => k !== a.key) : [...prev, a.key]))}
              className={`rounded border px-2.5 py-1.5 text-left text-xs ${
                preventive.includes(a.key) ? "border-accent/40 bg-accent/15 text-accent-glow" : "border-console-border bg-console-raised text-console-textMuted"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <textarea
          value={form.preventiveActionsNotes}
          onChange={(e) => setForm((prev) => ({ ...prev, preventiveActionsNotes: e.target.value }))}
          placeholder="Elaborate on the preventive actions above…"
          rows={2}
          className="mt-2 w-full rounded-md border border-console-border bg-console-raised px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="mb-1 block font-data text-xs font-semibold uppercase tracking-wide text-console-textMuted">Five whys</label>
        {fiveWhys.map((w, i) => (
          <input
            key={i}
            value={w}
            onChange={(e) => setFiveWhys((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
            placeholder={`Why #${i + 1}`}
            className="mb-1.5 w-full rounded-md border border-console-border bg-console-raised px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
        ))}
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-sev-critical/30 bg-sev-critical/10 px-3 py-2">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-sev-critical">
              {e}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={saveDraft} disabled={saving} className="rounded-md border border-console-border px-4 py-2 text-sm text-console-textMuted hover:bg-console-raised disabled:opacity-50">
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button onClick={submit} disabled={submitting} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-glow disabled:opacity-50">
          {submitting ? "Submitting…" : "Submit postmortem"}
        </button>
      </div>
    </div>
  );
}

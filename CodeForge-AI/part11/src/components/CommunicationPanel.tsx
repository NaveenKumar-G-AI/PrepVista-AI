"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { MessageRow } from "@/lib/engine/types";
import { Panel, EmptyState } from "@/components/ui";

const FIELDS: { key: keyof ReplyForm; label: string }[] = [
  { key: "currentImpact", label: "Current impact" },
  { key: "knownEvidence", label: "Known evidence" },
  { key: "hypothesis", label: "Hypothesis" },
  { key: "mitigation", label: "Mitigation" },
  { key: "currentStatus", label: "Current status" },
  { key: "nextAction", label: "Next action" },
];

interface ReplyForm {
  currentImpact: string;
  knownEvidence: string;
  hypothesis: string;
  mitigation: string;
  currentStatus: string;
  nextAction: string;
}

const EMPTY: ReplyForm = { currentImpact: "", knownEvidence: "", hypothesis: "", mitigation: "", currentStatus: "", nextAction: "" };

export function CommunicationPanel({ incidentId }: { incidentId: string }) {
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [form, setForm] = useState<ReplyForm>(EMPTY);
  const [sending, setSending] = useState(false);

  function refresh() {
    api.listMessages(incidentId).then((r) => setMessages(r.messages));
  }
  useEffect(refresh, [incidentId]);

  const hasUnanswered =
    messages?.some((m) => m.direction === "INBOUND") && !messages?.some((m) => m.direction === "OUTBOUND");

  async function send() {
    setSending(true);
    try {
      await api.sendMessage(incidentId, form);
      setForm(EMPTY);
      refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <Panel title="Communication">
      {!messages ? (
        <EmptyState>Loading…</EmptyState>
      ) : messages.length === 0 ? (
        <EmptyState>No stakeholder messages yet.</EmptyState>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={`rounded-md border px-3 py-2 ${m.direction === "INBOUND" ? "border-console-borderMuted" : "border-accent/25 bg-accent/5"}`}>
              <div className="flex items-center justify-between">
                <span className="font-data text-[11px] font-semibold text-console-textMuted">{m.sender}</span>
                <span className="font-data text-[10px] text-console-textFaint">t = {m.simMinutesAt}m</span>
              </div>
              {m.direction === "INBOUND" ? (
                <p className="mt-1 text-xs italic text-console-textMuted">&ldquo;{(m.body as { prompt?: string }).prompt}&rdquo;</p>
              ) : (
                <dl className="mt-1 space-y-1">
                  {FIELDS.map((f) => (
                    <div key={f.key}>
                      <dt className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">{f.label}</dt>
                      <dd className="text-xs text-console-text">{(m.body as Record<string, string>)[f.key]}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
        </div>
      )}

      {hasUnanswered && (
        <div className="mt-4 space-y-2 border-t border-console-borderMuted pt-3">
          <p className="font-data text-[10px] uppercase tracking-wide text-console-textFaint">Reply — every field required, no invented facts</p>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <input
                value={form[f.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.label}
                className="w-full rounded-md border border-console-border bg-console-raised px-2.5 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>
          ))}
          <button
            onClick={send}
            disabled={sending || Object.values(form).some((v) => v.trim().length === 0)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-glow disabled:opacity-50"
          >
            Send reply
          </button>
        </div>
      )}
    </Panel>
  );
}

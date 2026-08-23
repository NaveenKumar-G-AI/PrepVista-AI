import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ExternalLink, ListChecks } from "lucide-react";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { PriorityBadge, Button } from "../components/ui.js";
import { EmptyState } from "../components/EmptyState.js";
import { formatDueDate } from "../api/formatters.js";

const BUCKET_ORDER: Array<{ key: string; label: string; tone?: "risk" }> = [
  { key: "OVERDUE", label: "Overdue", tone: "risk" },
  { key: "TODAY", label: "Today" },
  { key: "TOMORROW", label: "Tomorrow" },
  { key: "THIS_WEEK", label: "This week" },
  { key: "LATER", label: "Later" },
  { key: "COMPLETED", label: "Recently completed" },
];

export default function FollowupsPage() {
  const [buckets, setBuckets] = useState<Record<string, any[]> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.followupCentre();
      setBuckets(res.buckets);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const complete = async (id: string) => {
    setBusyId(id);
    try {
      await api.completeFollowup(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await api.cancelFollowup(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const totalOpen = buckets
    ? BUCKET_ORDER.filter((b) => b.key !== "COMPLETED").reduce((sum, b) => sum + (buckets[b.key]?.length ?? 0), 0)
    : 0;

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-medium text-ink">Recruiter Follow-ups</h1>
        <p className="text-sm text-ink-soft">{loading ? "Loading…" : `${totalOpen} open across all companies`}</p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-ink-soft">Loading follow-ups…</div>
      ) : !buckets || totalOpen === 0 ? (
        <EmptyState
          icon={<ListChecks size={28} />}
          title="No open follow-ups"
          description="Nothing needs attention right now. Follow-ups created from a company dossier will show up here, grouped by how urgent they are."
        />
      ) : (
        <div className="space-y-6">
          {BUCKET_ORDER.map(({ key, label, tone }) => {
            const rows = buckets[key] ?? [];
            if (rows.length === 0) return null;
            return (
              <section key={key}>
                <h2 className={`mb-2 text-sm font-semibold ${tone === "risk" ? "text-signal-risk" : "text-ink"}`}>
                  {label} <span className="tabular font-normal text-ink-faint">({rows.length})</span>
                </h2>
                <div className="overflow-hidden rounded-lg border border-line bg-surface">
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.map((f) => {
                        const due = formatDueDate(f.due_at);
                        return (
                          <tr key={f.id} className="border-b border-line last:border-0">
                            <td className="px-3 py-2.5">
                              <Link to={`/companies/${f.company_id}`} className="font-medium text-ink hover:text-harbor">
                                {f.company_name}
                              </Link>
                              {f.contact_name && <p className="text-xs text-ink-soft">{f.contact_name}</p>}
                            </td>
                            <td className="px-3 py-2.5 text-ink">{f.title}</td>
                            <td className="px-3 py-2.5">
                              <PriorityBadge priority={f.priority} />
                            </td>
                            <td className={`px-3 py-2.5 font-medium ${due.overdue ? "text-signal-risk" : "text-ink-soft"}`}>{due.text}</td>
                            {key !== "COMPLETED" ? (
                              <td className="px-3 py-2.5">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" disabled={busyId === f.id} onClick={() => complete(f.id)} aria-label={`Complete ${f.title}`}>
                                    <CheckCircle2 size={15} />
                                  </Button>
                                  <Button variant="ghost" disabled={busyId === f.id} onClick={() => cancel(f.id)} aria-label={`Cancel ${f.title}`}>
                                    <XCircle size={15} />
                                  </Button>
                                  <Link to={`/companies/${f.company_id}`} className="flex items-center rounded-md px-2 text-ink-soft hover:bg-paper hover:text-ink">
                                    <ExternalLink size={15} />
                                  </Link>
                                </div>
                              </td>
                            ) : (
                              <td className="px-3 py-2.5 text-right text-xs text-ink-faint">{f.status === "CANCELLED" ? "Cancelled" : "Completed"}</td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

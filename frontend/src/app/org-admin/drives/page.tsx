"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Plus, RefreshCw, Target } from "lucide-react";

import { api } from "@/lib/api";

interface Drive {
  id: string;
  title: string;
  company_name: string;
  role: string;
  description?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DriveListResponse {
  items: Drive[];
}

interface RuleVersion {
  id: string;
  version_number: number;
  rule_tree: string | Record<string, unknown>;
  reason: string | null;
  created_at: string;
}

interface Snapshot {
  id: string;
  computed_at: string;
  total_students: number;
  eligible_count: number;
  not_eligible_count: number;
  category_breakdown: string | Record<string, number>;
}

interface AuditEntry {
  actor_label: string | null;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  occurred_at: string;
}

interface DriveDetailResponse {
  drive: Drive;
  latest_rule: RuleVersion | null;
  latest_snapshot: Snapshot | null;
  audit: AuditEntry[];
  legal_next_states: string[];
}

const STATUSES = [
  "DRAFT", "UNDER_REVIEW", "APPROVED", "PUBLISHED", "APPLICATIONS_OPEN",
  "APPLICATIONS_CLOSED", "IN_PROGRESS", "SELECTION_PENDING", "COMPLETED", "CANCELLED",
];

const STARTER_RULE = JSON.stringify({
  kind: "AND",
  children: [
    { kind: "LEAF", field: "readiness_score", comparator: "GTE", value: 60, category: "SCORE" },
  ],
}, null, 2);

function displayStatus(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseJsonObject(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== "string") return value;
  const parsed: unknown = JSON.parse(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

export default function PlacementDrivesPage() {
  const [drives, setDrives] = useState<Drive[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DriveDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [transitionReason, setTransitionReason] = useState("");
  const [ruleText, setRuleText] = useState(STARTER_RULE);
  const [ruleReason, setRuleReason] = useState("");

  const loadDrives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listPlacementDrives<DriveListResponse>(statusFilter ? { status: statusFilter } : {});
      const items = response.items ?? [];
      setDrives(items);
      setSelectedId((current) => current && items.some((drive) => drive.id === current) ? current : items[0]?.id ?? null);
    } catch (loadError) {
      setDrives([]);
      setSelectedId(null);
      setError(errorMessage(loadError, "Unable to load placement drives."));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const loadDetail = useCallback(async (driveId: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const response = await api.getPlacementDrive<DriveDetailResponse>(driveId);
      setDetail(response);
      if (response.latest_rule) {
        setRuleText(JSON.stringify(parseJsonObject(response.latest_rule.rule_tree), null, 2));
      } else {
        setRuleText(STARTER_RULE);
      }
    } catch (loadError) {
      setDetail(null);
      setError(errorMessage(loadError, "Unable to load the placement drive."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { void loadDrives(); }, [loadDrives]);
  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [loadDetail, selectedId]);

  const breakdown = useMemo(() => {
    if (!detail?.latest_snapshot) return {};
    return parseJsonObject(detail.latest_snapshot.category_breakdown) as Record<string, number>;
  }, [detail]);

  async function createDrive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await api.createPlacementDrive<Drive>({
        title,
        company_name: company,
        role,
        description: description || undefined,
      });
      setTitle("");
      setCompany("");
      setRole("");
      setDescription("");
      setShowCreate(false);
      setStatusFilter("");
      await loadDrives();
      setSelectedId(created.id);
      setSuccess("Placement drive created.");
    } catch (createError) {
      setError(errorMessage(createError, "Unable to create the placement drive."));
    } finally {
      setBusy(false);
    }
  }

  async function transition(toStatus: string) {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.transitionPlacementDrive(selectedId, {
        to_status: toStatus,
        reason: transitionReason || undefined,
      });
      setTransitionReason("");
      await Promise.all([loadDrives(), loadDetail(selectedId)]);
      setSuccess(`Drive moved to ${displayStatus(toStatus)}.`);
    } catch (transitionError) {
      setError(errorMessage(transitionError, "Unable to change drive status."));
    } finally {
      setBusy(false);
    }
  }

  async function saveRule() {
    if (!selectedId) return;
    setError(null);
    setSuccess(null);
    let ruleTree: unknown;
    try {
      ruleTree = JSON.parse(ruleText);
      if (!ruleTree || typeof ruleTree !== "object" || Array.isArray(ruleTree)) {
        throw new Error("The rule tree must be a JSON object.");
      }
    } catch (parseError) {
      setError(errorMessage(parseError, "Eligibility rule is not valid JSON."));
      return;
    }

    setBusy(true);
    try {
      await api.addPlacementDriveRule(selectedId, {
        rule_tree: ruleTree,
        reason: ruleReason || undefined,
      });
      setRuleReason("");
      await loadDetail(selectedId);
      setSuccess("A new eligibility rule version was saved.");
    } catch (saveError) {
      setError(errorMessage(saveError, "Unable to save the eligibility rule."));
    } finally {
      setBusy(false);
    }
  }

  async function computeSnapshot() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await api.computePlacementDriveSnapshot(selectedId);
      await loadDetail(selectedId);
      setSuccess("Eligibility snapshot computed from current student records.");
    } catch (snapshotError) {
      setError(errorMessage(snapshotError, "Unable to compute eligibility."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-blue-400">Placement operations</p>
            <h1 className="text-3xl font-bold">Placement Drives</h1>
            <p className="mt-1 text-sm text-slate-400">Manage drive lifecycle and immutable eligibility snapshots.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadDrives()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50">
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">
              <Plus size={16} /> New drive
            </button>
          </div>
        </header>

        {error && <div role="alert" className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle size={18} />{error}</div>}
        {success && <div role="status" className="flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><CheckCircle2 size={18} />{success}</div>}

        {showCreate && (
          <form onSubmit={createDrive} className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 md:grid-cols-2">
            <label className="text-sm">Drive title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <label className="text-sm">Company<input required maxLength={200} value={company} onChange={(event) => setCompany(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <label className="text-sm">Role<input required maxLength={200} value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <label className="text-sm">Description<input maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /></label>
            <button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 md:col-span-2">{busy ? "Creating…" : "Create drive"}</button>
          </form>
        )}

        <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">Status filter
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">
                <option value="">All active drives</option>
                {STATUSES.map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}
              </select>
            </label>
            <div className="mt-4 space-y-2">
              {loading && <div className="flex items-center gap-2 py-8 text-sm text-slate-400"><Loader2 size={18} className="animate-spin" />Loading drives…</div>}
              {!loading && drives.length === 0 && <p className="py-8 text-sm text-slate-400">No drives match this filter.</p>}
              {drives.map((drive) => (
                <button key={drive.id} type="button" onClick={() => setSelectedId(drive.id)} className={`w-full rounded-lg border p-3 text-left ${selectedId === drive.id ? "border-blue-500 bg-blue-500/10" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}>
                  <span className="block font-semibold">{drive.title}</span>
                  <span className="block text-sm text-slate-400">{drive.company_name} · {drive.role}</span>
                  <span className="mt-2 inline-block rounded-full bg-slate-800 px-2 py-1 text-xs text-blue-300">{displayStatus(drive.status)}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="min-w-0 space-y-5 rounded-xl border border-slate-800 bg-slate-900 p-5">
            {detailLoading && <div className="flex items-center gap-2 py-12 text-slate-400"><Loader2 className="animate-spin" />Loading drive…</div>}
            {!detailLoading && !detail && <div className="py-12 text-center text-slate-400"><Target className="mx-auto mb-3" />Select or create a placement drive.</div>}
            {!detailLoading && detail && (
              <>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-2xl font-bold">{detail.drive.title}</h2><p className="text-slate-400">{detail.drive.company_name} · {detail.drive.role}</p></div>
                    <span className="rounded-full bg-blue-500/15 px-3 py-1 text-sm text-blue-300">{displayStatus(detail.drive.status)}</span>
                  </div>
                  {detail.drive.description && <p className="mt-3 text-sm text-slate-300">{detail.drive.description}</p>}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <h3 className="font-semibold">Lifecycle</h3>
                  {detail.legal_next_states.length > 0 ? (
                    <><input value={transitionReason} maxLength={1000} onChange={(event) => setTransitionReason(event.target.value)} placeholder="Reason (optional)" className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" /><div className="mt-3 flex flex-wrap gap-2">{detail.legal_next_states.map((status) => <button key={status} type="button" disabled={busy} onClick={() => void transition(status)} className="rounded-lg border border-blue-500/40 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/10 disabled:opacity-50">Move to {displayStatus(status)}</button>)}</div></>
                  ) : <p className="mt-2 text-sm text-slate-400">This drive has reached its final lifecycle state.</p>}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Eligibility rule {detail.latest_rule ? `v${detail.latest_rule.version_number}` : ""}</h3><button type="button" disabled={busy || !detail.latest_rule} onClick={() => void computeSnapshot()} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50">Compute snapshot</button></div>
                  <p className="mt-2 text-xs text-slate-400">Fields: readiness_score, readiness_tier, is_zero_offer_risk, graduation_year, department, department_code, year, batch, section, student_code, total_sessions_completed, sessions_without_improvement, score_delta, target_role.</p>
                  <textarea aria-label="Eligibility rule JSON" spellCheck={false} value={ruleText} onChange={(event) => setRuleText(event.target.value)} className="mt-3 h-64 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs" />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={ruleReason} maxLength={1000} onChange={(event) => setRuleReason(event.target.value)} placeholder="Version reason (optional)" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" /><button type="button" disabled={busy} onClick={() => void saveRule()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">Save new version</button></div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <h3 className="font-semibold">Latest immutable snapshot</h3>
                  {detail.latest_snapshot ? <><p className="mt-1 text-xs text-slate-400">Computed {displayDate(detail.latest_snapshot.computed_at)}</p><div className="mt-4 grid grid-cols-3 gap-3 text-center"><div><p className="text-2xl font-bold">{detail.latest_snapshot.total_students}</p><p className="text-xs text-slate-400">Students</p></div><div><p className="text-2xl font-bold text-emerald-400">{detail.latest_snapshot.eligible_count}</p><p className="text-xs text-slate-400">Eligible</p></div><div><p className="text-2xl font-bold text-rose-400">{detail.latest_snapshot.not_eligible_count}</p><p className="text-xs text-slate-400">Not eligible</p></div></div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(breakdown).map(([category, count]) => <span key={category} className="rounded-full bg-slate-800 px-2 py-1 text-xs">{displayStatus(category)}: {count}</span>)}</div></> : <p className="mt-2 text-sm text-slate-400">Save a rule, then compute the first snapshot.</p>}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4"><h3 className="font-semibold">Audit trail</h3><div className="mt-3 space-y-2">{detail.audit.length === 0 && <p className="text-sm text-slate-400">No audit events.</p>}{detail.audit.map((entry, index) => <div key={`${entry.occurred_at}-${index}`} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 pb-2 text-sm"><span>{displayStatus(entry.event_type)}{entry.to_status ? ` → ${displayStatus(entry.to_status)}` : ""}</span><span className="text-slate-500">{displayDate(entry.occurred_at)}</span></div>)}</div></div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

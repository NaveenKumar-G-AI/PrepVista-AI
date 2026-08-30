"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { api } from "@/lib/api";

interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  website: string | null;
  sector: string | null;
  company_size: string | null;
  headquarters_city: string | null;
  description: string | null;
  relationship_stage: string;
  is_repeat_recruiter: boolean;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  preferred_channel: string | null;
  is_primary: boolean;
}

interface Activity {
  id: string;
  type: string;
  subject: string | null;
  summary: string | null;
  next_action: string | null;
  occurred_at: string;
}

interface Followup {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  due_at: string;
  status: string;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

interface Dossier {
  company: Company;
  contacts: Contact[];
  activities: Activity[];
  followups: Followup[];
  notes: Note[];
}

const STAGES = [
  "PROSPECT", "CONTACTED", "INTERESTED", "REQUIREMENT_RECEIVED", "DRIVE_SCHEDULED",
  "DRIVE_COMPLETED", "HIRING", "REPEAT_RECRUITER", "INACTIVE",
];
const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "VISIT", "RECRUITER_REQUEST", "REQUIREMENT_RECEIVED", "DRIVE_DISCUSSION", "FOLLOWUP", "NOTE", "OTHER"];

function label(value: string): string {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function getError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "The operation could not be completed.";
}

function safeWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export default function RecruiterCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [stageReason, setStageReason] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactDesignation, setContactDesignation] = useState("");
  const [contactPrimary, setContactPrimary] = useState(false);
  const [activityType, setActivityType] = useState("CALL");
  const [activitySubject, setActivitySubject] = useState("");
  const [activitySummary, setActivitySummary] = useState("");
  const [followupTitle, setFollowupTitle] = useState("");
  const [followupPriority, setFollowupPriority] = useState("MEDIUM");
  const [followupDue, setFollowupDue] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.getRecruiterCompany<Dossier>(companyId);
      setData(response);
      setStage(response.company.relationship_stage);
    } catch (loadError) {
      setData(null);
      setError(getError(loadError));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await action();
      await load();
      setSuccess(message);
      return true;
    } catch (actionError) {
      setError(getError(actionError));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeStage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await run(
      () => api.changeRecruiterCompanyStage(companyId, { stage, reason: stageReason || undefined }),
      "Relationship stage updated.",
    );
    if (succeeded) setStageReason("");
  }

  async function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await run(
      () => api.addRecruiterContact(companyId, {
        name: contactName,
        email: contactEmail || undefined,
        phone: contactPhone || undefined,
        designation: contactDesignation || undefined,
        is_primary: contactPrimary,
      }),
      "Recruiter contact added.",
    );
    if (succeeded) {
      setContactName(""); setContactEmail(""); setContactPhone(""); setContactDesignation(""); setContactPrimary(false);
    }
  }

  async function addActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await run(
      () => api.logRecruiterActivity(companyId, {
        type: activityType,
        subject: activitySubject || undefined,
        summary: activitySummary || undefined,
      }),
      "Activity logged.",
    );
    if (succeeded) { setActivitySubject(""); setActivitySummary(""); }
  }

  async function addFollowup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dueDate = new Date(followupDue);
    if (Number.isNaN(dueDate.getTime())) {
      setError("Choose a valid due date and time.");
      return;
    }
    const succeeded = await run(
      () => api.createRecruiterFollowup(companyId, {
        title: followupTitle,
        priority: followupPriority,
        due_at: dueDate.toISOString(),
      }),
      "Follow-up created.",
    );
    if (succeeded) { setFollowupTitle(""); setFollowupDue(""); }
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const succeeded = await run(() => api.addRecruiterCompanyNote(companyId, note), "Note added.");
    if (succeeded) setNote("");
  }

  async function completeFollowup(id: string) {
    await run(() => api.completeRecruiterFollowup(id), "Follow-up completed.");
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/org-admin/companies" className="mb-2 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft size={16} />Companies</Link>
            <h1 className="text-3xl font-bold">{data?.company.name ?? "Company dossier"}</h1>
            {data && <p className="mt-1 text-sm text-slate-400">{data.company.headquarters_city || "Location not recorded"} · {label(data.company.relationship_stage)}</p>}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
        </header>

        {error && <div role="alert" className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"><AlertCircle size={18} />{error}</div>}
        {success && <div role="status" className="flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"><CheckCircle2 size={18} />{success}</div>}
        {loading && !data && <div className="flex items-center gap-2 py-16 text-slate-400"><Loader2 className="animate-spin" />Loading company dossier…</div>}

        {data && (
          <>
            <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 md:grid-cols-[1fr_420px]">
              <div className="space-y-2 text-sm"><p>{data.company.description || "No company description has been recorded."}</p><p className="text-slate-400">Sector: {data.company.sector || "—"} · Size: {data.company.company_size || "—"}</p>{safeWebsite(data.company.website) && <a href={safeWebsite(data.company.website) ?? undefined} target="_blank" rel="noopener noreferrer" className="inline-block text-blue-400 hover:underline">{data.company.website}</a>}</div>
              <form onSubmit={changeStage} className="space-y-2"><label className="text-sm">Relationship stage<select value={stage} onChange={(event) => setStage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2">{STAGES.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select></label><input value={stageReason} onChange={(event) => setStageReason(event.target.value)} maxLength={1000} placeholder="Reason (optional)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button disabled={busy || stage === data.company.relationship_stage} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">Update stage</button></form>
            </section>

            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-lg font-semibold">Recruiter contacts</h2><div className="mt-3 space-y-2">{data.contacts.length === 0 && <p className="text-sm text-slate-400">No contacts yet.</p>}{data.contacts.map((contact) => <div key={contact.id} className="rounded-lg bg-slate-950 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{contact.name}</strong>{contact.is_primary && <span className="text-xs text-blue-400">Primary</span>}</div><p className="text-slate-400">{contact.designation || "Designation not recorded"}</p><p>{contact.email || contact.phone || "No contact method recorded"}</p></div>)}</div><form onSubmit={addContact} className="mt-4 grid gap-2 sm:grid-cols-2"><input required value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder="Name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input value={contactDesignation} onChange={(event) => setContactDesignation(event.target.value)} placeholder="Designation" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} placeholder="Email" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="Phone" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><label className="flex items-center gap-2 text-sm text-slate-400"><input type="checkbox" checked={contactPrimary} onChange={(event) => setContactPrimary(event.target.checked)} />Primary contact</label><button disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">Add contact</button></form></section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-lg font-semibold">Open follow-ups</h2><div className="mt-3 space-y-2">{data.followups.length === 0 && <p className="text-sm text-slate-400">No open follow-ups.</p>}{data.followups.map((followup) => <div key={followup.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 p-3 text-sm"><div><strong>{followup.title}</strong><p className="text-slate-400">{label(followup.priority)} · {formatDate(followup.due_at)}</p></div><button type="button" disabled={busy} onClick={() => void completeFollowup(followup.id)} className="rounded-lg border border-emerald-500/40 px-3 py-1 text-emerald-300 disabled:opacity-50">Complete</button></div>)}</div><form onSubmit={addFollowup} className="mt-4 grid gap-2 sm:grid-cols-2"><input required value={followupTitle} onChange={(event) => setFollowupTitle(event.target.value)} placeholder="Follow-up title" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><select value={followupPriority} onChange={(event) => setFollowupPriority(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option></select><input required type="datetime-local" value={followupDue} onChange={(event) => setFollowupDue(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">Create follow-up</button></form></section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-lg font-semibold">Activity timeline</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.activities.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}{data.activities.map((activity) => <div key={activity.id} className="rounded-lg bg-slate-950 p-3 text-sm"><div className="flex justify-between gap-2"><strong>{label(activity.type)}{activity.subject ? ` · ${activity.subject}` : ""}</strong><span className="text-xs text-slate-500">{formatDate(activity.occurred_at)}</span></div>{activity.summary && <p className="mt-1 text-slate-300">{activity.summary}</p>}</div>)}</div><form onSubmit={addActivity} className="mt-4 space-y-2"><div className="grid gap-2 sm:grid-cols-2"><select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm">{ACTIVITY_TYPES.map((value) => <option key={value}>{value}</option>)}</select><input value={activitySubject} onChange={(event) => setActivitySubject(event.target.value)} placeholder="Subject" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /></div><textarea value={activitySummary} onChange={(event) => setActivitySummary(event.target.value)} placeholder="Summary" className="h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button disabled={busy} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">Log activity</button></form></section>

              <section className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-lg font-semibold">Internal notes</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto">{data.notes.length === 0 && <p className="text-sm text-slate-400">No notes yet.</p>}{data.notes.map((entry) => <div key={entry.id} className="rounded-lg bg-slate-950 p-3 text-sm"><p>{entry.body}</p><p className="mt-1 text-xs text-slate-500">{formatDate(entry.created_at)}</p></div>)}</div><form onSubmit={addNote} className="mt-4 space-y-2"><textarea required maxLength={8000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add an internal note" className="h-28 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm" /><button disabled={busy} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50">Add note</button></form></section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

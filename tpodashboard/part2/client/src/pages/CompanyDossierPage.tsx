import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Phone,
  Mail,
  Linkedin,
  Star,
  UserPlus,
  MessageSquarePlus,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import { api } from "../api/client.js";
import { AppShell } from "../components/AppShell.js";
import { HealthChip } from "../components/RelationshipHealthChip.js";
import { StageBadge, STAGE_LABELS, PriorityBadge, Button, Card } from "../components/ui.js";
import { EmptyState } from "../components/EmptyState.js";
import { ContactModal } from "../components/ContactModal.js";
import { LogActivityModal } from "../components/LogActivityModal.js";
import { CreateFollowupModal } from "../components/CreateFollowupModal.js";
import { formatDate, formatDateTime, formatDueDate, formatRelativeDays } from "../api/formatters.js";

const TABS = ["Overview", "Contacts", "Timeline", "Notes", "Intelligence", "Drives", "Requirements", "Hiring History", "Documents"] as const;
type Tab = (typeof TABS)[number];

export default function CompanyDossierPage() {
  const { id } = useParams<{ id: string }>();
  const [ctx, setCtx] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [followups, setFollowups] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("Overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showCreateFollowup, setShowCreateFollowup] = useState(false);
  const [stageSaving, setStageSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const [company, contactsRes, followupsRes, notesRes, historyRes] = await Promise.all([
        api.getCompany(id),
        api.listContacts(id),
        api.listCompanyFollowups(id),
        api.listNotes(id),
        api.companyHistory(id),
      ]);
      setCtx(company);
      setContacts(contactsRes.contacts);
      setFollowups(followupsRes.followups);
      setNotes(notesRes.notes);
      setHistory(historyRes.history);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-ink-soft">Loading company…</div>
      </AppShell>
    );
  }
  if (error || !ctx) {
    return (
      <AppShell>
        <EmptyState title="Couldn't load this company" description="It may have been archived, or there was a connection problem." action={<Button onClick={load}>Retry</Button>} />
      </AppShell>
    );
  }

  const { company } = ctx;
  const openFollowups = followups.filter((f) => f.displayStatus === "OPEN" || f.displayStatus === "IN_PROGRESS" || f.displayStatus === "OVERDUE");
  const nextFollowup = [...openFollowups].sort((a, b) => a.due_at.localeCompare(b.due_at))[0];

  const onStageChange = async (stage: string) => {
    setStageSaving(true);
    try {
      await api.changeStage(company.id, stage);
      await load();
    } finally {
      setStageSaving(false);
    }
  };

  return (
    <AppShell>
      <Link to="/companies" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} /> All companies
      </Link>

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs text-ink-faint">
            {ctx.company.industry_id ? "Industry set" : "No industry set"} · {company.headquarters_city || "No city set"}
          </div>
          <h1 className="font-display text-3xl font-medium text-ink">{company.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={company.relationship_stage}
              onChange={(e) => onStageChange(e.target.value)}
              disabled={stageSaving}
              className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-soft"
              aria-label="Relationship stage"
            >
              {Object.entries(STAGE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {ctx.isRepeatRecruiter && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-1 text-xs font-medium text-gold">
                <Star size={12} /> Repeat recruiter
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddContact(true)}>
            <UserPlus size={15} /> Add contact
          </Button>
          <Button onClick={() => setShowLogActivity(true)}>
            <MessageSquarePlus size={15} /> Log interaction
          </Button>
          <Button variant="primary" onClick={() => setShowCreateFollowup(true)}>
            <CalendarPlus size={15} /> Schedule follow-up
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <HealthChip health={ctx.relationshipHealth.health} reason={ctx.relationshipHealth.reason} />
        <Card className="px-3 py-2">
          <p className="text-xs font-medium text-ink-faint">Next action</p>
          {nextFollowup ? (
            <>
              <p className="text-sm font-medium text-ink">{nextFollowup.title}</p>
              <p className={`text-xs ${formatDueDate(nextFollowup.due_at).overdue ? "text-signal-risk" : "text-ink-soft"}`}>
                {formatDueDate(nextFollowup.due_at).text}
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">Nothing scheduled</p>
          )}
        </Card>
        <Card className="px-3 py-2">
          <p className="text-xs font-medium text-ink-faint">Primary contact</p>
          {ctx.primaryContact ? (
            <>
              <p className="text-sm font-medium text-ink">{ctx.primaryContact.name}</p>
              <p className="text-xs text-ink-soft">{ctx.primaryContact.designation || "—"}</p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">No contact added yet</p>
          )}
        </Card>
      </div>

      {/* Quick metrics */}
      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 md:grid-cols-6">
        <Metric label="Drives" value={ctx.drivesCount} />
        <Metric label="Students hired" value={ctx.studentsHiredCount} />
        <Metric label="Contacts" value={ctx.contactCount} />
        <Metric label="Open follow-ups" value={ctx.openFollowupCount} />
        <Metric label="Overdue" value={ctx.overdueFollowupCount} warn={ctx.overdueFollowupCount > 0} />
        <Metric label="Last contact" value={formatRelativeDays(company.daysSinceLastContact ?? null)} small />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-harbor text-ink" : "text-ink-soft hover:text-ink"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab ctx={ctx} company={company} openFollowups={openFollowups} />}
      {tab === "Contacts" && (
        <ContactsTab
          contacts={contacts}
          onAdd={() => setShowAddContact(true)}
          onEdit={(c) => setEditingContact(c)}
          onSetPrimary={async (c) => {
            await api.setPrimaryContact(c.id);
            load();
          }}
          onDeactivate={async (c) => {
            await api.deactivateContact(c.id);
            load();
          }}
        />
      )}
      {tab === "Timeline" && <TimelineTab history={history} />}
      {tab === "Notes" && <NotesTab companyId={company.id} notes={notes} onAdded={load} />}
      {tab === "Intelligence" && <IntelligenceTab ctx={ctx} followups={followups} />}
      {tab === "Drives" && (
        <EmptyState title="No placement history yet" description="Historical drives will appear here once the Drives module (Part 3) is connected." />
      )}
      {tab === "Requirements" && (
        <EmptyState title="No requirements tracked yet" description="Job requirements will appear here once that module is connected. Requirement-received activity is logged in the Timeline tab today." />
      )}
      {tab === "Hiring History" && (
        <EmptyState title="No placement history yet" description="Historical drives and hiring outcomes will appear here once connected." />
      )}
      {tab === "Documents" && (
        <EmptyState title="No documents yet" description="Company profile, requirement letters, and MOUs will appear here." />
      )}

      {showAddContact && <ContactModal companyId={company.id} onClose={() => setShowAddContact(false)} onSaved={() => { setShowAddContact(false); load(); }} />}
      {editingContact && (
        <ContactModal companyId={company.id} existing={editingContact} onClose={() => setEditingContact(null)} onSaved={() => { setEditingContact(null); load(); }} />
      )}
      {showLogActivity && (
        <LogActivityModal companyId={company.id} contacts={contacts} onClose={() => setShowLogActivity(false)} onSaved={() => { setShowLogActivity(false); load(); }} />
      )}
      {showCreateFollowup && (
        <CreateFollowupModal companyId={company.id} contacts={contacts} onClose={() => setShowCreateFollowup(false)} onSaved={() => { setShowCreateFollowup(false); load(); }} />
      )}
    </AppShell>
  );
}

function Metric({ label, value, warn, small }: { label: string; value: string | number; warn?: boolean; small?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-faint">{label}</p>
      <p className={`tabular font-display ${small ? "text-sm" : "text-xl"} font-medium ${warn ? "text-signal-risk" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ ctx, company, openFollowups }: { ctx: any; company: any; openFollowups: any[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Open follow-ups</h3>
        {openFollowups.length === 0 ? (
          <p className="text-sm text-ink-soft">Nothing open right now.</p>
        ) : (
          <ul className="space-y-2">
            {openFollowups.map((f) => (
              <li key={f.id} className="flex items-center justify-between text-sm">
                <span className="text-ink">{f.title}</span>
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={f.priority} />
                  <span className={formatDueDate(f.due_at).overdue ? "text-signal-risk" : "text-ink-soft"}>{formatDueDate(f.due_at).text}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-ink">Company details</h3>
        <dl className="space-y-1.5 text-sm">
          <Row k="Website" v={company.website || "—"} />
          <Row k="Sector" v={company.sector || "—"} />
          <Row k="Company size" v={company.company_size || "—"} />
          <Row k="Location" v={[company.headquarters_city, company.headquarters_state, company.headquarters_country].filter(Boolean).join(", ") || "—"} />
          <Row k="Created" v={formatDate(company.created_at)} />
        </dl>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-soft">{k}</dt>
      <dd className="text-right text-ink">{v}</dd>
    </div>
  );
}

function ContactsTab({
  contacts,
  onAdd,
  onEdit,
  onSetPrimary,
  onDeactivate,
}: {
  contacts: any[];
  onAdd: () => void;
  onEdit: (c: any) => void;
  onSetPrimary: (c: any) => void;
  onDeactivate: (c: any) => void;
}) {
  if (contacts.length === 0) {
    return <EmptyState title="No recruiter contacts recorded" description="Add the first contact for this company." action={<Button variant="primary" onClick={onAdd}><UserPlus size={15} /> Add contact</Button>} />;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {contacts.map((c) => (
        <Card key={c.id} className={`p-4 ${c.status === "INACTIVE" ? "opacity-60" : ""}`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-ink">
                {c.name} {c.is_primary === 1 && <Star size={12} className="ml-1 inline text-gold" />}
              </p>
              <p className="text-xs text-ink-soft">{c.designation || "—"}</p>
            </div>
            {c.status === "INACTIVE" && <span className="text-xs text-ink-faint">Inactive</span>}
          </div>
          <div className="mt-2 space-y-1 text-sm text-ink-soft">
            {c.email && (
              <p className="flex items-center gap-1.5">
                <Mail size={13} /> {c.email}
              </p>
            )}
            {c.phone && (
              <p className="flex items-center gap-1.5">
                <Phone size={13} /> {c.phone}
              </p>
            )}
            {c.linkedin_url && (
              <p className="flex items-center gap-1.5">
                <Linkedin size={13} /> LinkedIn
              </p>
            )}
          </div>
          <div className="mt-3 flex gap-2 text-xs">
            <button onClick={() => onEdit(c)} className="text-harbor hover:underline">
              Edit
            </button>
            {!c.is_primary && c.status === "ACTIVE" && (
              <button onClick={() => onSetPrimary(c)} className="text-harbor hover:underline">
                Set primary
              </button>
            )}
            {c.status === "ACTIVE" && (
              <button onClick={() => onDeactivate(c)} className="text-signal-risk hover:underline">
                Deactivate
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

const ACTIVITY_ICON_LABEL: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  VISIT: "Campus visit",
  RECRUITER_REQUEST: "Recruiter request",
  REQUIREMENT_RECEIVED: "Requirement received",
  DRIVE_DISCUSSION: "Drive discussion",
  FOLLOWUP: "Follow-up",
  NOTE: "Note",
  OTHER: "Activity",
};

function TimelineTab({ history }: { history: any[] }) {
  if (history.length === 0) {
    return <EmptyState title="No activity recorded yet" description="Calls, emails, meetings, and stage changes will appear here as you log them." />;
  }
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {history.map((h, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full bg-harbor" aria-hidden="true" />
          <p className="text-xs text-ink-faint">{formatDateTime(h.at)}</p>
          {h.kind === "activity" ? (
            <>
              <p className="text-sm font-medium text-ink">
                {ACTIVITY_ICON_LABEL[h.type] ?? h.type}
                {h.subject ? ` — ${h.subject}` : ""}
              </p>
              {h.summary && <p className="text-sm text-ink-soft">{h.summary}</p>}
            </>
          ) : (
            <p className="text-sm font-medium text-ink">
              Stage changed{h.from ? ` from ${STAGE_LABELS[h.from] ?? h.from}` : ""} to {STAGE_LABELS[h.to] ?? h.to}
              {h.reason && <span className="block text-sm font-normal text-ink-soft">{h.reason}</span>}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function NotesTab({ companyId, notes, onAdded }: { companyId: string; notes: any[]; onAdded: () => void }) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      await api.createNote(companyId, body);
      setBody("");
      onAdded();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <p className="mb-2 text-xs text-ink-faint">Internal notes only — never shown to recruiters.</p>
      <div className="mb-4 flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note…"
          className="min-h-16 flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm"
        />
        <Button variant="primary" onClick={submit} disabled={submitting || !body.trim()}>
          Add
        </Button>
      </div>
      {notes.length === 0 ? (
        <EmptyState title="No internal notes yet" />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-line bg-surface p-3 text-sm">
              <p className="text-ink">{n.body}</p>
              <p className="mt-1 text-xs text-ink-faint">{formatDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IntelligenceTab({ ctx, followups }: { ctx: any; followups: any[] }) {
  const overdue = followups.filter((f) => f.displayStatus === "OVERDUE");
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Sparkles size={15} className="text-harbor" /> Relationship assessment
        </h3>
        <p className="text-sm text-ink-soft">{ctx.relationshipHealth.reason}</p>
      </Card>
      {overdue.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-signal-risk">
            <Clock size={15} /> Needs attention
          </h3>
          <ul className="space-y-1.5 text-sm">
            {overdue.map((f) => (
              <li key={f.id} className="text-ink">
                "{f.title}" is overdue — {formatDueDate(f.due_at).text}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {ctx.isRepeatRecruiter && (
        <Card className="p-4">
          <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gold">
            <CheckCircle2 size={15} /> Proven relationship
          </h3>
          <p className="text-sm text-ink-soft">This company has hired from your institution before — recorded via relationship-stage history, not just a label.</p>
        </Card>
      )}
    </div>
  );
}

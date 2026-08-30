'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Inbox,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
} from 'lucide-react';

import { api } from '@/lib/api';

type IssueCategory = 'INTERVIEW_INFO' | 'LINK_BROKEN' | 'APPLICATION' | 'ELIGIBILITY' | 'OFFER' | 'JOINING' | 'TECHNICAL' | 'GENERAL';

interface Membership {
  organization_id: string;
  organization_name: string;
}

interface InboxMessage {
  id: string;
  organization_id: string;
  organization_name: string;
  message_type: string;
  subject: string;
  body: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requires_ack: boolean;
  sent_at: string;
  opened_at: string | null;
  acknowledged_at: string | null;
}

interface StudentIssue {
  id: string;
  organization_id: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  response: string | null;
  created_at: string;
  updated_at: string;
}

interface InboxResponse { items: InboxMessage[] }
interface IssuesResponse { items: StudentIssue[] }
interface MembershipsResponse { items: Membership[] }

const CATEGORIES: Array<{ value: IssueCategory; label: string }> = [
  { value: 'INTERVIEW_INFO', label: 'Interview information' },
  { value: 'LINK_BROKEN', label: 'Broken link' },
  { value: 'APPLICATION', label: 'Application problem' },
  { value: 'ELIGIBILITY', label: 'Eligibility question' },
  { value: 'OFFER', label: 'Offer issue' },
  { value: 'JOINING', label: 'Joining or onboarding' },
  { value: 'TECHNICAL', label: 'Technical problem' },
  { value: 'GENERAL', label: 'General question' },
];

const PRIORITY_CLASS = {
  LOW: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  NORMAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  HIGH: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  URGENT: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

export default function StudentCommunicationsPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [issues, setIssues] = useState<StudentIssue[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [category, setCategory] = useState<IssueCategory>('GENERAL');
  const [description, setDescription] = useState('');
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [inboxData, issueData, membershipData] = await Promise.all([
        api.getCommunicationInbox<InboxResponse>(1, 100),
        api.listMyCommunicationIssues<IssuesResponse>(),
        api.listCommunicationMemberships<MembershipsResponse>(),
      ]);
      setMessages(inboxData.items ?? []);
      setIssues(issueData.items ?? []);
      setMemberships(membershipData.items ?? []);
      setOrganizationId(current => current || membershipData.items?.[0]?.organization_id || '');
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleMessage(message: InboxMessage) {
    if (expandedId === message.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(message.id);
    if (message.opened_at) return;
    try {
      await api.openCommunication(message.id);
      setMessages(current => current.map(item => item.id === message.id ? { ...item, opened_at: new Date().toISOString() } : item));
    } catch (openError) {
      setError(errorMessage(openError));
    }
  }

  async function acknowledge(message: InboxMessage) {
    setBusyId(message.id);
    setError('');
    try {
      await api.acknowledgeCommunication(message.id);
      const timestamp = new Date().toISOString();
      setMessages(current => current.map(item => item.id === message.id ? { ...item, opened_at: item.opened_at || timestamp, acknowledged_at: timestamp } : item));
      setNotice('Message acknowledged.');
    } catch (acknowledgeError) {
      setError(errorMessage(acknowledgeError));
    } finally {
      setBusyId('');
    }
  }

  async function submitIssue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!description.trim()) {
      setError('Describe the issue before sending it.');
      return;
    }
    if (!organizationId) {
      setError('An active college membership is required to submit an issue.');
      return;
    }
    setBusyId('new-issue');
    setError('');
    setNotice('');
    try {
      await api.createCommunicationIssue({
        organization_id: organizationId,
        category,
        description: description.trim(),
      });
      setDescription('');
      setCategory('GENERAL');
      setShowIssueForm(false);
      setNotice('Your issue was sent to the placement office.');
      await load();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusyId('');
    }
  }

  const unreadCount = messages.filter(message => !message.opened_at).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
            <Inbox size={14} /> Placement office inbox
          </div>
          <h1 className="mt-3 text-3xl font-bold text-primary">Messages and support</h1>
          <p className="mt-2 text-sm text-secondary">Read official placement updates, acknowledge important notices, and ask your college for help.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowIssueForm(current => !current)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
            <MessageSquarePlus size={16} /> Report an issue
          </button>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh messages" className="rounded-xl border border-border bg-card p-2.5 text-secondary hover:bg-hover disabled:opacity-50">
            <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
          </button>
        </div>
      </header>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="mt-0.5 shrink-0" size={16} />{error}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 shrink-0" size={16} />{notice}</div>}

      {showIssueForm && (
        <form onSubmit={submitIssue} className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-bold text-primary">Ask the placement office</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {memberships.length > 1 && (
              <label className="space-y-1 text-sm font-medium text-primary">
                <span>College</span>
                <select value={organizationId} onChange={event => setOrganizationId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">
                  {memberships.map(membership => <option key={membership.organization_id} value={membership.organization_id}>{membership.organization_name}</option>)}
                </select>
              </label>
            )}
            <label className="space-y-1 text-sm font-medium text-primary">
              <span>Issue type</span>
              <select value={category} onChange={event => setCategory(event.target.value as IssueCategory)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">
                {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <label className="mt-4 block space-y-1 text-sm font-medium text-primary">
            <span>Description</span>
            <textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={4000} rows={5} className="w-full rounded-xl border border-border bg-background px-3 py-2.5" placeholder="Include enough detail for the placement team to investigate." />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setShowIssueForm(false)} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-secondary">Cancel</button>
            <button type="submit" disabled={busyId === 'new-issue'} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busyId === 'new-issue' && <Loader2 className="animate-spin" size={16} />} Send issue
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-primary">Inbox</h2><span className="text-sm text-tertiary">{unreadCount} unread</span></div>
          {loading ? (
            <div className="flex min-h-48 items-center justify-center text-secondary"><Loader2 className="mr-2 animate-spin" />Loading messages…</div>
          ) : !messages.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-secondary"><Bell className="mx-auto mb-3" />No placement messages yet.</div>
          ) : messages.map(message => {
            const expanded = expandedId === message.id;
            return (
              <article key={message.id} className={`rounded-2xl border bg-card ${message.opened_at ? 'border-border' : 'border-blue-500/40'}`}>
                <button type="button" onClick={() => void toggleMessage(message)} aria-expanded={expanded} className="flex w-full items-start justify-between gap-4 p-5 text-left">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!message.opened_at && <span className="h-2 w-2 rounded-full bg-blue-500" aria-label="Unread" />}
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${PRIORITY_CLASS[message.priority]}`}>{message.priority}</span>
                      <span className="text-xs text-tertiary">{message.organization_name}</span>
                    </div>
                    <h3 className="mt-2 truncate font-bold text-primary">{message.subject}</h3>
                    <p className="mt-1 text-xs text-tertiary">{formatDate(message.sent_at)}</p>
                  </div>
                  {expanded ? <ChevronUp className="shrink-0 text-tertiary" size={18} /> : <ChevronDown className="shrink-0 text-tertiary" size={18} />}
                </button>
                {expanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-secondary">{message.body}</p>
                    {message.requires_ack && (
                      <div className="mt-4">
                        {message.acknowledged_at ? (
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300"><CheckCircle2 size={16} />Acknowledged {formatDate(message.acknowledged_at)}</span>
                        ) : (
                          <button type="button" onClick={() => void acknowledge(message)} disabled={busyId === message.id} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                            {busyId === message.id && <Loader2 className="animate-spin" size={16} />} Acknowledge message
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-primary">Your issues</h2><span className="text-sm text-tertiary">{issues.length}</span></div>
          {!issues.length ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-secondary">You have not reported any issues.</div>
          ) : issues.map(issue => (
            <article key={issue.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-blue-500/10 px-2 py-1 font-bold text-blue-600 dark:text-blue-300">{issue.status.replace('_', ' ')}</span>
                <span className="text-tertiary">{issue.category.replaceAll('_', ' ')}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-secondary">{issue.description}</p>
              {issue.response && (
                <div className="mt-3 rounded-xl bg-hover p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Placement office response</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-primary">{issue.response}</p>
                </div>
              )}
              <p className="mt-2 text-xs text-tertiary">Created {formatDate(issue.created_at)}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}

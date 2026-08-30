'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';

import { api } from '@/lib/api';

type Tab = 'compose' | 'history' | 'issues';
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type IssueStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface Student {
  user_id: string;
  full_name: string | null;
  email: string;
  student_code: string | null;
  department_id: string | null;
  department_name: string | null;
  status: string;
}

interface Department {
  id: string;
  department_name: string;
  department_code: string | null;
}

interface Drive {
  id: string;
  title: string;
  company_name: string;
  role: string;
  status: string;
}

interface Message {
  id: string;
  message_type: string;
  subject_template: string;
  body_template: string;
  priority: Priority;
  requires_ack: boolean;
  sent_at: string;
  recipient_count: number;
  delivered_count: number;
  failed_count: number;
  opened_count: number;
  acknowledged_count: number;
  company_name: string | null;
  role: string | null;
}

interface Issue {
  id: string;
  category: string;
  priority: Priority;
  status: IssueStatus;
  description: string;
  response: string | null;
  created_at: string;
  student_name: string | null;
  student_email: string;
  student_code: string | null;
  department_name: string | null;
}

interface ListMessagesResponse { items: Message[]; total: number }
interface ListIssuesResponse { items: Issue[]; total: number }
interface ListDepartmentsResponse { departments: Department[] }
interface ListDrivesResponse { items: Drive[] }
interface DraftResponse { subject: string; body: string }

const MESSAGE_TYPES = [
  ['ANNOUNCEMENT', 'Announcement'],
  ['DRIVE_NOTIFICATION', 'Drive notification'],
  ['DEADLINE_REMINDER', 'Deadline reminder'],
  ['INTERVIEW_NOTIFICATION', 'Interview notification'],
  ['RESULT_NOTIFICATION', 'Result notification'],
  ['OFFER_NOTIFICATION', 'Offer notification'],
  ['JOINING_NOTIFICATION', 'Joining notification'],
  ['TRAINING_NOTIFICATION', 'Training notification'],
] as const;

const TEMPLATES = [
  {
    label: 'General update',
    type: 'ANNOUNCEMENT',
    subject: 'Placement office update',
    body: 'Hi {{student_name}}, this is an update from the placement office.',
  },
  {
    label: 'Drive announcement',
    type: 'DRIVE_NOTIFICATION',
    subject: '{{company_name}} is now hiring',
    body: 'Hi {{student_name}}, {{company_name}} has opened applications for {{role}}. Please review the drive details in your portal.',
  },
  {
    label: 'Result published',
    type: 'RESULT_NOTIFICATION',
    subject: '{{company_name}} result published',
    body: 'Hi {{student_name}}, your result for the {{role}} process at {{company_name}} is now available in your portal.',
  },
] as const;

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  NORMAL: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  HIGH: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  URGENT: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const STATUS_CLASS: Record<IssueStatus, string> = {
  OPEN: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  RESOLVED: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CLOSED: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-2xl font-bold text-primary">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs font-medium text-tertiary">{label}</div>
    </div>
  );
}

export default function CommunicationsPage() {
  const [tab, setTab] = useState<Tab>('compose');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [drives, setDrives] = useState<Drive[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageTotal, setMessageTotal] = useState(0);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [issueTotal, setIssueTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [messageType, setMessageType] = useState<(typeof MESSAGE_TYPES)[number][0]>('ANNOUNCEMENT');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [driveId, setDriveId] = useState('');
  const [allActive, setAllActive] = useState(true);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [requiresAck, setRequiresAck] = useState(false);
  const [aiInstruction, setAiInstruction] = useState('');
  const [issueFilter, setIssueFilter] = useState<IssueStatus | ''>('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [responseStatuses, setResponseStatuses] = useState<Record<string, IssueStatus>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [messageData, issueData, studentData, departmentData, driveData] = await Promise.all([
        api.listOrgMessages<ListMessagesResponse>(1, 50),
        api.listOrgCommunicationIssues<ListIssuesResponse>('', 1, 100),
        api.listAllCollegeStudents<Student>(),
        api.listCollegeDepartments<ListDepartmentsResponse>(),
        api.listPlacementDrives<ListDrivesResponse>(),
      ]);
      setMessages(messageData.items ?? []);
      setMessageTotal(messageData.total ?? 0);
      setIssues(issueData.items ?? []);
      setIssueTotal(issueData.total ?? 0);
      setStudents((studentData.students ?? []).filter(student => student.status === 'active'));
      setStudentTotal(studentData.total ?? 0);
      setDepartments(departmentData.departments ?? []);
      setDrives(driveData.items ?? []);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedAudienceCount = useMemo(() => {
    if (allActive) return studentTotal;
    const ids = new Set(studentIds);
    for (const student of students) {
      if (student.department_id && departmentIds.includes(student.department_id)) ids.add(student.user_id);
    }
    return ids.size;
  }, [allActive, departmentIds, studentIds, studentTotal, students]);

  const filteredIssues = useMemo(
    () => issueFilter ? issues.filter(issue => issue.status === issueFilter) : issues,
    [issueFilter, issues],
  );

  const openIssues = issues.filter(issue => issue.status === 'OPEN' || issue.status === 'IN_PROGRESS').length;
  const delivered = messages.reduce((sum, message) => sum + Number(message.delivered_count || 0), 0);
  const opened = messages.reduce((sum, message) => sum + Number(message.opened_count || 0), 0);

  function chooseTemplate(template: (typeof TEMPLATES)[number]) {
    setMessageType(template.type);
    setSubject(template.subject);
    setBody(template.body);
  }

  function toggleValue(value: string, values: string[], setter: (next: string[]) => void) {
    setter(values.includes(value) ? values.filter(item => item !== value) : [...values, value]);
  }

  async function draftWithAI() {
    if (aiInstruction.trim().length < 3) {
      setError('Describe the message you want the drafting assistant to create.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const draft = await api.draftOrgMessage<DraftResponse>({
        instruction: aiInstruction.trim(),
        audience_count: selectedAudienceCount,
        priority,
        drive_id: driveId || null,
      });
      setSubject(draft.subject);
      setBody(draft.body);
      setNotice('Draft created. Review it carefully before sending.');
    } catch (draftError) {
      setError(errorMessage(draftError));
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!subject.trim() || !body.trim()) {
      setError('Subject and message are required.');
      return;
    }
    if (!allActive && !departmentIds.length && !studentIds.length) {
      setError('Select at least one department or student.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.sendOrgMessage<{ recipient_count: number }>({
        message_type: messageType,
        subject: subject.trim(),
        body: body.trim(),
        priority,
        requires_ack: requiresAck,
        drive_id: driveId || null,
        audience: {
          all_active: allActive,
          department_ids: allActive ? [] : departmentIds,
          student_ids: allActive ? [] : studentIds,
        },
      });
      setNotice(`Message delivered to ${result.recipient_count.toLocaleString()} student${result.recipient_count === 1 ? '' : 's'}.`);
      setSubject('');
      setBody('');
      setAiInstruction('');
      await load();
      setTab('history');
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      setBusy(false);
    }
  }

  async function respondToIssue(issue: Issue) {
    const response = (responses[issue.id] ?? issue.response ?? '').trim();
    if (!response) {
      setError('Enter a response before updating the issue.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.respondOrgCommunicationIssue(issue.id, {
        status: responseStatuses[issue.id] ?? issue.status,
        response,
      });
      setNotice('Student issue updated.');
      await load();
    } catch (responseError) {
      setError(errorMessage(responseError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-primary sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-500">Placement operations</p>
            <h1 className="mt-1 text-3xl font-bold">Communications</h1>
            <p className="mt-1 text-sm text-secondary">Send tenant-scoped in-app updates and resolve student questions.</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-hover disabled:opacity-50"
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} size={16} /> Refresh
          </button>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Messages sent" value={messageTotal} />
          <Metric label="In-app deliveries" value={delivered} />
          <Metric label="Messages opened" value={opened} />
          <Metric label="Open student issues" value={openIssues} />
        </section>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 shrink-0" size={16} /> {error}
          </div>
        )}
        {notice && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> {notice}
          </div>
        )}

        <div className="flex gap-2 overflow-x-auto border-b border-border pb-3">
          {([
            ['compose', 'Compose', Send],
            ['history', 'Delivery history', Inbox],
            ['issues', `Student issues (${issueTotal})`, MessageSquare],
          ] as const).map(([key, label, Icon]) => (
            <button
              type="button"
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-blue-600 text-white' : 'bg-card text-secondary hover:bg-hover'}`}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center text-secondary"><Loader2 className="mr-2 animate-spin" /> Loading communications…</div>
        ) : tab === 'compose' ? (
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <section className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div>
                <h2 className="text-lg font-bold">Create an in-app message</h2>
                <p className="mt-1 text-sm text-secondary">Messages are recorded atomically and only delivered to active students in your organization.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-1 text-sm font-medium">
                  <span>Message type</span>
                  <select value={messageType} onChange={event => setMessageType(event.target.value as typeof messageType)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">
                    {MESSAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Priority</span>
                  <select value={priority} onChange={event => setPriority(event.target.value as Priority)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">
                    {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as Priority[]).map(value => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium">
                  <span>Related drive (optional)</span>
                  <select value={driveId} onChange={event => setDriveId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">
                    <option value="">No drive</option>
                    {drives.map(drive => <option key={drive.id} value={drive.id}>{drive.company_name} — {drive.role}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Templates</p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATES.map(template => (
                    <button type="button" key={template.label} onClick={() => chooseTemplate(template)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-secondary hover:bg-hover">
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
                <label className="text-sm font-semibold" htmlFor="ai-instruction">Drafting assistant</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input id="ai-instruction" value={aiInstruction} onChange={event => setAiInstruction(event.target.value)} maxLength={1000} placeholder="Example: concise reminder to check tomorrow’s interview schedule" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
                  <button type="button" onClick={() => void draftWithAI()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                    {busy ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />} Draft
                  </button>
                </div>
              </div>

              <label className="block space-y-1 text-sm font-medium">
                <span>Subject</span>
                <input value={subject} onChange={event => setSubject(event.target.value)} maxLength={300} className="w-full rounded-xl border border-border bg-background px-3 py-2.5" placeholder="Message subject" />
                <span className="block text-right text-xs text-tertiary">{subject.length}/300</span>
              </label>
              <label className="block space-y-1 text-sm font-medium">
                <span>Message</span>
                <textarea value={body} onChange={event => setBody(event.target.value)} maxLength={10000} rows={8} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5" placeholder="Write the message students will receive" />
                <span className="block text-xs text-tertiary">Supported variables: {'{{student_name}}'}, {'{{company_name}}'}, {'{{role}}'}, {'{{drive_name}}'}</span>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={requiresAck} onChange={event => setRequiresAck(event.target.checked)} className="h-4 w-4 rounded" /> Require students to acknowledge this message
              </label>

              <button type="button" onClick={() => void sendMessage()} disabled={busy || selectedAudienceCount === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />} Send to {selectedAudienceCount.toLocaleString()} student{selectedAudienceCount === 1 ? '' : 's'}
              </button>
            </section>

            <aside className="h-fit space-y-5 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2"><Users size={18} /><h2 className="font-bold">Audience</h2></div>
              <label className="flex items-center gap-2 rounded-xl border border-border p-3 text-sm font-semibold">
                <input type="checkbox" checked={allActive} onChange={event => setAllActive(event.target.checked)} /> All active students ({studentTotal.toLocaleString()})
              </label>
              {!allActive && (
                <>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tertiary">Departments</p>
                    <div className="max-h-44 space-y-1 overflow-y-auto">
                      {departments.map(department => (
                        <label key={department.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-hover">
                          <input type="checkbox" checked={departmentIds.includes(department.id)} onChange={() => toggleValue(department.id, departmentIds, setDepartmentIds)} />
                          {department.department_name}
                        </label>
                      ))}
                      {!departments.length && <p className="text-sm text-tertiary">No departments configured.</p>}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tertiary">Individual students</p>
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {students.map(student => (
                        <label key={student.user_id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-hover">
                          <input type="checkbox" className="mt-1" checked={studentIds.includes(student.user_id)} onChange={() => toggleValue(student.user_id, studentIds, setStudentIds)} />
                          <span><span className="block font-medium">{student.full_name || student.email}</span><span className="text-xs text-tertiary">{student.student_code || student.email}</span></span>
                        </label>
                      ))}
                    </div>
                    {studentTotal > students.length && <p className="mt-2 text-xs text-amber-600">Showing the first {students.length} students. Use departments or all-active for the full cohort.</p>}
                  </div>
                </>
              )}
            </aside>
          </div>
        ) : tab === 'history' ? (
          <section className="space-y-3">
            {!messages.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-secondary"><Bell className="mx-auto mb-3" />No messages have been sent yet.</div>
            ) : messages.map(message => {
              const recipientCount = Number(message.recipient_count || 0);
              const openRate = recipientCount ? Math.round(Number(message.opened_count || 0) * 100 / recipientCount) : 0;
              return (
                <article key={message.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_CLASS[message.priority]}`}>{message.priority}</span>
                        <span className="text-xs text-tertiary">{message.message_type.replaceAll('_', ' ')}</span>
                        <span className="text-xs text-tertiary">{formatDate(message.sent_at)}</span>
                      </div>
                      <h2 className="mt-3 text-lg font-bold">{message.subject_template}</h2>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-secondary">{message.body_template}</p>
                    </div>
                    <div className="grid shrink-0 grid-cols-2 gap-2 text-center sm:grid-cols-4">
                      <Metric label="Recipients" value={recipientCount} />
                      <Metric label="Delivered" value={Number(message.delivered_count || 0)} />
                      <Metric label={`Opened · ${openRate}%`} value={Number(message.opened_count || 0)} />
                      <Metric label="Acknowledged" value={Number(message.acknowledged_count || 0)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold">Student issues</h2><p className="text-sm text-secondary">Responses are visible in the student inbox.</p></div>
              <select value={issueFilter} onChange={event => setIssueFilter(event.target.value as IssueStatus | '')} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                <option value="">All statuses</option>
                {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as IssueStatus[]).map(value => <option key={value}>{value}</option>)}
              </select>
            </div>
            {!filteredIssues.length ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-secondary"><CheckCircle2 className="mx-auto mb-3" />No issues match this filter.</div>
            ) : filteredIssues.map(issue => (
              <article key={issue.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[issue.status]}`}>{issue.status.replace('_', ' ')}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_CLASS[issue.priority]}`}>{issue.priority}</span>
                  <span className="text-xs text-tertiary">{issue.category.replaceAll('_', ' ')}</span>
                </div>
                <div className="mt-3 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                  <div>
                    <h3 className="font-bold">{issue.student_name || issue.student_email}</h3>
                    <p className="text-xs text-tertiary">{[issue.student_code, issue.department_name, formatDate(issue.created_at)].filter(Boolean).join(' · ')}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-secondary">{issue.description}</p>
                  </div>
                  <div className="space-y-2">
                    <textarea rows={4} maxLength={4000} value={responses[issue.id] ?? issue.response ?? ''} onChange={event => setResponses(previous => ({ ...previous, [issue.id]: event.target.value }))} placeholder="Write a clear response for the student" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select value={responseStatuses[issue.id] ?? issue.status} onChange={event => setResponseStatuses(previous => ({ ...previous, [issue.id]: event.target.value as IssueStatus }))} className="rounded-xl border border-border bg-background px-3 py-2 text-sm">
                        {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as IssueStatus[]).map(value => <option key={value}>{value}</option>)}
                      </select>
                      <button type="button" onClick={() => void respondToIssue(issue)} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {busy ? <Loader2 className="animate-spin" size={16} /> : <MessageSquare size={16} />} Save response
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

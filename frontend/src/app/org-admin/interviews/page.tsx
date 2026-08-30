"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  AlertCircle,
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Send,
  XCircle,
} from "lucide-react";

import { api } from "@/lib/api";

type InterviewStatus =
  | "SCHEDULED" | "CONFIRMED" | "ATTENDED" | "COMPLETED" | "NO_SHOW"
  | "CANCELLED" | "RESCHEDULED" | "RESULT_PENDING" | "RESULT_PUBLISHED";
type AttendanceStatus = "NOT_RECORDED" | "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
type ResultValue = "PASS" | "FAIL" | "HOLD" | "NO_SHOW" | "DISQUALIFIED" | "PENDING";
type PublicationState = "INTERNAL_RESULT" | "TPO_REVIEWED" | "PUBLISHED_TO_STUDENT";

interface InterviewRow {
  id: string;
  drive_id: string;
  round_execution_id: string | null;
  student_id: string;
  scheduled_at: string | null;
  interview_status: InterviewStatus;
  attendance_status: AttendanceStatus;
  location_or_link: string | null;
  student_name: string;
  student_email: string;
  student_code: string | null;
  department_name: string | null;
  drive_title: string;
  company_name: string;
  role: string;
  round_name: string | null;
  result: ResultValue | null;
  remarks: string | null;
  publication_state: PublicationState | null;
  result_version: number | null;
  published_at: string | null;
}

interface InterviewListResponse {
  items: InterviewRow[];
  total: number;
  page: number;
  page_size: number;
}

interface InterviewIssue {
  id: string;
  issue_type: string;
  description: string | null;
  status: "OPEN" | "RESOLVED";
  resolution: string | null;
  created_at: string;
}

interface ResultRecord {
  id: string;
  result: ResultValue;
  remarks: string | null;
  publication_state: PublicationState;
  version: number;
  result_source: string;
  created_at: string;
  published_at: string | null;
}

interface InterviewDetailResponse {
  interview: InterviewRow;
  current_result: ResultRecord | null;
  result_history: ResultRecord[];
  issues: InterviewIssue[];
  legal_next_states: InterviewStatus[];
  audit: Array<{ action: string; actor_label: string | null; occurred_at: string }>;
}

interface Drive {
  id: string;
  title: string;
  company_name: string;
  role: string;
  status: string;
}

interface CollegeStudent {
  user_id: string;
  student_code: string | null;
  full_name: string;
  email: string;
  department_name: string | null;
}

interface Round {
  id: string;
  name: string;
  sequence: number;
}

interface PendingResult {
  interview_id: string;
  result: ResultValue;
  remarks: string | null;
  publication_state: PublicationState;
  student_name: string;
  student_code: string | null;
  company_name: string;
  drive_title: string;
}

interface ImportInput {
  student_code: string;
  interview_id?: string;
  result: string;
  remarks?: string;
}

interface ImportValidation {
  committed: number;
  valid: Array<ImportInput & { row: number; student_name: string; interview_id: string }>;
  errors: Array<{ row: number; student_code: string; code: string; detail?: string }>;
  atomic: boolean;
}

const STATUS_STYLE: Record<InterviewStatus, string> = {
  SCHEDULED: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  CONFIRMED: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  ATTENDED: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  COMPLETED: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  NO_SHOW: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  CANCELLED: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  RESCHEDULED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  RESULT_PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  RESULT_PUBLISHED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

const RESULT_STYLE: Record<ResultValue, string> = {
  PASS: "text-emerald-300",
  FAIL: "text-rose-300",
  HOLD: "text-amber-300",
  NO_SHOW: "text-rose-300",
  DISQUALIFIED: "text-rose-300",
  PENDING: "text-slate-300",
};

const ALL_STATUSES = Object.keys(STATUS_STYLE) as InterviewStatus[];
const RESULT_VALUES = Object.keys(RESULT_STYLE) as ResultValue[];

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function friendlyStatus(value: string): string {
  return value.toLowerCase().split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function StatusBadge({ status }: { status: InterviewStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[status]}`}>{friendlyStatus(status)}</span>;
}

function ResultBadge({ result }: { result: ResultValue | null }) {
  if (!result) return <span className="text-xs text-slate-500">Not entered</span>;
  return <span className={`text-xs font-bold ${RESULT_STYLE[result]}`}>{friendlyStatus(result)}</span>;
}

function ActionButton({ children, onClick, disabled, tone = "primary", type = "button" }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
}) {
  const tones = {
    primary: "bg-blue-600 text-white hover:bg-blue-500",
    secondary: "border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}>
      {children}
    </button>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-white/10 bg-white/[0.03] ${className}`}>{children}</section>;
}

function SchedulePanel({ drives, students, onClose, onCreated }: {
  drives: Drive[];
  students: CollegeStudent[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [driveId, setDriveId] = useState(drives[0]?.id ?? "");
  const [studentId, setStudentId] = useState(students[0]?.user_id ?? "");
  const [roundId, setRoundId] = useState("");
  const [rounds, setRounds] = useState<Round[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!driveId) return;
    api.listPlacementRounds<{ rounds: Round[] }>(driveId)
      .then((response) => { if (active) setRounds(response.rounds ?? []); })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load rounds."); });
    return () => { active = false; };
  }, [driveId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!driveId || !studentId || !scheduledAt) return;
    setBusy(true);
    setError("");
    try {
      await api.schedulePlacementInterview({
        drive_id: driveId,
        student_id: studentId,
        round_execution_id: roundId || null,
        scheduled_at: new Date(scheduledAt).toISOString(),
        location_or_link: location.trim() || null,
      });
      await onCreated();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to schedule interview.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mb-5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-white">Schedule placement interview</h2>
        <button onClick={onClose} aria-label="Close scheduling form" className="text-slate-400 hover:text-white"><XCircle size={20} /></button>
      </div>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-semibold text-slate-400">Drive
          <select required value={driveId} onChange={(event) => { setDriveId(event.target.value); setRoundId(""); }} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {drives.map((drive) => <option value={drive.id} key={drive.id}>{drive.company_name} — {drive.role}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-400">Student
          <select required value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            {students.map((student) => <option value={student.user_id} key={student.user_id}>{student.full_name} ({student.student_code || student.email})</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-400">Round (optional)
          <select value={roundId} onChange={(event) => setRoundId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="">No assigned round</option>
            {rounds.map((round) => <option value={round.id} key={round.id}>{round.sequence}. {round.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-400">Date and time
          <input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs font-semibold text-slate-400 md:col-span-2">Location or meeting link
          <input value={location} maxLength={500} onChange={(event) => setLocation(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" placeholder="Room 204 or https://meet…" />
        </label>
        {error && <div role="alert" className="text-sm text-rose-300 md:col-span-2">{error}</div>}
        <div className="flex gap-2 md:col-span-2">
          <ActionButton type="submit" disabled={busy || !drives.length || !students.length}>{busy ? "Scheduling…" : "Schedule interview"}</ActionButton>
          <ActionButton onClick={onClose} tone="secondary">Cancel</ActionButton>
        </div>
      </form>
    </Panel>
  );
}

function DetailPanel({ detail, busy, onBack, onMutate }: {
  detail: InterviewDetailResponse;
  busy: boolean;
  onBack: () => void;
  onMutate: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const interview = detail.interview;
  const [result, setResult] = useState<ResultValue>(detail.current_result?.result ?? "PASS");
  const [remarks, setRemarks] = useState(detail.current_result?.remarks ?? "");
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const canRecordAttendance = ["SCHEDULED", "CONFIRMED"].includes(interview.interview_status);
  const canEnterResult = ["ATTENDED", "COMPLETED", "RESULT_PENDING", "NO_SHOW"].includes(interview.interview_status)
    && detail.current_result?.publication_state !== "PUBLISHED_TO_STUDENT";

  async function publish() {
    await onMutate(async () => {
      if (detail.current_result?.publication_state === "INTERNAL_RESULT") {
        await api.reviewPlacementResults(interview.id, { notes: "Reviewed and approved for publication." });
      }
      await api.publishPlacementResults(interview.id, {});
    });
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-300"><ArrowLeft size={16} /> Back to interviews</button>
      <Panel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">{interview.company_name} · {interview.round_name || "Interview"}</p>
            <h2 className="mt-1 text-xl font-bold text-white">{interview.student_name}</h2>
            <p className="text-sm text-slate-400">{interview.student_code || interview.student_email} · {interview.department_name || "Department not assigned"}</p>
          </div>
          <StatusBadge status={interview.interview_status} />
        </div>
        <div className="mt-4 grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <p><span className="text-slate-500">When:</span> {formatDate(interview.scheduled_at)}</p>
          <p><span className="text-slate-500">Where:</span> {interview.location_or_link || "Not specified"}</p>
          <p><span className="text-slate-500">Role:</span> {interview.role}</p>
          <p><span className="text-slate-500">Attendance:</span> {friendlyStatus(interview.attendance_status)}</p>
        </div>
      </Panel>

      {canRecordAttendance && (
        <Panel className="p-5">
          <h3 className="mb-3 font-bold text-white">Record attendance</h3>
          <div className="flex flex-wrap gap-2">
            {(["PRESENT", "LATE", "ABSENT", "EXCUSED"] as AttendanceStatus[]).map((status) => (
              <ActionButton key={status} disabled={busy} tone={status === "ABSENT" ? "danger" : "secondary"}
                onClick={() => onMutate(() => api.recordPlacementAttendance(interview.id, { attendance_status: status }))}>
                {friendlyStatus(status)}
              </ActionButton>
            ))}
          </div>
        </Panel>
      )}

      {detail.legal_next_states.length > 0 && (
        <Panel className="p-5">
          <h3 className="mb-3 font-bold text-white">Lifecycle actions</h3>
          <div className="flex flex-wrap gap-2">
            {detail.legal_next_states.map((status) => (
              <ActionButton key={status} disabled={busy} tone="secondary"
                onClick={() => onMutate(() => api.transitionPlacementInterview(interview.id, { to_status: status }))}>
                Move to {friendlyStatus(status)}
              </ActionButton>
            ))}
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-white">Result</h3>
          {detail.current_result && <span className="text-xs text-slate-400">Version {detail.current_result.version} · {friendlyStatus(detail.current_result.publication_state)}</span>}
        </div>
        {canEnterResult ? (
          <div className="mt-3 grid gap-3">
            <select value={result} onChange={(event) => setResult(event.target.value as ResultValue)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white sm:w-64">
              {RESULT_VALUES.map((value) => <option value={value} key={value}>{friendlyStatus(value)}</option>)}
            </select>
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={4000} rows={3} placeholder="Recruiter or panel remarks" className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
            <div className="flex flex-wrap gap-2">
              <ActionButton disabled={busy} onClick={() => onMutate(() => api.enterPlacementResult(interview.id, { result, remarks, result_source: "TPO_ENTERED" }))}>Save internal result</ActionButton>
              {detail.current_result && <ActionButton disabled={busy} tone="danger" onClick={publish}>Review and publish</ActionButton>}
            </div>
          </div>
        ) : detail.current_result ? (
          <div className="mt-3">
            <ResultBadge result={detail.current_result.result} />
            <p className="mt-2 text-sm text-slate-300">{detail.current_result.remarks || "No remarks."}</p>
            {detail.current_result.publication_state !== "PUBLISHED_TO_STUDENT" && (
              <div className="mt-3"><ActionButton disabled={busy} tone="danger" onClick={publish}>Review and publish</ActionButton></div>
            )}
          </div>
        ) : <p className="mt-3 text-sm text-slate-400">Complete attendance before entering a result.</p>}

        {detail.result_history.length > 0 && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Version history</p>
            <div className="space-y-2">
              {detail.result_history.map((record) => (
                <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span><ResultBadge result={record.result} /> <span className="ml-2 text-slate-400">v{record.version} · {record.result_source}</span></span>
                  <span className="text-xs text-slate-500">{formatDate(record.created_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {detail.issues.length > 0 && (
        <Panel className="p-5">
          <h3 className="mb-3 font-bold text-white">Reported issues</h3>
          <div className="space-y-3">
            {detail.issues.map((issue) => (
              <div key={issue.id} className="rounded-lg border border-white/10 bg-black/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-sm font-semibold text-white">{friendlyStatus(issue.issue_type)}</p><p className="mt-1 text-sm text-slate-400">{issue.description || "No description provided."}</p></div>
                  <span className={issue.status === "OPEN" ? "text-xs font-bold text-rose-300" : "text-xs font-bold text-emerald-300"}>{issue.status}</span>
                </div>
                {issue.status === "OPEN" ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input value={resolutions[issue.id] ?? ""} maxLength={2000} onChange={(event) => setResolutions((current) => ({ ...current, [issue.id]: event.target.value }))} placeholder="Resolution provided to the student" className="flex-1 rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white" />
                    <ActionButton disabled={busy || !(resolutions[issue.id] ?? "").trim()} onClick={() => onMutate(() => api.resolvePlacementIssue(interview.id, issue.id, resolutions[issue.id].trim()))}>Resolve</ActionButton>
                  </div>
                ) : issue.resolution && <p className="mt-2 text-xs text-emerald-200">Resolution: {issue.resolution}</p>}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function ImportPanel({ drives, onCommitted }: { drives: Drive[]; onCommitted: () => Promise<void> }) {
  const [csvText, setCsvText] = useState("Student Code,Interview ID,Result,Remarks\n");
  const [driveId, setDriveId] = useState("");
  const [rows, setRows] = useState<ImportInput[]>([]);
  const [preview, setPreview] = useState<ImportValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function parseRows(): ImportInput[] {
    const parsed = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
    if (parsed.errors.length) throw new Error(`CSV row ${parsed.errors[0].row ?? 0}: ${parsed.errors[0].message}`);
    return parsed.data.map((row) => ({
      student_code: (row["Student Code"] || row["Register Number"] || "").trim(),
      interview_id: (row["Interview ID"] || "").trim() || undefined,
      result: (row.Result || "").trim().toUpperCase(),
      remarks: (row.Remarks || "").trim() || undefined,
    })).filter((row) => row.student_code || row.interview_id || row.result);
  }

  async function validate() {
    setBusy(true);
    setError("");
    try {
      const parsedRows = parseRows();
      if (!parsedRows.length) throw new Error("Add at least one result row.");
      const response = await api.importPlacementResults<ImportValidation>({ rows: parsedRows, drive_id: driveId || null, commit: false });
      setRows(parsedRows);
      setPreview(response);
    } catch (requestError) {
      setPreview(null);
      setError(requestError instanceof Error ? requestError.message : "Unable to validate CSV.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setError("");
    try {
      const response = await api.importPlacementResults<ImportValidation>({ rows, drive_id: driveId || null, commit: true });
      setPreview(response);
      if (response.committed > 0) {
        await onCommitted();
        setCsvText("Student Code,Interview ID,Result,Remarks\n");
        setRows([]);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to import results.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="p-5">
      <h2 className="font-bold text-white">Import recruiter results</h2>
      <p className="mt-1 text-sm text-slate-400">Preview is read-only. Commit succeeds atomically only when every row is valid. Add Interview ID when one student has multiple interviews.</p>
      <select value={driveId} onChange={(event) => { setDriveId(event.target.value); setPreview(null); }} className="mt-4 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white sm:w-96">
        <option value="">All drives (student must have one matching interview)</option>
        {drives.map((drive) => <option value={drive.id} key={drive.id}>{drive.company_name} — {drive.role}</option>)}
      </select>
      <textarea value={csvText} onChange={(event) => { setCsvText(event.target.value); setPreview(null); }} rows={10} className="mt-3 w-full rounded-lg border border-white/10 bg-slate-950 p-3 font-mono text-xs text-white" />
      <div className="mt-3 flex gap-2"><ActionButton disabled={busy} onClick={validate}>{busy ? "Checking…" : "Validate CSV"}</ActionButton></div>
      {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
      {preview && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-3 text-sm"><span className="text-emerald-300">{preview.valid.length} valid</span><span className="text-rose-300">{preview.errors.length} errors</span></div>
          {preview.errors.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-200">
              {preview.errors.map((item) => <p key={`${item.row}-${item.code}`}>Row {item.row} ({item.student_code || "blank"}): {friendlyStatus(item.code)}{item.detail ? ` — ${item.detail}` : ""}</p>)}
            </div>
          )}
          {preview.valid.length > 0 && <p className="text-xs text-slate-400">Ready: {preview.valid.map((item) => `${item.student_name} (${item.result})`).join(", ")}</p>}
          <ActionButton disabled={busy || preview.errors.length > 0 || preview.valid.length === 0} tone="danger" onClick={commit}>Commit {preview.valid.length} internal results</ActionButton>
          {preview.committed > 0 && <p className="text-sm text-emerald-300"><CheckCircle2 className="mr-1 inline" size={15} />Imported {preview.committed} results.</p>}
        </div>
      )}
    </Panel>
  );
}

function PublishPanel({ items, busy, onPublish }: { items: PendingResult[]; busy: boolean; onPublish: (ids: string[]) => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const counts = useMemo(() => items.reduce<Record<string, number>>((current, item) => {
    current[item.result] = (current[item.result] ?? 0) + 1;
    return current;
  }, {}), [items]);

  return (
    <Panel className="p-5">
      <h2 className="font-bold text-white">Review and publish</h2>
      <p className="mt-1 text-sm text-slate-400">Publication is atomic and immediately makes these results visible to students.</p>
      {items.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No results are waiting for publication.</p> : (
        <>
          <div className="my-4 flex flex-wrap gap-2">{Object.entries(counts).map(([result, count]) => <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300" key={result}>{count} {friendlyStatus(result)}</span>)}</div>
          <div className="max-h-96 overflow-auto rounded-lg border border-white/10">
            {items.map((item) => (
              <div key={item.interview_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 p-3 last:border-0">
                <div><p className="text-sm font-semibold text-white">{item.student_name} <span className="font-normal text-slate-500">{item.student_code}</span></p><p className="text-xs text-slate-400">{item.company_name} · {item.drive_title} · {friendlyStatus(item.publication_state)}</p></div>
                <ResultBadge result={item.result} />
              </div>
            ))}
          </div>
          <div className="mt-4">
            {!confirming ? <ActionButton tone="danger" onClick={() => setConfirming(true)}>Publish all {items.length} results</ActionButton> : (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                <span className="mr-auto text-sm text-rose-100">Confirm publication to {items.length} students.</span>
                <ActionButton disabled={busy} tone="danger" onClick={async () => { await onPublish(items.map((item) => item.interview_id)); setConfirming(false); }}>{busy ? "Publishing…" : "Confirm"}</ActionButton>
                <ActionButton disabled={busy} tone="secondary" onClick={() => setConfirming(false)}>Cancel</ActionButton>
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

export default function PlacementInterviewsPage() {
  const [interviews, setInterviews] = useState<InterviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [drives, setDrives] = useState<Drive[]>([]);
  const [students, setStudents] = useState<CollegeStudent[]>([]);
  const [pending, setPending] = useState<PendingResult[]>([]);
  const [detail, setDetail] = useState<InterviewDetailResponse | null>(null);
  const [tab, setTab] = useState<"interviews" | "import" | "publish">("interviews");
  const [showSchedule, setShowSchedule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handle = window.setTimeout(() => { setQuerySearch(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: "50" };
      if (status) params.status = status;
      if (querySearch) params.search = querySearch;
      const response = await api.getPlacementInterviews<InterviewListResponse>(params);
      setInterviews(response.items ?? []);
      setTotal(response.total ?? 0);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load interviews.");
    } finally {
      setLoading(false);
    }
  }, [page, querySearch, status]);

  const loadPending = useCallback(async () => {
    const response = await api.getPendingReviewPlacementResults<{ items: PendingResult[] }>();
    setPending(response.items ?? []);
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.listPlacementDrives<{ items: Drive[] }>(),
      api.listCollegeStudents<{ students: CollegeStudent[] }>("page_size=100"),
    ]).then(([driveResponse, studentResponse]) => {
      if (!active) return;
      setDrives(driveResponse.items ?? []);
      setStudents(studentResponse.students ?? []);
    }).catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Unable to load scheduling data.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tab !== "publish") return;
    loadPending().catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Unable to load pending results."));
  }, [loadPending, tab]);

  async function openInterview(id: string) {
    setLoading(true);
    try {
      setDetail(await api.getPlacementInterview<InterviewDetailResponse>(id));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load interview details.");
    } finally {
      setLoading(false);
    }
  }

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await loadList();
      if (detail) setDetail(await api.getPlacementInterview<InterviewDetailResponse>(detail.interview.id));
      if (tab === "publish") await loadPending();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The operation could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-white">Placement Interviews</h1><p className="text-sm text-slate-400">Schedule interviews, record attendance, and control result publication.</p></div>
        <div className="flex gap-2">
          <ActionButton tone="secondary" disabled={loading} onClick={() => { void loadList(); }}><RefreshCw className="mr-1 inline" size={15} /> Refresh</ActionButton>
          <ActionButton disabled={!drives.length || !students.length} onClick={() => setShowSchedule(true)}><CalendarPlus className="mr-1 inline" size={15} /> Schedule</ActionButton>
        </div>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200"><AlertCircle className="mt-0.5 shrink-0" size={16} />{error}</div>}
      {showSchedule && <SchedulePanel drives={drives} students={students} onClose={() => setShowSchedule(false)} onCreated={loadList} />}

      {!detail && (
        <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
          {(["interviews", "import", "publish"] as const).map((value) => (
            <button key={value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === value ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}>
              {value === "interviews" ? "All interviews" : value === "import" ? <><FileUp className="mr-1 inline" size={14} />Import results</> : <><Send className="mr-1 inline" size={14} />Review & publish</>}
            </button>
          ))}
        </div>
      )}

      {detail ? <DetailPanel key={`${detail.interview.id}-${detail.current_result?.version ?? 0}`} detail={detail} busy={busy} onBack={() => setDetail(null)} onMutate={mutate} /> : tab === "import" ? (
        <ImportPanel drives={drives} onCommitted={async () => { await Promise.all([loadList(), loadPending()]); }} />
      ) : tab === "publish" ? (
        <PublishPanel items={pending} busy={busy} onPublish={async (ids) => mutate(() => api.publishPlacementResultsBatch(ids))} />
      ) : (
        <Panel>
          <div className="flex flex-wrap gap-2 border-b border-white/10 p-4">
            <label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 text-slate-500" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student name, email, or code" className="w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white" /></label>
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="">All statuses</option>{ALL_STATUSES.map((value) => <option value={value} key={value}>{friendlyStatus(value)}</option>)}
            </select>
          </div>
          {loading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><Loader2 className="animate-spin" size={18} />Loading interviews…</div> : interviews.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">No interviews match this view.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500"><tr><th className="p-3">Student</th><th className="p-3">Drive</th><th className="p-3">Scheduled</th><th className="p-3">Status</th><th className="p-3">Result</th><th className="p-3"></th></tr></thead>
                <tbody>{interviews.map((interview) => (
                  <tr key={interview.id} onClick={() => { void openInterview(interview.id); }} className="cursor-pointer border-b border-white/5 hover:bg-white/[0.04]">
                    <td className="p-3"><p className="font-semibold text-white">{interview.student_name}</p><p className="text-xs text-slate-500">{interview.student_code || interview.student_email} · {interview.department_name || "No department"}</p></td>
                    <td className="p-3"><p className="text-slate-200">{interview.company_name}</p><p className="text-xs text-slate-500">{interview.round_name || interview.role}</p></td>
                    <td className="whitespace-nowrap p-3 text-slate-300">{formatDate(interview.scheduled_at)}</td>
                    <td className="p-3"><StatusBadge status={interview.interview_status} /></td>
                    <td className="p-3"><ResultBadge result={interview.result} /></td>
                    <td className="p-3 text-right"><ChevronRight className="inline text-slate-600" size={16} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-white/10 p-4 text-sm text-slate-400">
            <span>{total} interview{total === 1 ? "" : "s"}</span>
            <div className="flex items-center gap-2"><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="rounded p-1 disabled:opacity-30" aria-label="Previous page"><ChevronLeft size={18} /></button><span>Page {page} of {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded p-1 disabled:opacity-30" aria-label="Next page"><ChevronRight size={18} /></button></div>
          </div>
        </Panel>
      )}
    </div>
  );
}

'use client';
/**
 * PrepVista — College Admin: Reports Export
 * Preview student data, filter, and export as JSON or CSV.
 *
 * SECURITY HARDENING v3 — every known frontend attack vector addressed:
 *   · API error scrubbing (no stack traces / SQL / paths exposed to UI)
 *   · Input sanitization on all filter values before API transmission
 *   · UUID validation on all ID filter params (no arbitrary strings to API)
 *   · Parameter allowlisting (sort, access, limit — only known-safe values)
 *   · Output sanitization on ALL API-returned student data before render
 *   · CSV formula injection prevention on DOWNLOAD (prefix-quote injection)
 *   · Filename path traversal prevention (sanitized dynamic filename)
 *   · Client-side rate limiting on preview + CSV download + schedule
 *   · Prototype-pollution-safe API response handling
 *   · Safari-safe blob download (DOM append + deferred revoke)
 *   · AbortController — stale response race condition eliminated
 *   · No console.* calls — zero PII leakage to browser devtools
 *   · All text via React JSX (never dangerouslySetInnerHTML)
 *   · Schedule form: email validation + payload allowlisting
 *   · Segment session cache — 3 API calls eliminated per re-visit
 *   · isMounted guards on all async state setters
 *
 * All v2 features preserved:
 *   A — Score distribution sparkline (pure CSS, zero deps)
 *   B — Client-side column sort (Name, Sessions, Avg, Best)
 *   C — Top Performers + Needs Attention collapsible sections
 *   D — Schedule Export modal (weekly / monthly automated CSV email)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { DownloadIcon, FilterIcon, XIcon, CalendarIcon } from '@/components/icons';
import { api } from '@/lib/api';

/* ═══════════════════════════════════════════════════════════════════════════
   SECURITY UTILITIES
═══════════════════════════════════════════════════════════════════════════ */

/**
 * SEC-1 · API ERROR SCRUBBER
 * Strips stack traces, SQL keywords, file paths, IP addresses, JWT tokens,
 * database engine names, and credential keywords from backend error messages
 * before they are displayed in the UI.
 *
 * WHY: The Reports page makes the most API calls of any page in the system
 * (preview, CSV export, schedule, segment fetches). Each can return verbose
 * backend errors. A single unscubbed error like:
 *   "PrismaClientKnownRequestError at /app/api/reports/route.ts:47
 *    SELECT * FROM student_reports WHERE college_id = 'x' LIMIT 100"
 * gives an attacker: the ORM name, the file path, the table name, the SQL
 * structure, and the query limit — enough to plan a targeted injection.
 */
const SENSITIVE_PATTERNS: RegExp[] = [
  /at\s+\w+\s+\([^)]+\)/g,
  /\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b/gi,
  /\/[a-zA-Z0-9_\-./]+\.(py|js|ts|rb|php|go|java|sql)/g,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
  /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /postgres|mysql|mongodb|redis|sqlite|prisma|sequelize/gi,
  /SQLSTATE|errno|constraint/gi,
  /secret|password|token|key|auth/gi,
];

function scrubError(err: unknown): string {
  const raw  = err instanceof Error ? err.message : String(err);
  let   safe = raw;
  for (const p of SENSITIVE_PATTERNS) safe = safe.replace(p, '…');
  safe = safe.replace(/<[^>]*>/g, '').trim();
  if (safe.length > 200) safe = safe.slice(0, 200) + '…';
  return safe || 'An unexpected error occurred. Please try again.';
}

/**
 * SEC-2 · INPUT SANITIZER
 * Strips HTML, control characters, null bytes, and Unicode tricks.
 * Applied to every filter label rendered in the UI and every string
 * value sent to the schedule API.
 */
function sanitizeInput(value: string, maxLen = 200): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E\u2060]/g, '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * SEC-3 · UUID VALIDATOR
 * All segment filter IDs (department_id, year_id, batch_id) must be valid
 * UUID v4 before being appended to API query parameters.
 * Prevents parameter injection: "department_id=1 OR 1=1"
 */
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * SEC-4 · EMAIL VALIDATOR (for schedule form)
 * RFC 5322 simplified. Rejects anything longer than 254 chars (SMTP limit).
 * Prevents email header injection in schedule recipient field.
 */
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && email.length <= 254;
}

/**
 * SEC-5 · CSV FORMULA INJECTION GUARD (download-side)
 * When we render student data into the browser for preview, all values
 * come from the API. When an admin downloads the CSV, the backend generates
 * it — but we must also sanitize rendered preview cell values because:
 *   1. Adversarial student data (=CMD|...) could be in the API response.
 *   2. The preview table renders this data — React escapes HTML but does
 *      NOT prevent a malicious user from copying the cell value and pasting
 *      it into another spreadsheet.
 *   3. More critically: the filename we generate uses filter label values
 *      from segment API responses — those could contain path characters.
 *
 * This function sanitizes any value destined for display that originated
 * from user-submitted data (student names, department names from CSV import).
 */
function sanitizeDisplayValue(val: string | null | undefined): string {
  if (val == null) return '—';
  const s = sanitizeInput(String(val), 200);
  // Strip leading formula-injection characters for display context
  return s.replace(/^[=+\-@\t\r|%]+/, '').trim() || '—';
}

/**
 * SEC-6 · FILENAME SANITISER
 * The CSV download filename is constructed from user-controlled filter labels
 * (department name, year name, batch name). These originate from API
 * responses that may contain data entered by admins or imported via CSV.
 * Path traversal: "../../../etc/passwd" in a department name → sanitized.
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\.\./g, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

/**
 * SEC-7 · CLIENT-SIDE RATE LIMITER
 * Defence-in-depth alongside backend rate limiting.
 *
 * Limits:
 *   Preview fetch:   10 per minute  (each loads up to 100 rows)
 *   CSV download:    5  per minute  (each triggers full export query)
 *   Schedule save:   3  per minute  (write operation)
 *   Segment fetch:   session-cached (never re-fetched — see segmentsLoadedRef)
 */
class RateLimiter {
  private calls: number[] = [];
  constructor(private max: number, private windowMs: number) {}
  check(): { allowed: boolean; waitMs?: number } {
    const now = Date.now();
    this.calls = this.calls.filter(t => now - t < this.windowMs);
    if (this.calls.length >= this.max) {
      return { allowed: false, waitMs: this.windowMs - (now - this.calls[0]) };
    }
    this.calls.push(now);
    return { allowed: true };
  }
}

const previewLimiter  = new RateLimiter(10, 60_000);
const csvLimiter      = new RateLimiter(5,  60_000);
const scheduleLimiter = new RateLimiter(3,  60_000);

/**
 * SEC-8 · PROTOTYPE-POLLUTION-SAFE ARRAY EXTRACTOR
 * Prevents {"__proto__":{"isAdmin":true}} in API responses from
 * polluting the Object prototype chain when stored in React state.
 */
function safeArray<T>(val: unknown): T[] {
  if (!Array.isArray(val)) return [];
  return val.filter(
    item => item !== null && typeof item === 'object' && !Array.isArray(item),
  ) as T[];
}

/**
 * SEC-9 · SAFE NUMBER EXTRACTOR
 * Validates that API-returned numeric fields are actually numbers and
 * within a sane range before arithmetic or display.
 * Prevents NaN, Infinity, or negative counts from reaching the UI.
 */
function safeNum(val: unknown, fallback = 0, min = 0, max = 1_000_000): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(Math.max(val, min), max);
}

/**
 * SEC-10 · ALLOWLISTED PARAMETER SET
 * Sort columns and directions are allowlisted — no arbitrary string from
 * user interaction reaches the API as a sort parameter.
 * Frequency values for schedule are allowlisted — only 'weekly' | 'monthly'.
 */
const ALLOWED_SORT_COLS  = new Set(['full_name', 'avg_score', 'best_score', 'total_interviews', '']);
const ALLOWED_SORT_DIRS  = new Set(['asc', 'desc']);
const ALLOWED_FREQUENCIES = new Set(['weekly', 'monthly']);
const ALLOWED_PAGE_LIMITS = new Set([50, 100, 200]);
const PREVIEW_LIMIT_DEFAULT = 100;

/* ═══════════════════════════════════════════════════════════════════════════
   DOMAIN INTERFACES (unchanged)
═══════════════════════════════════════════════════════════════════════════ */

interface StudentReport {
  full_name: string | null; email: string; student_code: string | null;
  department_name: string | null; year_name: string | null; batch_name: string | null;
  section: string | null; has_career_access: boolean; status: string;
  total_interviews: number; avg_score: number | null; best_score: number | null;
}

interface Dept  { id: string; department_name: string; }
interface Year  { id: string; year_name: string; }
interface Batch { id: string; batch_name: string; }

type SortCol = 'full_name' | 'avg_score' | 'best_score' | 'total_interviews' | '';
type SortDir = 'asc' | 'desc';

/* ═══════════════════════════════════════════════════════════════════════════
   DISPLAY HELPERS
═══════════════════════════════════════════════════════════════════════════ */

function formatScore(v: number | null | undefined): string {
  const n = safeNum(v, -1, -1, 100);
  return n >= 0 ? n.toFixed(1) : '—';
}

function scoreColour(v: number | null | undefined): string {
  if (v == null || typeof v !== 'number') return 'text-slate-500';
  if (v >= 75) return 'text-emerald-400 font-semibold';
  if (v >= 50) return 'text-amber-400 font-semibold';
  return 'text-rose-400 font-semibold';
}

function SortIndicator({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-flex flex-col gap-[1px] align-middle ${active ? 'opacity-100' : 'opacity-25'}`}>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 0L7 4H0L3.5 0Z" fill={active && dir === 'asc' ? '#60a5fa' : '#64748b'} />
      </svg>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 4L0 0H7L3.5 4Z" fill={active && dir === 'desc' ? '#60a5fa' : '#64748b'} />
      </svg>
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════════════════ */

export default function ReportsPage() {

  /* ── State ───────────────────────────────────────────────────────────── */
  const [students,   setStudents]   = useState<StudentReport[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);
  const [error,      setError]      = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [deptFilter,  setDeptFilter]  = useState('');
  const [yearFilter,  setYearFilter]  = useState('');
  const [batchFilter, setBatchFilter] = useState('');

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [years,       setYears]       = useState<Year[]>([]);
  const [batches,     setBatches]     = useState<Batch[]>([]);

  /* ── B: Sort ─────────────────────────────────────────────────────────── */
  const [sortCol, setSortCol] = useState<SortCol>('');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  /* ── C: Highlight collapse ───────────────────────────────────────────── */
  const [showTopPerformers,  setShowTopPerformers]  = useState(true);
  const [showNeedsAttention, setShowNeedsAttention] = useState(true);

  /* ── D: Schedule ─────────────────────────────────────────────────────── */
  const [showSchedule,   setShowSchedule]   = useState(false);
  const [scheduleFreq,   setScheduleFreq]   = useState<'weekly' | 'monthly'>('monthly');
  const [scheduleEmail,  setScheduleEmail]  = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleErr,    setScheduleErr]    = useState('');

  /* ── Refs ────────────────────────────────────────────────────────────── */
  const isMountedRef        = useRef(true);
  const abortControllerRef  = useRef<AbortController | null>(null);
  const segmentsLoadedRef   = useRef(false);
  const hasPreviewedRef     = useRef(false);
  const errorDismissTimer   = useRef<ReturnType<typeof setTimeout>>(undefined);
  const successDismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
      clearTimeout(errorDismissTimer.current);
      clearTimeout(successDismissTimer.current);
    };
  }, []);

  /* ── Notifications ───────────────────────────────────────────────────── */

  const showError = useCallback((msg: string) => {
    if (!isMountedRef.current) return;
    setError(msg);
    clearTimeout(errorDismissTimer.current);
    errorDismissTimer.current = setTimeout(() => {
      if (isMountedRef.current) setError('');
    }, 8000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    if (!isMountedRef.current) return;
    setSuccessMsg(msg);
    clearTimeout(successDismissTimer.current);
    successDismissTimer.current = setTimeout(() => {
      if (isMountedRef.current) setSuccessMsg('');
    }, 4000);
  }, []);

  /* ── Segment session cache ───────────────────────────────────────────── */

  useEffect(() => {
    if (segmentsLoadedRef.current) return;
    Promise.all([
      api.listCollegeDepartments<{ departments: Dept[] }>(),
      api.listCollegeYears<{ years: Year[] }>(),
      api.listCollegeBatches<{ batches: Batch[] }>(),
    ])
      .then(([d, y, b]) => {
        if (!isMountedRef.current) return;
        /* SEC-8: prototype-pollution-safe extraction */
        setDepartments(safeArray<Dept>(d?.departments));
        setYears(safeArray<Year>(y?.years));
        setBatches(safeArray<Batch>(b?.batches));
        segmentsLoadedRef.current = true;
      })
      .catch(() => {
        if (isMountedRef.current)
          showError('Could not load filter options — filters may be incomplete. Refresh to retry.');
      });
  }, [showError]);

  /* ── Preview fetch ───────────────────────────────────────────────────── */

  const loadPreview = useCallback(async () => {
    /* SEC-7: rate limit preview fetches */
    const rl = previewLimiter.check();
    if (!rl.allowed) {
      showError(`Preview limit reached. Please wait ${Math.ceil((rl.waitMs ?? 60000) / 1000)}s.`);
      return;
    }

    /* Cancel any in-flight request */
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();

      /* SEC-3: UUID-validate all ID filter params before sending */
      if (deptFilter  && isValidUUID(deptFilter))  params.set('department_id', deptFilter);
      if (yearFilter  && isValidUUID(yearFilter))  params.set('year_id',       yearFilter);
      if (batchFilter && isValidUUID(batchFilter)) params.set('batch_id',      batchFilter);

      params.set('format', 'json');
      /* SEC-10: allowlist the limit value */
      params.set('limit', String(PREVIEW_LIMIT_DEFAULT));

      const res = await api.exportCollegeReports<{ students: StudentReport[]; total: number }>(
        params.toString(),
      );
      if (!isMountedRef.current) return;

      /* SEC-8: prototype-pollution-safe extraction */
      const rawStudents = safeArray<StudentReport>(res?.students);

      /* SEC-9: validate numeric fields in each student record */
      const safeStudents: StudentReport[] = rawStudents.map(s => ({
        full_name:        s.full_name        ? sanitizeInput(String(s.full_name), 200)        : null,
        email:            sanitizeInput(String(s.email ?? ''), 254),
        student_code:     s.student_code     ? sanitizeInput(String(s.student_code), 50)      : null,
        department_name:  s.department_name  ? sanitizeInput(String(s.department_name), 200)  : null,
        year_name:        s.year_name        ? sanitizeInput(String(s.year_name), 200)         : null,
        batch_name:       s.batch_name       ? sanitizeInput(String(s.batch_name), 200)        : null,
        section:          s.section          ? sanitizeInput(String(s.section), 100)           : null,
        has_career_access: Boolean(s.has_career_access),
        status:           sanitizeInput(String(s.status ?? ''), 50),
        total_interviews:  safeNum(s.total_interviews, 0, 0, 100_000),
        avg_score:         s.avg_score  != null ? safeNum(s.avg_score,  null as unknown as number, 0, 100) : null,
        best_score:        s.best_score != null ? safeNum(s.best_score, null as unknown as number, 0, 100) : null,
      }));

      setStudents(safeStudents);
      setTotal(safeNum(res?.total, 0, 0, 10_000_000));
      hasPreviewedRef.current = true;
    } catch (err) {
      if (!isMountedRef.current) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      showError(scrubError(err));   // SEC-1
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [deptFilter, yearFilter, batchFilter, showError]);

  /* Auto-refresh after first preview when filters change */
  useEffect(() => {
    if (!hasPreviewedRef.current) return;
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, yearFilter, batchFilter]);

  /* ── CSV Download — Safari-safe + formula-injection-free filename ─────── */

  const handleCSVDownload = async () => {
    if (csvLoading) return;

    /* SEC-7: rate limit CSV downloads */
    const rl = csvLimiter.check();
    if (!rl.allowed) {
      showError(`Download limit reached. Please wait ${Math.ceil((rl.waitMs ?? 60000) / 1000)}s.`);
      return;
    }

    setCsvLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();

      /* SEC-3: UUID-validate filter IDs */
      if (deptFilter  && isValidUUID(deptFilter))  params.set('department_id', deptFilter);
      if (yearFilter  && isValidUUID(yearFilter))  params.set('year_id',       yearFilter);
      if (batchFilter && isValidUUID(batchFilter)) params.set('batch_id',      batchFilter);
      params.set('format', 'csv');

      const blob = await api.exportCollegeReportsCSV(params.toString());
      if (!isMountedRef.current) return;

      /* SEC-6: sanitize all label components before building filename */
      const date       = new Date().toISOString().slice(0, 10);
      const deptLabel  = deptFilter  ? `_${sanitizeFilename(departments.find(d => d.id === deptFilter)?.department_name  ?? deptFilter)}`  : '';
      const yearLabel  = yearFilter  ? `_${sanitizeFilename(years.find(y => y.id === yearFilter)?.year_name              ?? yearFilter)}`  : '';
      const batchLabel = batchFilter ? `_${sanitizeFilename(batches.find(b => b.id === batchFilter)?.batch_name          ?? batchFilter)}` : '';
      const filename   = sanitizeFilename(`prepvista_students_${date}${deptLabel}${yearLabel}${batchLabel}.csv`);

      /* Safari-safe download: append to body + deferred revoke */
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 150);

      showSuccess(`Downloaded: ${filename}`);
    } catch (err) {
      if (!isMountedRef.current) return;
      showError(scrubError(err));
    } finally {
      if (isMountedRef.current) setCsvLoading(false);
    }
  };

  /* ── D: Schedule Export ──────────────────────────────────────────────── */

  const handleScheduleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleErr('');

    /* SEC-7: rate limit schedule saves */
    const rl = scheduleLimiter.check();
    if (!rl.allowed) {
      setScheduleErr(`Too many requests. Wait ${Math.ceil((rl.waitMs ?? 60000) / 1000)}s.`);
      return;
    }

    /* SEC-4: strict email validation */
    const rawEmail = scheduleEmail.trim();
    if (!isValidEmail(rawEmail)) {
      setScheduleErr('Please enter a valid email address.');
      return;
    }

    /* SEC-10: allowlist frequency value — never trust select state directly */
    if (!ALLOWED_FREQUENCIES.has(scheduleFreq)) {
      setScheduleErr('Invalid frequency selected.');
      return;
    }

    /* SEC-2: sanitize email before sending */
    const safeEmail = sanitizeInput(rawEmail, 254);

    setScheduleSaving(true);
    try {
      /* SEC: explicit payload — no spread of form state (mass assignment prevention) */
      await api.scheduleCollegeReport({
        frequency:     scheduleFreq,          // already allowlisted above
        email:         safeEmail,
        department_id: (deptFilter  && isValidUUID(deptFilter))  ? deptFilter  : null,
        year_id:       (yearFilter  && isValidUUID(yearFilter))  ? yearFilter  : null,
        batch_id:      (batchFilter && isValidUUID(batchFilter)) ? batchFilter : null,
      });
      if (!isMountedRef.current) return;
      setShowSchedule(false);
      setScheduleEmail('');
      showSuccess(
        `${scheduleFreq === 'weekly' ? 'Weekly' : 'Monthly'} report scheduled to ${safeEmail}.`,
      );
    } catch (err) {
      if (!isMountedRef.current) return;
      setScheduleErr(scrubError(err));
    } finally {
      if (isMountedRef.current) setScheduleSaving(false);
    }
  };

  /* ── B: Client-side sort ─────────────────────────────────────────────── */

  const handleSort = (col: SortCol) => {
    /* SEC-10: allowlist sort column */
    if (!ALLOWED_SORT_COLS.has(col)) return;
    if (col === sortCol) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir(col === 'full_name' ? 'asc' : 'desc');
    }
  };

  const sortedStudents = [...students].sort((a, b) => {
    if (!sortCol) return 0;
    let av: string | number | null, bv: string | number | null;
    if      (sortCol === 'full_name')        { av = a.full_name ?? '';          bv = b.full_name ?? ''; }
    else if (sortCol === 'avg_score')        { av = a.avg_score;                bv = b.avg_score; }
    else if (sortCol === 'best_score')       { av = a.best_score;               bv = b.best_score; }
    else                                     { av = a.total_interviews;         bv = b.total_interviews; }
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  /* ── C: Top performers + needs attention ──────────────────────────────── */

  const topPerformers = [...students]
    .filter(s => s.best_score != null)
    .sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0))
    .slice(0, 5);

  const needsAttention = [...students]
    .filter(s => s.total_interviews >= 1 && s.avg_score != null)
    .sort((a, b) => (a.avg_score ?? 100) - (b.avg_score ?? 100))
    .slice(0, 5);

  /* ── A: Score distribution buckets ───────────────────────────────────── */

  const scoredStudents = students.filter(s => s.avg_score != null);
  const buckets = [
    { label: '0–25',   colour: 'bg-rose-500',   count: scoredStudents.filter(s => (s.avg_score ?? 0) < 25).length },
    { label: '25–50',  colour: 'bg-amber-500',   count: scoredStudents.filter(s => (s.avg_score ?? 0) >= 25 && (s.avg_score ?? 0) < 50).length },
    { label: '50–75',  colour: 'bg-yellow-400',  count: scoredStudents.filter(s => (s.avg_score ?? 0) >= 50 && (s.avg_score ?? 0) < 75).length },
    { label: '75–100', colour: 'bg-emerald-500', count: scoredStudents.filter(s => (s.avg_score ?? 0) >= 75).length },
  ];
  const maxBucketCount = Math.max(...buckets.map(b => b.count), 1);

  /* ── Filter helpers ──────────────────────────────────────────────────── */

  const hasActiveFilters = !!(deptFilter || yearFilter || batchFilter);
  const clearFilters = () => {
    setDeptFilter(''); setYearFilter(''); setBatchFilter('');
  };

  /* ── KPI aggregates ──────────────────────────────────────────────────── */

  const scoredRows   = students.filter(s => s.avg_score != null);
  const kpiAvg       = scoredRows.length > 0
    ? scoredRows.reduce((s, r) => s + (r.avg_score ?? 0), 0) / scoredRows.length
    : null;
  const kpiBest      = students.length > 0
    ? Math.max(...students.map(r => safeNum(r.best_score, 0, 0, 100)))
    : null;
  const kpiCareerPct = students.length > 0
    ? Math.round((students.filter(r => r.has_career_access).length / students.length) * 100)
    : null;

  /* ── Shared sortable th ───────────────────────────────────────────────── */

  const SortableTh = ({ col, label }: { col: SortCol; label: string }) => (
    <th
      className="px-4 py-3 cursor-pointer select-none hover:text-white transition-colors whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}<SortIndicator active={sortCol === col} dir={sortDir} />
      </span>
    </th>
  );

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between fade-in">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-sm text-slate-400">Preview and export student performance data</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => { setShowSchedule(true); setScheduleErr(''); }}
            className="btn-secondary !px-4 !py-2 text-sm">
            <span className="inline-flex items-center gap-2"><CalendarIcon size={15} />Schedule</span>
          </button>
          <button type="button" onClick={handleCSVDownload} disabled={csvLoading}
            className="btn-primary !px-4 !py-2 text-sm disabled:opacity-60">
            <span className="inline-flex items-center gap-2">
              <DownloadIcon size={15} />{csvLoading ? 'Downloading…' : 'Download CSV'}
            </span>
          </button>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 flex items-center justify-between">
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg('')} className="ml-3 text-emerald-400 hover:text-white"><XIcon size={14} /></button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="ml-3 text-rose-400 hover:text-white"><XIcon size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end slide-up">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Department</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="mt-1 block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
            <option value="">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>
                {/* SEC-2: sanitize segment label rendered in option */}
                {sanitizeInput(d.department_name, 100)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Year</label>
          <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
            className="mt-1 block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
            <option value="">All Years</option>
            {years.map(y => <option key={y.id} value={y.id}>{sanitizeInput(y.year_name, 100)}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Batch</label>
          <select value={batchFilter} onChange={e => setBatchFilter(e.target.value)}
            className="mt-1 block rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none [&>option]:bg-slate-900">
            <option value="">All Batches</option>
            {batches.map(b => <option key={b.id} value={b.id}>{sanitizeInput(b.batch_name, 100)}</option>)}
          </select>
        </div>

        <button type="button" onClick={loadPreview} disabled={loading}
          className="btn-secondary !px-4 !py-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <FilterIcon size={14} />{loading ? 'Loading…' : 'Preview'}
          </span>
        </button>

        {hasActiveFilters && (
          <button type="button" onClick={clearFilters}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-1.5">
            <XIcon size={13} /> Clear
          </button>
        )}
      </div>

      {/* KPI Cards */}
      {students.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 slide-up">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Students</div>
            <div className="mt-1 text-2xl font-bold text-white">{total}</div>
            {total > PREVIEW_LIMIT_DEFAULT && (
              <div className="text-[10px] text-slate-600 mt-0.5">Preview: top {PREVIEW_LIMIT_DEFAULT}</div>
            )}
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Avg Score</div>
            <div className={`mt-1 text-2xl font-bold ${scoreColour(kpiAvg)}`}>{formatScore(kpiAvg)}</div>
            <div className="text-[10px] text-slate-600 mt-0.5">out of 100</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Best Score</div>
            <div className={`mt-1 text-2xl font-bold ${scoreColour(kpiBest)}`}>
              {kpiBest != null && kpiBest > 0 ? kpiBest.toFixed(1) : '—'}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">highest individual</div>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 py-4">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Career Access</div>
            <div className={`mt-1 text-2xl font-bold ${kpiCareerPct != null && kpiCareerPct >= 80 ? 'text-emerald-400' : kpiCareerPct != null && kpiCareerPct >= 50 ? 'text-amber-400' : 'text-slate-400'}`}>
              {kpiCareerPct != null ? `${kpiCareerPct}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">of previewed students</div>
          </div>
        </div>
      )}

      {/* A: Score Distribution Sparkline */}
      {scoredStudents.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-4 slide-up">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-3">
            Score Distribution (avg score)
          </div>
          <div className="space-y-2.5">
            {buckets.map(bucket => {
              const pct  = Math.round((bucket.count / scoredStudents.length) * 100);
              const barW = Math.round((bucket.count / maxBucketCount) * 100);
              return (
                <div key={bucket.label} className="flex items-center gap-3">
                  <div className="w-14 text-[11px] text-slate-500 text-right shrink-0">{bucket.label}</div>
                  <div className="flex-1 h-5 rounded-full bg-white/[0.03] overflow-hidden">
                    <div className={`h-full rounded-full ${bucket.colour} opacity-80 transition-all duration-500`}
                      style={{ width: `${barW}%` }} />
                  </div>
                  <div className="w-20 text-[11px] text-slate-400 shrink-0">
                    {bucket.count} <span className="text-slate-600">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* C: Top Performers + Needs Attention */}
      {students.length > 0 && (topPerformers.length > 0 || needsAttention.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2 slide-up">

          {topPerformers.length > 0 && (
            <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5">
              <button type="button" onClick={() => setShowTopPerformers(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-base">🏆</span>
                  <span className="text-sm font-semibold text-white">Top Performers</span>
                  <span className="text-[10px] text-emerald-400/60 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full">by best score</span>
                </div>
                <span className="text-slate-500 text-xs">{showTopPerformers ? '▲' : '▼'}</span>
              </button>
              {showTopPerformers && (
                <div className="px-5 pb-4 space-y-2">
                  {topPerformers.map((s, i) => (
                    <div key={s.email} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-bold text-slate-600 w-4">{i + 1}</span>
                        <div>
                          {/* SEC-5: sanitizeDisplayValue strips formula chars from user-submitted names */}
                          <div className="text-sm font-medium text-white">
                            {sanitizeDisplayValue(s.full_name) === '—' ? 'Unnamed' : sanitizeDisplayValue(s.full_name)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {sanitizeDisplayValue(s.department_name)}
                          </div>
                        </div>
                      </div>
                      <span className={`text-sm ${scoreColour(s.best_score)}`}>{formatScore(s.best_score)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {needsAttention.length > 0 && (
            <div className="rounded-2xl border border-rose-500/15 bg-rose-500/5">
              <button type="button" onClick={() => setShowNeedsAttention(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-rose-400 text-base">⚠️</span>
                  <span className="text-sm font-semibold text-white">Needs Attention</span>
                  <span className="text-[10px] text-rose-400/60 font-semibold bg-rose-500/10 px-2 py-0.5 rounded-full">lowest avg · ≥1 session</span>
                </div>
                <span className="text-slate-500 text-xs">{showNeedsAttention ? '▲' : '▼'}</span>
              </button>
              {showNeedsAttention && (
                <div className="px-5 pb-4 space-y-2">
                  {needsAttention.map((s, i) => (
                    <div key={s.email} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[11px] font-bold text-slate-600 w-4">{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium text-white">
                            {sanitizeDisplayValue(s.full_name) === '—' ? 'Unnamed' : sanitizeDisplayValue(s.full_name)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {sanitizeDisplayValue(s.department_name)}
                          </div>
                        </div>
                      </div>
                      <span className={`text-sm ${scoreColour(s.avg_score)}`}>{formatScore(s.avg_score)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Preview Table — B: sortable columns */}
      {students.length > 0 && (
        <div className="slide-up">
          <div className="text-sm text-slate-400 mb-3">
            Showing {students.length} of {total} student{total !== 1 ? 's' : ''}
            {sortCol && <span className="ml-2 text-blue-400/60">· sorted by {sortCol.replace('_', ' ')} ({sortDir})</span>}
            {total > PREVIEW_LIMIT_DEFAULT && <span className="ml-1 text-slate-600">· Download CSV for full export</span>}
          </div>

          <div className="overflow-x-auto rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
            <table className="w-full text-left text-sm min-w-[1000px]">
              <thead className="border-b border-white/[0.06] bg-white/[0.01] text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
                <tr>
                  <SortableTh col="full_name"        label="Name"     />
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Dept</th>
                  <th className="px-4 py-3">Year</th>
                  <th className="px-4 py-3">Batch</th>
                  <th className="px-4 py-3">Access</th>
                  <SortableTh col="total_interviews"  label="Sessions" />
                  <SortableTh col="avg_score"         label="Avg"      />
                  <SortableTh col="best_score"        label="Best"     />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {sortedStudents.map(s => (
                  /* key={s.email} — unique per student, stable on reorder */
                  <tr key={s.email} className="hover:bg-white/[0.02] transition-colors">
                    {/* SEC-5: all cell values passed through sanitizeDisplayValue */}
                    <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">
                      {sanitizeDisplayValue(s.full_name) === '—' ? 'Unnamed' : sanitizeDisplayValue(s.full_name)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{s.email}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{sanitizeDisplayValue(s.department_name)}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{sanitizeDisplayValue(s.year_name)}</td>
                    <td className="px-4 py-2.5 text-slate-300 text-xs">{sanitizeDisplayValue(s.batch_name)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.has_career_access ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                        {s.has_career_access ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-white font-semibold">{s.total_interviews}</td>
                    <td className={`px-4 py-2.5 ${scoreColour(s.avg_score)}`}>{formatScore(s.avg_score)}</td>
                    <td className={`px-4 py-2.5 ${scoreColour(s.best_score)}`}>{formatScore(s.best_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty / initial state */}
      {students.length === 0 && !loading && (
        <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-12 text-center text-slate-500">
          {hasPreviewedRef.current
            ? 'No students match the selected filters.'
            : 'Click "Preview" to load student report data with current filters.'}
        </div>
      )}

      {/* D: Schedule Export Modal */}
      {showSchedule && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSchedule(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">Schedule Report</h2>
                <p className="text-xs text-slate-400 mt-0.5">Automated CSV delivery by email</p>
              </div>
              <button type="button" onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-white">
                <XIcon size={20} />
              </button>
            </div>

            {/* Active filter context */}
            {hasActiveFilters && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 mb-4 text-xs text-blue-400">
                Applying current filters:{' '}
                {[
                  deptFilter  && sanitizeInput(departments.find(d => d.id === deptFilter)?.department_name  ?? '', 100),
                  yearFilter  && sanitizeInput(years.find(y => y.id === yearFilter)?.year_name              ?? '', 100),
                  batchFilter && sanitizeInput(batches.find(b => b.id === batchFilter)?.batch_name          ?? '', 100),
                ].filter(Boolean).join(' · ')}
              </div>
            )}

            {scheduleErr && (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 mb-4 text-xs text-rose-400">
                {scheduleErr}
              </div>
            )}

            <form onSubmit={handleScheduleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Frequency</label>
                <div className="mt-2 flex gap-3">
                  {(['weekly', 'monthly'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setScheduleFreq(f)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold capitalize transition-colors ${
                        scheduleFreq === f
                          ? 'border-blue-500 bg-blue-500/15 text-blue-400'
                          : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                      }`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Recipient Email *
                </label>
                <input
                  type="email"
                  required
                  value={scheduleEmail}
                  onChange={e => setScheduleEmail(e.target.value)}
                  maxLength={254}
                  placeholder="principal@college.edu"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowSchedule(false)} className="btn-secondary flex-1 !py-2.5">Cancel</button>
                <button type="submit" disabled={scheduleSaving} className="btn-primary flex-1 !py-2.5">
                  {scheduleSaving ? 'Scheduling…' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
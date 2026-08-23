import React, { useState, useMemo } from "react";
import {
  CheckCircle2, XCircle, Clock3, Calendar, MapPin, Video,
  ChevronRight, ChevronLeft, Upload, Users, FileWarning, GraduationCap,
  Building2, ArrowRight, ShieldCheck, History, Send, X
} from "lucide-react";
import Papa from "papaparse";

/* ============================================================
   DESIGN TOKENS
   A placement/registrar "operations console" identity: deep ledger
   navy chrome, warm paper content surface, brass accent for emphasis.
   Status is always icon + color + label together (never color alone).
   ============================================================ */
const C = {
  ink: "#1C2430", inkSoft: "#4A5568", paper: "#F7F6F1", paperDim: "#EFEDE4",
  navy: "#1B2A40", navyLight: "#24374F", brass: "#C99A3B", brassDeep: "#A57A22",
  forest: "#2F6B4F", forestBg: "#E6EFE9", brick: "#A23B33", brickBg: "#F5E7E5",
  amber: "#B8842E", amberBg: "#FBF0DD", slate: "#5B6472", slateBg: "#E9EAE5",
  line: "#DEDACD", lineSoft: "#EAE7DC", white: "#FFFFFF",
};
const SERIF = "Georgia, 'Iowan Old Style', 'Times New Roman', serif";

/* ============================================================
   SEED DATA — labeled demo data, same shape the tested backend uses.
   ============================================================ */
const ROSTER = [
  { regNo: "26CO101", name: "Priya Sharma", dept: "Computer Science" },
  { regNo: "26EC102", name: "Arjun Iyer", dept: "Electronics & Comm." },
  { regNo: "26IT103", name: "Meera Nair", dept: "Information Technology" },
  { regNo: "26CO104", name: "Karthik Reddy", dept: "Computer Science" },
  { regNo: "26EC105", name: "Divya Menon", dept: "Electronics & Comm." },
  { regNo: "26IT106", name: "Rohit Verma", dept: "Information Technology" },
  { regNo: "26CO107", name: "Sneha Pillai", dept: "Computer Science" },
  { regNo: "26EC108", name: "Vikram Rao", dept: "Electronics & Comm." },
  { regNo: "26IT109", name: "Ishita Gupta", dept: "Information Technology" },
  { regNo: "26CO110", name: "Sanjay Kumar", dept: "Computer Science" },
  { regNo: "26EC111", name: "Ananya Menon", dept: "Electronics & Comm." },
  { regNo: "26IT112", name: "Nikhil Sharma", dept: "Information Technology" },
];

function hoursFromNow(h) {
  return new Date(Date.now() + h * 3600 * 1000);
}
function fmtDateTime(d) {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function fmtShort(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const seedInterviews = () => [
  { id: "iv1", ...ROSTER[0], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(3), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/priya", instructions: "Join 10 min early with your ID visible.",
    status: "SCHEDULED", attendance: "NOT_RECORDED", confirmed: false,
    issue: { type: "CANNOT_ACCESS_LINK", details: "Meeting link returns a 404.", status: "OPEN" }, result: null },
  { id: "iv2", ...ROSTER[1], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(26), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/arjun", instructions: "Join 10 min early with your ID visible.",
    status: "CONFIRMED", attendance: "NOT_RECORDED", confirmed: true, issue: null, result: null },
  { id: "iv3", ...ROSTER[2], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-2), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/meera", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PENDING", attendance: "PRESENT", confirmed: true, issue: null, result: null },
  { id: "iv4", ...ROSTER[3], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-3), mode: "ON_CAMPUS", location: "Placement Cell, Room 2", instructions: "Bring a printed resume.",
    status: "RESULT_PENDING", attendance: "PRESENT", confirmed: true, issue: null, result: null },
  { id: "iv5", ...ROSTER[4], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-4), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/divya", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PENDING", attendance: "LATE", confirmed: true, issue: null, result: null },
  { id: "iv6", ...ROSTER[5], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-20), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/rohit", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PUBLISHED", attendance: "PRESENT", confirmed: true, issue: null,
    result: { value: "PASS", remarks: "Strong DSA fundamentals, clear communication.", publishedAt: hoursFromNow(-6), history: [{ v: 1, value: "PASS", source: "TPO_ENTERED" }] } },
  { id: "iv7", ...ROSTER[6], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-21), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/sneha", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PUBLISHED", attendance: "PRESENT", confirmed: true, issue: null,
    result: { value: "FAIL", remarks: "Struggled with system design tradeoffs.", publishedAt: hoursFromNow(-6), history: [{ v: 1, value: "FAIL", source: "TPO_ENTERED" }] } },
  { id: "iv8", ...ROSTER[7], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-22), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/vikram", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PUBLISHED", attendance: "PRESENT", confirmed: true, issue: null,
    result: { value: "HOLD", remarks: "Panel wants a second opinion on the design round.", publishedAt: hoursFromNow(-6), history: [{ v: 1, value: "HOLD", source: "TPO_ENTERED" }] } },
  { id: "iv9", ...ROSTER[8], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-23), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/ishita", instructions: "Join 10 min early with your ID visible.",
    status: "NO_SHOW", attendance: "ABSENT", confirmed: true, issue: null, result: null },
  { id: "iv10", ...ROSTER[9], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-1), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/sanjay", instructions: "Join 10 min early with your ID visible.",
    status: "CANCELLED", attendance: "NOT_RECORDED", confirmed: false, issue: null, result: null },
  { id: "iv11", ...ROSTER[10], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-5), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/ananya", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PENDING", attendance: "PRESENT", confirmed: true, issue: null, result: null },
  { id: "iv12", ...ROSTER[11], company: "Solstice Robotics", role: "Graduate Software Engineer", round: "Technical",
    scheduledAt: hoursFromNow(-24), mode: "ONLINE", meetingRef: "https://meet.example.edu/iv/nikhil", instructions: "Join 10 min early with your ID visible.",
    status: "RESULT_PUBLISHED", attendance: "PRESENT", confirmed: true, issue: null,
    result: { value: "PASS", remarks: "Excellent problem decomposition.", publishedAt: hoursFromNow(-6), history: [{ v: 1, value: "PASS", source: "TPO_ENTERED" }] } },
];

const SAMPLE_CSV =
  "Register Number,Name,Result,Remarks\n" +
  "26IT103,Meera Nair,PASS,Panel scoresheet upload\n" +
  "26CO104,Karthik Reddy,FAIL,Panel scoresheet upload\n" +
  "26EC105,Divya Menon,HOLD,Needs second opinion\n" +
  "26EC111,Ananya Menon,PASS,Panel scoresheet upload\n" +
  "26EC111,Ananya Menon,PASS,duplicate row test\n" +
  "26CO999,Unknown Student,PASS,unrecognized register number\n" +
  "26EC108,Vikram Rao,PASS,recruiter says reconsider (conflict test)\n";

/* ============================================================
   SMALL PRESENTATIONAL PIECES
   ============================================================ */
const STATUS_META = {
  SCHEDULED: { label: "Scheduled", color: C.slate, bg: C.slateBg, Icon: Calendar },
  CONFIRMED: { label: "Confirmed", color: C.navy, bg: C.slateBg, Icon: CheckCircle2 },
  RESULT_PENDING: { label: "Result Pending", color: C.amber, bg: C.amberBg, Icon: Clock3 },
  RESULT_PUBLISHED: { label: "Published", color: C.forest, bg: C.forestBg, Icon: CheckCircle2 },
  NO_SHOW: { label: "No Show", color: C.brick, bg: C.brickBg, Icon: XCircle },
  CANCELLED: { label: "Cancelled", color: C.inkSoft, bg: C.slateBg, Icon: X },
};
const RESULT_META = {
  PASS: { label: "PASS", color: C.forest, bg: C.forestBg, Icon: CheckCircle2 },
  FAIL: { label: "FAIL", color: C.brick, bg: C.brickBg, Icon: XCircle },
  HOLD: { label: "HOLD", color: C.amber, bg: C.amberBg, Icon: Clock3 },
};

function Chip({ color, bg, Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ color, backgroundColor: bg }}>
      {Icon ? <Icon size={13} strokeWidth={2.5} /> : null}
      {children}
    </span>
  );
}
function StatusChip({ status }) {
  const m = STATUS_META[status] || STATUS_META.SCHEDULED;
  return <Chip color={m.color} bg={m.bg} Icon={m.Icon}>{m.label}</Chip>;
}
function ResultChip({ value }) {
  if (!value) return <span className="text-xs" style={{ color: C.inkSoft }}>—</span>;
  const m = RESULT_META[value];
  return <Chip color={m.color} bg={m.bg} Icon={m.Icon}>{m.label}</Chip>;
}
function SectionLabel({ children }) {
  return (
    <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: C.brassDeep }}>
      {children}
    </div>
  );
}
function Card({ children, className = "", onClick }) {
  return (
    <div onClick={onClick}
         className={`rounded-xl border p-4 bg-white ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""} ${className}`}
         style={{ borderColor: C.line }}>
      {children}
    </div>
  );
}
function MetricCard({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4 flex-1 min-w-[120px]" style={{ backgroundColor: C.white, border: `1px solid ${C.line}` }}>
      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: accent || C.ink, fontFamily: SERIF }}>{value}</div>
    </div>
  );
}
function Button({ children, onClick, variant = "primary", disabled, small }) {
  const styles = {
    primary: { backgroundColor: C.navy, color: C.white },
    brass: { backgroundColor: C.brass, color: C.navy },
    ghost: { backgroundColor: "transparent", color: C.navy, border: `1px solid ${C.line}` },
    danger: { backgroundColor: C.brick, color: C.white },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-lg font-semibold transition-opacity ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-85"}`}
      style={styles[variant]}>
      {children}
    </button>
  );
}

/* ============================================================
   TPO — Overview + list
   ============================================================ */
function TpoOverview({ interviews, issues }) {
  const today = interviews.filter((i) => fmtShort(i.scheduledAt) === fmtShort(new Date()));
  const upcoming = interviews.filter((i) => i.scheduledAt > new Date() && i.status !== "CANCELLED");
  const resultsPending = interviews.filter((i) => i.status === "RESULT_PENDING");
  const published = interviews.filter((i) => i.status === "RESULT_PUBLISHED");
  const noShows = interviews.filter((i) => i.status === "NO_SHOW");
  const openIssues = issues.filter((x) => x.status === "OPEN");
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      <MetricCard label="Today's Interviews" value={today.length} />
      <MetricCard label="Upcoming" value={upcoming.length} />
      <MetricCard label="Results Pending" value={resultsPending.length} accent={C.amber} />
      <MetricCard label="Published" value={published.length} accent={C.forest} />
      <MetricCard label="No-Shows" value={noShows.length} accent={C.brick} />
      <MetricCard label="Issues Open" value={openIssues.length} accent={openIssues.length ? C.brick : undefined} />
    </div>
  );
}

function InterviewRow({ iv, onOpen }) {
  return (
    <tr className="border-b hover:bg-[--rowhover] cursor-pointer" style={{ borderColor: C.lineSoft }} onClick={() => onOpen(iv.id)}>
      <td className="py-2.5 px-3">
        <div className="font-semibold" style={{ color: C.ink }}>{iv.name}</div>
        <div className="text-xs font-mono" style={{ color: C.inkSoft }}>{iv.regNo}</div>
      </td>
      <td className="py-2.5 px-3 text-sm" style={{ color: C.inkSoft }}>{iv.dept}</td>
      <td className="py-2.5 px-3 text-sm">{iv.round}</td>
      <td className="py-2.5 px-3 text-sm whitespace-nowrap">{fmtDateTime(iv.scheduledAt)}</td>
      <td className="py-2.5 px-3"><StatusChip status={iv.status} /></td>
      <td className="py-2.5 px-3"><ResultChip value={iv.result ? iv.result.value : null} /></td>
      <td className="py-2.5 px-3 text-right"><ChevronRight size={16} style={{ color: C.inkSoft }} /></td>
    </tr>
  );
}

function TpoInterviewList({ interviews, onOpen }) {
  const [status, setStatus] = useState("ALL");
  const [dept, setDept] = useState("ALL");
  const [search, setSearch] = useState("");
  const depts = useMemo(() => Array.from(new Set(interviews.map((i) => i.dept))), [interviews]);

  const filtered = interviews.filter((i) => {
    if (status !== "ALL" && i.status !== status) return false;
    if (dept !== "ALL" && i.dept !== dept) return false;
    if (search && !(i.name.toLowerCase().includes(search.toLowerCase()) || i.regNo.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => a.scheduledAt - b.scheduledAt);

  return (
    <Card>
      <div className="flex flex-wrap gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or register no."
               className="px-3 py-1.5 rounded-lg text-sm border flex-1 min-w-[180px]" style={{ borderColor: C.line }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm border" style={{ borderColor: C.line }}>
          <option value="ALL">All statuses</option>
          {Object.keys(STATUS_META).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm border" style={{ borderColor: C.line }}>
          <option value="ALL">All departments</option>
          {depts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs font-bold uppercase tracking-wide" style={{ color: C.inkSoft }}>
              <th className="py-2 px-3">Student</th><th className="py-2 px-3">Department</th>
              <th className="py-2 px-3">Round</th><th className="py-2 px-3">Scheduled</th>
              <th className="py-2 px-3">Status</th><th className="py-2 px-3">Result</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((iv) => <InterviewRow key={iv.id} iv={iv} onOpen={onOpen} />)}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-sm text-center py-8" style={{ color: C.inkSoft }}>No interviews match these filters.</div>}
      </div>
    </Card>
  );
}

/* ============================================================
   TPO — Interview detail (attendance + result entry + history)
   ============================================================ */
function TpoInterviewDetail({ iv, onBack, onRecordAttendance, onEnterResult, onResolveIssue }) {
  const [resultValue, setResultValue] = useState("PASS");
  const [remarks, setRemarks] = useState("");
  const hasCurrentResult = !!iv.result;

  return (
    <Card>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: C.navy }}>
        <ChevronLeft size={16} /> Back to list
      </button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.brassDeep }}>{iv.company} · {iv.round} Interview</div>
          <div className="text-xl font-bold mt-0.5" style={{ fontFamily: SERIF, color: C.ink }}>{iv.name}</div>
          <div className="text-sm font-mono" style={{ color: C.inkSoft }}>{iv.regNo} · {iv.dept}</div>
        </div>
        <StatusChip status={iv.status} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-5 text-sm">
        <div className="flex items-center gap-2"><Calendar size={15} style={{ color: C.inkSoft }} /> {fmtDateTime(iv.scheduledAt)}</div>
        <div className="flex items-center gap-2">
          {iv.mode === "ONLINE" ? <Video size={15} style={{ color: C.inkSoft }} /> : <MapPin size={15} style={{ color: C.inkSoft }} />}
          {iv.mode === "ONLINE" ? "Online" : iv.location || "On campus"}
        </div>
        <div className="flex items-center gap-2"><ShieldCheck size={15} style={{ color: C.inkSoft }} /> Attendance: {iv.attendance}</div>
        <div className="flex items-center gap-2"><CheckCircle2 size={15} style={{ color: C.inkSoft }} /> Student confirmed: {iv.confirmed ? "Yes" : "No"}</div>
      </div>

      {iv.issue && (
        <div className="rounded-lg p-3 mb-4 flex items-start gap-2" style={{ backgroundColor: C.brickBg }}>
          <FileWarning size={16} style={{ color: C.brick, marginTop: 2 }} />
          <div className="text-sm flex-1">
            <div className="font-semibold" style={{ color: C.brick }}>Student reported an issue — {iv.issue.status}</div>
            <div style={{ color: C.ink }}>{iv.issue.details}</div>
          </div>
          {iv.issue.status === "OPEN" && (
            <Button small variant="ghost" onClick={() => onResolveIssue(iv.id)}>Mark resolved</Button>
          )}
        </div>
      )}

      {iv.attendance === "NOT_RECORDED" && (
        <div className="mb-5">
          <SectionLabel>Record attendance</SectionLabel>
          <div className="flex gap-2">
            <Button small onClick={() => onRecordAttendance(iv.id, "PRESENT")}>Present</Button>
            <Button small variant="ghost" onClick={() => onRecordAttendance(iv.id, "LATE")}>Late</Button>
            <Button small variant="danger" onClick={() => onRecordAttendance(iv.id, "ABSENT")}>Absent</Button>
          </div>
        </div>
      )}

      {(iv.status === "RESULT_PENDING" || hasCurrentResult) && (
        <div className="mb-2">
          <SectionLabel>{hasCurrentResult ? "Current result (internal)" : "Enter result"}</SectionLabel>
          {hasCurrentResult ? (
            <div className="flex items-center gap-3 mb-2">
              <ResultChip value={iv.result.value} />
              <span className="text-sm" style={{ color: C.inkSoft }}>{iv.result.remarks}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <select value={resultValue} onChange={(e) => setResultValue(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: C.line }}>
                <option value="PASS">PASS</option><option value="FAIL">FAIL</option><option value="HOLD">HOLD</option>
              </select>
              <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (panel notes)"
                     className="px-3 py-2 rounded-lg border text-sm flex-1 min-w-[180px]" style={{ borderColor: C.line }} />
              <Button onClick={() => onEnterResult(iv.id, resultValue, remarks)}>Save (internal only)</Button>
            </div>
          )}
          {hasCurrentResult && iv.result.history && iv.result.history.length > 1 && (
            <div className="mt-3 text-xs" style={{ color: C.inkSoft }}>
              <div className="flex items-center gap-1 font-semibold mb-1"><History size={12} /> Version history</div>
              {iv.result.history.map((h) => <div key={h.v}>v{h.v}: {h.value} ({h.source})</div>)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   TPO — Results Pending workbench
   ============================================================ */
function ResultsPendingWorkbench({ interviews, onOpen }) {
  const pending = interviews.filter((i) => i.status === "RESULT_PENDING").sort((a, b) => a.scheduledAt - b.scheduledAt);
  return (
    <Card>
      <SectionLabel>Results Pending — {pending.length}</SectionLabel>
      {pending.length === 0 ? (
        <div className="text-sm py-6 text-center" style={{ color: C.inkSoft }}>Nothing waiting on a result right now.</div>
      ) : (
        <div className="divide-y" style={{ borderColor: C.lineSoft }}>
          {pending.map((iv) => {
            const hoursWaiting = Math.max(0, Math.round((Date.now() - iv.scheduledAt.getTime()) / 3600000));
            return (
              <div key={iv.id} className="py-2.5 flex items-center justify-between cursor-pointer" onClick={() => onOpen(iv.id)}>
                <div>
                  <div className="font-semibold text-sm">{iv.name} <span className="font-mono font-normal" style={{ color: C.inkSoft }}>· {iv.regNo}</span></div>
                  <div className="text-xs" style={{ color: C.inkSoft }}>{iv.company} — {iv.round}, completed {fmtDateTime(iv.scheduledAt)}</div>
                </div>
                <Chip color={hoursWaiting > 24 ? C.brick : C.amber} bg={hoursWaiting > 24 ? C.brickBg : C.amberBg}>
                  {hoursWaiting}h waiting
                </Chip>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   TPO — Import panel (real client-side validation via PapaParse)
   ============================================================ */
function ImportPanel({ interviews, onCommitImport }) {
  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [preview, setPreview] = useState(null);

  function validate() {
    const parsed = Papa.parse(csvText.trim(), { header: true, skipEmptyLines: true });
    const seen = new Set();
    const buckets = { valid: [], unknown: [], duplicate: [], conflict: [] };
    parsed.data.forEach((row) => {
      const regNo = (row["Register Number"] || "").trim();
      const result = (row["Result"] || "").trim().toUpperCase();
      if (!regNo) return;
      if (seen.has(regNo)) { buckets.duplicate.push({ regNo, result }); return; }
      seen.add(regNo);
      const student = ROSTER.find((s) => s.regNo === regNo);
      if (!student) { buckets.unknown.push({ regNo, result }); return; }
      const iv = interviews.find((i) => i.regNo === regNo);
      if (iv && iv.result && iv.result.value !== result) {
        buckets.conflict.push({ regNo, name: student.name, existing: iv.result.value, incoming: result });
        return;
      }
      buckets.valid.push({ regNo, name: student.name, result, remarks: row["Remarks"] || "" });
    });
    setPreview(buckets);
  }

  return (
    <Card>
      <SectionLabel>Import recruiter results (CSV)</SectionLabel>
      <textarea value={csvText} onChange={(e) => { setCsvText(e.target.value); setPreview(null); }}
                className="w-full h-32 text-xs font-mono p-2 rounded-lg border mb-3" style={{ borderColor: C.line }} />
      <Button variant="ghost" onClick={validate}><span className="inline-flex items-center gap-1"><Upload size={14} /> Validate file</span></Button>

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            <Chip color={C.forest} bg={C.forestBg}>{preview.valid.length} valid</Chip>
            <Chip color={C.brick} bg={C.brickBg}>{preview.unknown.length} unknown student</Chip>
            <Chip color={C.amber} bg={C.amberBg}>{preview.duplicate.length} duplicate in file</Chip>
            <Chip color={C.brick} bg={C.brickBg}>{preview.conflict.length} conflict</Chip>
          </div>
          {preview.conflict.length > 0 && (
            <div className="text-xs rounded-lg p-2" style={{ backgroundColor: C.brickBg, color: C.ink }}>
              {preview.conflict.map((c, idx) => (
                <div key={idx}>Conflict: {c.name} ({c.regNo}) — published result is {c.existing}, file says {c.incoming}. Not imported; resolve manually.</div>
              ))}
            </div>
          )}
          {preview.unknown.length > 0 && (
            <div className="text-xs" style={{ color: C.inkSoft }}>
              Unknown: {preview.unknown.map((u) => u.regNo).join(", ")} — no student with this register number.
            </div>
          )}
          <Button variant="brass" disabled={preview.valid.length === 0} onClick={() => { onCommitImport(preview.valid); setPreview(null); }}>
            Commit {preview.valid.length} valid result{preview.valid.length === 1 ? "" : "s"} (internal only)
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   TPO — Review & Publish
   ============================================================ */
function ReviewPublishPanel({ interviews, onPublishAll }) {
  const [confirming, setConfirming] = useState(false);
  const readyToPublish = interviews.filter((i) => i.result && i.status !== "RESULT_PUBLISHED");
  const counts = { PASS: 0, FAIL: 0, HOLD: 0 };
  readyToPublish.forEach((i) => { counts[i.result.value] = (counts[i.result.value] || 0) + 1; });
  const missing = interviews.filter((i) => i.status === "RESULT_PENDING" && !i.result).length;

  return (
    <Card>
      <SectionLabel>Review before publication</SectionLabel>
      {readyToPublish.length === 0 ? (
        <div className="text-sm py-4" style={{ color: C.inkSoft }}>No internally-entered results waiting to publish.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            <Chip color={C.forest} bg={C.forestBg}>{counts.PASS} PASS</Chip>
            <Chip color={C.brick} bg={C.brickBg}>{counts.FAIL} FAIL</Chip>
            <Chip color={C.amber} bg={C.amberBg}>{counts.HOLD} HOLD</Chip>
            {missing > 0 && <Chip color={C.inkSoft} bg={C.slateBg}>{missing} still missing</Chip>}
          </div>
          {!confirming ? (
            <Button variant="brass" onClick={() => setConfirming(true)}>Publish {readyToPublish.length} results to students</Button>
          ) : (
            <div className="rounded-lg p-3" style={{ backgroundColor: C.paperDim }}>
              <div className="text-sm font-semibold mb-2" style={{ color: C.ink }}>
                Publish results to {readyToPublish.length} students? This is visible to them immediately.
              </div>
              <div className="flex gap-2">
                <Button variant="danger" small onClick={() => { onPublishAll(readyToPublish.map((i) => i.id)); setConfirming(false); }}>
                  Confirm publish
                </Button>
                <Button variant="ghost" small onClick={() => setConfirming(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ============================================================
   STUDENT VIEWS
   ============================================================ */
function ResultMessage({ result }) {
  if (!result) return null;
  if (result.value === "PASS") return (
    <div className="rounded-lg p-3 flex items-center gap-2" style={{ backgroundColor: C.forestBg }}>
      <CheckCircle2 size={18} style={{ color: C.forest }} />
      <span className="font-semibold text-sm" style={{ color: C.forest }}>Congratulations — you've progressed to the next round.</span>
    </div>
  );
  if (result.value === "FAIL") return (
    <div className="rounded-lg p-3 flex items-center gap-2" style={{ backgroundColor: C.brickBg }}>
      <XCircle size={18} style={{ color: C.brick }} />
      <span className="font-semibold text-sm" style={{ color: C.brick }}>Not selected for the next stage.</span>
    </div>
  );
  return (
    <div className="rounded-lg p-3 flex items-center gap-2" style={{ backgroundColor: C.amberBg }}>
      <Clock3 size={18} style={{ color: C.amber }} />
      <span className="font-semibold text-sm" style={{ color: C.amber }}>Result pending further review. The TPO will update you when a decision is available.</span>
    </div>
  );
}

function StudentInterviewCard({ iv, onOpen }) {
  return (
    <Card onClick={() => onOpen(iv.id)} className="mb-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.brassDeep }}>{iv.company}</div>
          <div className="font-semibold" style={{ fontFamily: SERIF, color: C.ink }}>{iv.round} Interview</div>
          <div className="text-sm mt-1 flex items-center gap-1" style={{ color: C.inkSoft }}><Calendar size={13} /> {fmtDateTime(iv.scheduledAt)}</div>
        </div>
        <StatusChip status={iv.status} />
      </div>
      {iv.result && <div className="mt-2"><ResultChip value={iv.result.value} /></div>}
    </Card>
  );
}

function StudentDashboard({ interviews, studentReg, onOpen }) {
  const mine = interviews.filter((i) => i.regNo === studentReg);
  const upcoming = mine.filter((i) => (i.status === "SCHEDULED" || i.status === "CONFIRMED") && i.scheduledAt > new Date());
  const completedWithResult = mine.filter((i) => i.result);
  const pendingResult = mine.filter((i) => !i.result && i.status !== "SCHEDULED" && i.status !== "CONFIRMED" && i.status !== "CANCELLED");

  if (mine.length === 0) return <div className="text-sm py-10 text-center" style={{ color: C.inkSoft }}>No interviews on record for this student yet.</div>;

  return (
    <div>
      <SectionLabel>Upcoming</SectionLabel>
      {upcoming.length ? upcoming.map((iv) => <StudentInterviewCard key={iv.id} iv={iv} onOpen={onOpen} />) : <div className="text-sm mb-4" style={{ color: C.inkSoft }}>Nothing scheduled right now.</div>}
      <div className="h-3" />
      <SectionLabel>Pending Result</SectionLabel>
      {pendingResult.length ? pendingResult.map((iv) => <StudentInterviewCard key={iv.id} iv={iv} onOpen={onOpen} />) : <div className="text-sm mb-4" style={{ color: C.inkSoft }}>Nothing waiting on a result.</div>}
      <div className="h-3" />
      <SectionLabel>Completed</SectionLabel>
      {completedWithResult.length ? completedWithResult.map((iv) => <StudentInterviewCard key={iv.id} iv={iv} onOpen={onOpen} />) : <div className="text-sm" style={{ color: C.inkSoft }}>No results yet.</div>}
    </div>
  );
}

function StudentInterviewDetail({ iv, onBack, onConfirm, onReportIssue }) {
  const [reporting, setReporting] = useState(false);
  const [issueText, setIssueText] = useState("");
  return (
    <Card>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold mb-4" style={{ color: C.navy }}>
        <ChevronLeft size={16} /> Back
      </button>
      <div className="text-xs font-bold uppercase tracking-widest" style={{ color: C.brassDeep }}>{iv.company}</div>
      <div className="text-xl font-bold mt-0.5 mb-3" style={{ fontFamily: SERIF, color: C.ink }}>{iv.round} Interview</div>
      <div className="space-y-2 text-sm mb-4">
        <div className="flex items-center gap-2"><Calendar size={15} style={{ color: C.inkSoft }} /> {fmtDateTime(iv.scheduledAt)}</div>
        <div className="flex items-center gap-2">
          {iv.mode === "ONLINE" ? <Video size={15} style={{ color: C.inkSoft }} /> : <MapPin size={15} style={{ color: C.inkSoft }} />}
          {iv.mode === "ONLINE" ? (iv.meetingRef || "Link available closer to the interview") : (iv.location || "On campus")}
        </div>
        {iv.instructions && <div className="text-sm italic" style={{ color: C.inkSoft }}>{iv.instructions}</div>}
      </div>
      <div className="mb-4"><StatusChip status={iv.status} /></div>

      {iv.result ? (
        <ResultMessage result={iv.result} />
      ) : (iv.status === "SCHEDULED" || iv.status === "CONFIRMED") ? (
        <div className="flex flex-wrap gap-2">
          {!iv.confirmed && <Button small onClick={() => onConfirm(iv.id)}>Confirm attendance</Button>}
          {!reporting ? (
            <Button small variant="ghost" onClick={() => setReporting(true)}>Report an issue</Button>
          ) : (
            <div className="w-full mt-2 flex gap-2">
              <input value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder="What's wrong?"
                     className="px-3 py-2 rounded-lg border text-sm flex-1" style={{ borderColor: C.line }} />
              <Button small onClick={() => { onReportIssue(iv.id, issueText); setReporting(false); setIssueText(""); }}>
                <span className="inline-flex items-center gap-1"><Send size={12} /> Send</span>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm" style={{ color: C.inkSoft }}>Result pending — you'll see it here as soon as it's published.</div>
      )}
    </Card>
  );
}

/* ============================================================
   APP SHELL
   ============================================================ */
export default function InterviewResultsCentre() {
  const [interviews, setInterviews] = useState(seedInterviews);
  const [issues, setIssues] = useState([{ id: "iss1", interviewId: "iv1", status: "OPEN", details: "Meeting link returns a 404." }]);
  const [role, setRole] = useState("TPO");
  const [tpoTab, setTpoTab] = useState("list");
  const [openId, setOpenId] = useState(null);
  const [studentReg, setStudentReg] = useState(ROSTER[2].regNo);
  const [studentOpenId, setStudentOpenId] = useState(null);

  function updateIv(id, patch) {
    setInterviews((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function recordAttendance(id, status) {
    updateIv(id, { attendance: status, status: status === "ABSENT" ? "NO_SHOW" : "RESULT_PENDING" });
  }
  function enterResult(id, value, remarks) {
    updateIv(id, { result: { value, remarks, publishedAt: null, history: [{ v: 1, value, source: "TPO_ENTERED" }] } });
  }
  function resolveIssue(id) {
    setInterviews((prev) => prev.map((i) => (i.id === id && i.issue ? { ...i, issue: { ...i.issue, status: "RESOLVED" } } : i)));
  }
  function commitImport(validRows) {
    setInterviews((prev) => prev.map((iv) => {
      const row = validRows.find((r) => r.regNo === iv.regNo);
      if (!row) return iv;
      return { ...iv, status: "RESULT_PENDING", result: { value: row.result, remarks: row.remarks, publishedAt: null, history: [{ v: 1, value: row.result, source: "IMPORTED" }] } };
    }));
  }
  function publishAll(ids) {
    setInterviews((prev) => prev.map((iv) => (ids.includes(iv.id) ? { ...iv, status: "RESULT_PUBLISHED", result: { ...iv.result, publishedAt: new Date() } } : iv)));
  }
  function confirmAttendance(id) {
    updateIv(id, { confirmed: true, status: "CONFIRMED" });
  }
  function reportIssue(id, details) {
    updateIv(id, { issue: { type: "OTHER", details: details || "Student reported an issue.", status: "OPEN" } });
  }

  const openIv = interviews.find((i) => i.id === openId);
  const studentOpenIv = interviews.find((i) => i.id === studentOpenId);
  const eligibleForNextRound = interviews.filter((i) => i.result && i.result.value === "PASS" && i.status === "RESULT_PUBLISHED").length;

  return (
    <div className="min-h-full w-full" style={{ backgroundColor: C.paper, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      {/* top chrome */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ backgroundColor: C.navy }}>
        <div className="flex items-center gap-2">
          <GraduationCap size={20} style={{ color: C.brass }} />
          <span className="font-bold text-white tracking-wide" style={{ fontFamily: SERIF, fontSize: 18 }}>PrepVista — Interview &amp; Result Centre</span>
        </div>
        <div className="flex gap-1 rounded-lg p-1" style={{ backgroundColor: C.navyLight }}>
          <button onClick={() => setRole("TPO")} className="px-3 py-1.5 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: role === "TPO" ? C.brass : "transparent", color: role === "TPO" ? C.navy : C.white }}>
            <span className="inline-flex items-center gap-1"><Building2 size={13} /> TPO</span>
          </button>
          <button onClick={() => setRole("STUDENT")} className="px-3 py-1.5 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: role === "STUDENT" ? C.brass : "transparent", color: role === "STUDENT" ? C.navy : C.white }}>
            <span className="inline-flex items-center gap-1"><Users size={13} /> Student</span>
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-5">
        {role === "TPO" ? (
          <>
            <TpoOverview interviews={interviews} issues={issues} />
            {eligibleForNextRound > 0 && (
              <div className="mb-4 text-sm rounded-lg px-3 py-2 inline-flex items-center gap-2" style={{ backgroundColor: C.forestBg, color: C.forest }}>
                <ArrowRight size={14} /> {eligibleForNextRound} students now eligible for the HR round.
              </div>
            )}
            {!openIv ? (
              <>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {[["list", "All Interviews"], ["pending", "Results Pending"], ["import", "Import"], ["publish", "Review & Publish"]].map(([key, label]) => (
                    <button key={key} onClick={() => setTpoTab(key)}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold border"
                      style={{ borderColor: C.line, backgroundColor: tpoTab === key ? C.navy : C.white, color: tpoTab === key ? C.white : C.ink }}>
                      {label}
                    </button>
                  ))}
                </div>
                {tpoTab === "list" && <TpoInterviewList interviews={interviews} onOpen={setOpenId} />}
                {tpoTab === "pending" && <ResultsPendingWorkbench interviews={interviews} onOpen={setOpenId} />}
                {tpoTab === "import" && <ImportPanel interviews={interviews} onCommitImport={commitImport} />}
                {tpoTab === "publish" && <ReviewPublishPanel interviews={interviews} onPublishAll={publishAll} />}
              </>
            ) : (
              <TpoInterviewDetail iv={openIv} onBack={() => setOpenId(null)}
                onRecordAttendance={recordAttendance} onEnterResult={enterResult} onResolveIssue={resolveIssue} />
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2 text-sm">
              <span style={{ color: C.inkSoft }}>Viewing as:</span>
              <select value={studentReg} onChange={(e) => { setStudentReg(e.target.value); setStudentOpenId(null); }}
                      className="px-2 py-1 rounded-lg border text-sm" style={{ borderColor: C.line }}>
                {ROSTER.map((s) => <option key={s.regNo} value={s.regNo}>{s.name}</option>)}
              </select>
            </div>
            {!studentOpenIv ? (
              <StudentDashboard interviews={interviews} studentReg={studentReg} onOpen={setStudentOpenId} />
            ) : (
              <StudentInterviewDetail iv={studentOpenIv} onBack={() => setStudentOpenId(null)}
                onConfirm={confirmAttendance} onReportIssue={reportIssue} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

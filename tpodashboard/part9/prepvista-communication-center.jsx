import React, { useState, useMemo, Fragment } from "react";
import {
  Bell, Send, Users, CheckCircle2, XCircle, Clock, AlertTriangle,
  Inbox, MessageSquare, FileText, Sparkles, ChevronDown, Plus, X,
  RefreshCw, GraduationCap, Building2, Calendar, ArrowRight, Loader2,
  Eye, ShieldCheck, Mail, Smartphone, MessageCircle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const COLORS = {
  paper: "#EEEFE9",
  paperRaised: "#FFFFFF",
  ink: "#16233F",
  inkSoft: "#5B6472",
  rule: "#DBDDD2",
  critical: "#A8351F",
  high: "#A8721C",
  normal: "#2B5A7A",
  low: "#6E7364",
  positive: "#2F6B4F",
};

const FONT_IMPORT =
  "@import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');";

const SERIF = "'Source Serif 4', Georgia, serif";
const MONO = "'IBM Plex Mono', 'Courier New', monospace";

/* ------------------------------------------------------------------ */
/* Mock data                                                           */
/* ------------------------------------------------------------------ */
const NOW_MS = Date.now();
const hrs = (h) => new Date(NOW_MS + h * 3600 * 1000);

const DRIVES = [
  { id: "nexora", company: "Nexora Systems", role: "Software Engineer", package: "\u20B99.2 LPA", deadline: hrs(6) },
  { id: "bluepeak", company: "Bluepeak Analytics", role: "Data Analyst", package: "\u20B97.5 LPA", deadline: hrs(30) },
  { id: "orbital", company: "Orbital Robotics", role: "Firmware Engineer", package: "\u20B911.0 LPA", deadline: hrs(-72) },
];

const BRANCHES = ["CSE", "IT", "ECE", "MECH"];

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function makeStudents() {
  const names = [
    "Arun Kumar", "Meera Iyer", "Rahul Verma", "Sanya Kapoor", "Vikram Rao", "Divya Menon",
    "Karthik Subramanian", "Priya Nair", "Aditya Singh", "Neha Reddy", "Farhan Sheikh", "Ishita Bose",
    "Rohan Desai", "Ananya Pillai", "Suresh Babu", "Tanvi Joshi", "Manoj Pillai", "Lakshmi Narayan",
    "Yash Patel", "Ritika Sharma", "Devendra Yadav", "Pooja Chatterjee", "Nikhil Bhat", "Sneha Gupta",
  ];
  const branchCycle = [
    "CSE", "CSE", "CSE", "CSE", "CSE", "CSE", "CSE", "CSE", "CSE",
    "IT", "IT", "IT", "IT", "IT", "IT",
    "ECE", "ECE", "ECE", "ECE", "ECE", "ECE",
    "MECH", "MECH", "MECH",
  ];
  return names.map((name, i) => {
    const id = "s" + (i + 1);
    const branch = branchCycle[i] || "CSE";
    const eligible = {};
    const applied = {};
    DRIVES.forEach((d) => {
      const isEligible = d.id === "orbital" ? (branch === "ECE" || branch === "MECH" || i % 4 === 0) : true;
      eligible[d.id] = isEligible;
      applied[d.id] = isEligible && hashStr(id + d.id) % 100 < 55;
    });
    return { id, name, branch, batch: 2026, eligible, applied };
  });
}

const STUDENTS = makeStudents();
const byName = (n) => STUDENTS.find((s) => s.name === n);

["Arun Kumar", "Meera Iyer", "Nikhil Bhat", "Priya Nair"].forEach((n) => {
  const s = byName(n);
  s.eligible.orbital = true;
  s.applied.orbital = true;
});
byName("Arun Kumar").interview = { driveId: "orbital", date: hrs(18), status: "Scheduled" };
byName("Meera Iyer").interview = { driveId: "orbital", date: hrs(18), status: "Scheduled" };
byName("Nikhil Bhat").interview = { driveId: "orbital", date: hrs(18), status: "Scheduled" };
byName("Priya Nair").interview = { driveId: "orbital", date: hrs(-20), status: "Cleared" };
byName("Priya Nair").offer = { driveId: "orbital", deadlineToAccept: hrs(40) };
const FLAKY_IDS = new Set([byName("Rahul Verma").id]);

const ISSUE_CATEGORIES = [
  { id: "interview_info", label: "Interview information looks wrong", defaultPriority: "HIGH" },
  { id: "link_broken", label: "A link isn't working", defaultPriority: "URGENT" },
  { id: "application", label: "Problem with my application", defaultPriority: "NORMAL" },
  { id: "eligibility", label: "Question about eligibility", defaultPriority: "NORMAL" },
  { id: "offer", label: "Issue with an offer", defaultPriority: "HIGH" },
  { id: "joining", label: "Joining / onboarding issue", defaultPriority: "NORMAL" },
  { id: "technical", label: "Technical problem", defaultPriority: "NORMAL" },
  { id: "general", label: "General question", defaultPriority: "LOW" },
];

const TEMPLATES = [
  { id: "drive", label: "Drive announcement", subject: "{{company_name}} is now hiring", body: "Hi {{student_name}}, {{company_name}} is now open for {{role}}. Applications close {{deadline}}." },
  { id: "deadline", label: "Deadline reminder", subject: "{{company_name}} closes {{deadline}}", body: "Hi {{student_name}}, you're eligible for {{company_name}} but haven't applied yet. Applications close {{deadline}}." },
  { id: "interview", label: "Interview notification", subject: "Interview scheduled \u2014 {{company_name}}", body: "Hi {{student_name}}, your {{role}} interview at {{company_name}} is on {{interview_date}} at {{interview_time}}. Please join 15 minutes early." },
  { id: "result", label: "Result published", subject: "{{company_name}} result published", body: "Hi {{student_name}}, your interview result for {{company_name}} is now available on your dashboard." },
  { id: "offer", label: "Offer published", subject: "Offer from {{company_name}}", body: "Hi {{student_name}}, congratulations \u2014 an offer from {{company_name}} has been published to your account. Please review it and respond from your dashboard." },
  { id: "joining", label: "Joining confirmation", subject: "Confirm joining \u2014 {{company_name}}", body: "Hi {{student_name}}, please confirm your joining date for {{company_name}} by {{joining_date}}." },
  { id: "general", label: "General announcement", subject: "Placement office update", body: "Hi {{student_name}}, this is an update from the placement office." },
];

const TEMPLATE_TYPE = {
  drive: "DRIVE_NOTIFICATION", deadline: "DEADLINE_REMINDER", interview: "INTERVIEW_NOTIFICATION",
  result: "RESULT_NOTIFICATION", offer: "OFFER_NOTIFICATION", joining: "JOINING_NOTIFICATION", general: "ANNOUNCEMENT",
};

const KNOWN_VARIABLES = ["student_name", "company_name", "role", "drive_name", "deadline", "interview_date", "interview_time", "joining_date"];

const PRIORITY_META = {
  LOW: { label: "Low", color: COLORS.low, tier: "Informational" },
  NORMAL: { label: "Normal", color: COLORS.normal, tier: "Normal" },
  HIGH: { label: "High", color: COLORS.high, tier: "Important" },
  URGENT: { label: "Urgent", color: COLORS.critical, tier: "Critical" },
  CRITICAL: { label: "Critical", color: COLORS.critical, tier: "Critical" },
};

const TYPE_META = {
  ANNOUNCEMENT: { icon: Bell },
  DRIVE_NOTIFICATION: { icon: Building2 },
  DEADLINE_REMINDER: { icon: Clock },
  INTERVIEW_NOTIFICATION: { icon: Calendar },
  RESULT_NOTIFICATION: { icon: FileText },
  OFFER_NOTIFICATION: { icon: CheckCircle2 },
  JOINING_NOTIFICATION: { icon: GraduationCap },
  TRAINING_NOTIFICATION: { icon: Sparkles },
};

const STAGES = [
  { key: "queued", label: "Queued", icon: Clock },
  { key: "sent", label: "Sent", icon: Send },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
  { key: "opened", label: "Opened", icon: Eye },
  { key: "acknowledged", label: "Acknowledged", icon: ShieldCheck },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
function formatDateTime(d) {
  if (!d) return null;
  return d.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function formatTimeOnly(d) {
  if (!d) return null;
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}
function timeAgo(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return mins + "m ago";
  const hrsN = Math.round(mins / 60);
  if (hrsN < 24) return hrsN + "h ago";
  return Math.round(hrsN / 24) + "d ago";
}
function renderTemplate(text, ctx) {
  const t = text || "";
  const c = ctx || {};
  return t.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!KNOWN_VARIABLES.includes(key)) return "[unknown variable: " + key + "]";
    const val = c[key];
    return val ? String(val) : "[" + key + " unavailable]";
  });
}
function buildContext(student, drive) {
  const ctx = { student_name: student && student.name ? student.name.split(" ")[0] : null };
  if (drive) {
    ctx.company_name = drive.company;
    ctx.role = drive.role;
    ctx.drive_name = drive.company;
    ctx.deadline = formatDateTime(drive.deadline);
  }
  if (student && student.interview && (!drive || student.interview.driveId === drive.id)) {
    ctx.interview_date = formatDateTime(student.interview.date);
    ctx.interview_time = formatTimeOnly(student.interview.date);
  }
  return ctx;
}
function getUnknownVariables(text) {
  const found = [...(text || "").matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  return [...new Set(found.filter((v) => !KNOWN_VARIABLES.includes(v)))];
}
function branchBreakdown(students) {
  const out = {};
  BRANCHES.forEach((b) => (out[b] = 0));
  students.forEach((s) => (out[s.branch] = (out[s.branch] || 0) + 1));
  return out;
}
function nearestDeadlineFor(student) {
  if (student.offer) return null;
  const upcoming = DRIVES.filter((d) => student.eligible[d.id] && !student.applied[d.id] && d.deadline > new Date());
  if (!upcoming.length) return null;
  return upcoming.sort((a, b) => a.deadline - b.deadline)[0];
}
function useAudienceMatch(students, filters) {
  return useMemo(() => {
    const hasAnyFilter = filters.branches.length > 0 || !!filters.driveId;
    if (!hasAnyFilter) return [];
    return students.filter((s) => {
      if (filters.branches.length && !filters.branches.includes(s.branch)) return false;
      if (filters.driveId) {
        const isElig = s.eligible[filters.driveId];
        const hasApplied = s.applied[filters.driveId];
        if (filters.relationship.includes("eligible") && !isElig) return false;
        if (filters.relationship.includes("not_applied") && (!isElig || hasApplied)) return false;
        if (filters.relationship.includes("applied") && !hasApplied) return false;
        if (filters.relationship.includes("interview") && !(s.interview && s.interview.driveId === filters.driveId)) return false;
        if (filters.relationship.includes("offer") && !(s.offer && s.offer.driveId === filters.driveId)) return false;
      }
      return true;
    });
  }, [students, filters]);
}
async function draftWithAI(instruction, facts) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content:
            "You are drafting a short placement-office notification for students, on behalf of a college TPO (placement officer).\n" +
            "Use ONLY the facts in FACTS below. Never invent a company, role, deadline, date, or figure that is not present in FACTS \u2014 if something relevant is missing, write around it instead of guessing.\n" +
            "Match tone to PRIORITY: URGENT/CRITICAL = short, direct, no filler. LOW/NORMAL = clear, a little warmer.\n" +
            "Keep the subject under 60 characters and the body under 400 characters.\n\n" +
            "FACTS: " + JSON.stringify(facts) + "\n" +
            "TPO'S INSTRUCTION: " + instruction + "\n\n" +
            "Respond with ONLY minified JSON in exactly this shape, no markdown fences, no commentary: {\"subject\":\"...\",\"body\":\"...\"}",
        },
      ],
    }),
  });
  if (!res.ok) throw new Error("request_failed");
  const data = await res.json();
  const textBlock = (data.content || []).find((b) => b.type === "text");
  if (!textBlock) throw new Error("empty_response");
  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!parsed.subject || !parsed.body) throw new Error("bad_shape");
  return parsed;
}

/* ------------------------------------------------------------------ */
/* Shared UI                                                            */
/* ------------------------------------------------------------------ */
function Badge({ color, children }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color, backgroundColor: color + "1A", border: "1px solid " + color + "40" }}
    >
      {children}
    </span>
  );
}
function Card({ children, className, style }) {
  return (
    <div className={"rounded-xl border " + (className || "")} style={{ borderColor: COLORS.rule, backgroundColor: COLORS.paperRaised, ...(style || {}) }}>
      {children}
    </div>
  );
}
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ backgroundColor: "rgba(22,35,63,0.45)" }} onClick={onClose}>
      <div className="rounded-xl p-5 w-full max-w-md max-h-full overflow-y-auto" style={{ backgroundColor: COLORS.paperRaised }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
      style={{
        border: "1px solid " + (active ? COLORS.ink : COLORS.rule),
        backgroundColor: active ? COLORS.ink : "transparent",
        color: active ? COLORS.paperRaised : COLORS.inkSoft,
      }}
    >
      {children}
    </button>
  );
}
function FilterGroup({ label, children }) {
  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.inkSoft }}>{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
function EmptyState({ icon: Icon, title, body, tone }) {
  const color = tone === "positive" ? COLORS.positive : COLORS.inkSoft;
  return (
    <Card className="p-8 flex flex-col items-center text-center">
      <Icon size={22} style={{ color }} />
      <div className="font-medium mt-3" style={{ color: COLORS.ink }}>{title}</div>
      <div className="text-sm mt-1 max-w-sm" style={{ color: COLORS.inkSoft }}>{body}</div>
    </Card>
  );
}
function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: COLORS.inkSoft }}>
      <span className="inline-block rounded-full" style={{ width: 6, height: 6, backgroundColor: color }} />
      {label}
    </span>
  );
}
function StampTrail({ recipient, requiresAck }) {
  if (!recipient) return null;
  if (recipient.status === "failed") {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS.critical + "1A", border: "1.5px solid " + COLORS.critical }}>
          <XCircle size={14} style={{ color: COLORS.critical }} />
        </div>
        <span style={{ color: COLORS.critical, fontFamily: MONO, fontSize: 12 }}>FAILED \u2014 {recipient.failReason}</span>
      </div>
    );
  }
  const stages = requiresAck ? STAGES : STAGES.filter((s) => s.key !== "acknowledged");
  const reached = { queued: true, sent: true, delivered: !!recipient.deliveredAt, opened: !!recipient.openedAt, acknowledged: !!recipient.acknowledgedAt };
  return (
    <div className="flex items-center">
      {stages.map((s, i) => {
        const done = reached[s.key];
        const Icon = s.icon;
        return (
          <Fragment key={s.key}>
            {i > 0 && <div style={{ height: 1, width: 18, backgroundColor: done ? COLORS.positive : COLORS.rule }} />}
            <div className="flex flex-col items-center gap-1" style={{ minWidth: 44 }}>
              <div
                className="flex items-center justify-center w-7 h-7 rounded-full"
                style={{ backgroundColor: done ? COLORS.positive + "1A" : COLORS.paper, border: "1.5px solid " + (done ? COLORS.positive : COLORS.rule) }}
              >
                <Icon size={13} style={{ color: done ? COLORS.positive : COLORS.inkSoft }} />
              </div>
              <span className="hidden sm:block" style={{ color: done ? COLORS.ink : COLORS.inkSoft, fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {s.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
function DeliveryBar({ recipients, requiresAck }) {
  const values = Object.values(recipients);
  const total = values.length || 1;
  const failed = values.filter((r) => r.status === "failed").length;
  const delivered = values.filter((r) => r.status === "delivered").length;
  const opened = values.filter((r) => r.openedAt).length;
  const acknowledged = values.filter((r) => r.acknowledgedAt).length;
  const ackSeg = acknowledged;
  const openedOnlySeg = opened - acknowledged;
  const deliveredOnlySeg = delivered - opened;
  const segments = [
    { count: ackSeg, color: COLORS.positive },
    { count: openedOnlySeg, color: COLORS.normal },
    { count: deliveredOnlySeg, color: COLORS.low },
    { count: failed, color: COLORS.critical },
  ].filter((s) => s.count > 0);

  return (
    <div>
      <div className="flex w-full rounded-full overflow-hidden" style={{ backgroundColor: COLORS.rule, height: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ width: (s.count / total) * 100 + "%", backgroundColor: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <LegendDot color={COLORS.low} label={delivered + " delivered"} />
        <LegendDot color={COLORS.normal} label={opened + " opened"} />
        {requiresAck && <LegendDot color={COLORS.positive} label={acknowledged + " acknowledged"} />}
        {failed > 0 && <LegendDot color={COLORS.critical} label={failed + " failed"} />}
      </div>
    </div>
  );
}
function StatCard({ label, value, sub, color, icon: Icon, onClick }) {
  return (
    <button onClick={onClick} className="text-left p-4 rounded-xl w-full" style={{ backgroundColor: COLORS.paperRaised, border: "1px solid " + COLORS.rule }}>
      <Icon size={16} style={{ color }} />
      <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, color: COLORS.ink, lineHeight: 1, marginTop: 8 }}>{value}</div>
      <div className="text-xs mt-1.5" style={{ color: COLORS.ink }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{sub}</div>}
    </button>
  );
}
function TodayItem({ color, label, detail }) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded-full flex-shrink-0" style={{ width: 8, height: 8, backgroundColor: color }} />
      <div>
        <div className="text-sm font-medium" style={{ color: COLORS.paperRaised }}>{label}</div>
        <div className="text-xs" style={{ color: COLORS.paperRaised, opacity: 0.7 }}>{detail}</div>
      </div>
    </div>
  );
}
function TodayPanel({ student }) {
  const drive = student.interview ? DRIVES.find((d) => d.id === student.interview.driveId) : null;
  const upcomingInterview = student.interview && student.interview.date > new Date() ? student.interview : null;
  const deadlineDrive = nearestDeadlineFor(student);
  const pendingOffer = student.offer && student.offer.deadlineToAccept > new Date() ? student.offer : null;
  if (!upcomingInterview && !deadlineDrive && !pendingOffer) return null;
  return (
    <Card className="p-5" style={{ backgroundColor: COLORS.ink, borderColor: COLORS.ink }}>
      <div style={{ color: COLORS.paperRaised, opacity: 0.6, fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 12 }}>Today</div>
      <div className="space-y-3">
        {upcomingInterview && <TodayItem color={COLORS.critical} label={"Interview \u00B7 " + (drive ? drive.company : "")} detail={formatDateTime(upcomingInterview.date)} />}
        {deadlineDrive && <TodayItem color={COLORS.high} label={deadlineDrive.company + " application"} detail={"Closes " + formatDateTime(deadlineDrive.deadline)} />}
        {pendingOffer && <TodayItem color={COLORS.positive} label={"Offer \u00B7 " + ((DRIVES.find((d) => d.id === pendingOffer.driveId) || {}).company || "")} detail={"Respond by " + formatDateTime(pendingOffer.deadlineToAccept)} />}
      </div>
    </Card>
  );
}
function RoleToggle({ role, setRole }) {
  return (
    <div className="inline-flex rounded-lg p-1" style={{ backgroundColor: COLORS.rule + "80" }}>
      {[["tpo", "TPO desk"], ["student", "Student view"]].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setRole(id)}
          className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          style={{ backgroundColor: role === id ? COLORS.ink : "transparent", color: role === id ? COLORS.paperRaised : COLORS.inkSoft }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
function TPONav({ tab, setTab, openIssuesCount, failedCount }) {
  const items = [
    ["overview", "Overview", 0],
    ["compose", "Compose", 0],
    ["sent", "Sent", 0],
    ["failed", "Failed", failedCount],
    ["templates", "Templates", 0],
    ["issues", "Issues", openIssuesCount],
    ["analytics", "Analytics", 0],
  ];
  return (
    <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: "1px solid " + COLORS.rule }}>
      {items.map(([id, label, count]) => (
        <button
          key={id}
          onClick={() => setTab(id)}
          className="px-3 py-2.5 text-sm font-medium whitespace-nowrap flex items-center gap-1.5 flex-shrink-0"
          style={{ color: tab === id ? COLORS.ink : COLORS.inkSoft, borderBottom: "2px solid " + (tab === id ? COLORS.ink : "transparent") }}
        >
          {label}
          {count > 0 ? (
            <span className="rounded-full px-1.5" style={{ backgroundColor: COLORS.critical, color: COLORS.paperRaised, fontFamily: MONO, fontSize: 10 }}>{count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TPO tabs                                                             */
/* ------------------------------------------------------------------ */
function OverviewTab({ messages, issues, setTpoTab }) {
  const nearestDrive = DRIVES.filter((d) => d.deadline > new Date()).sort((a, b) => a.deadline - b.deadline)[0];
  const needsReminder = nearestDrive ? STUDENTS.filter((s) => !s.offer && s.eligible[nearestDrive.id] && !s.applied[nearestDrive.id]) : [];
  const pendingAck = messages.filter((m) => m.requiresAck).reduce((a, m) => a + Object.values(m.recipients).filter((r) => !r.acknowledgedAt && r.status === "delivered").length, 0);
  const openIssuesCount = issues.filter((i) => !["RESOLVED", "CLOSED"].includes(i.status)).length;
  const urgentIssuesCount = issues.filter((i) => i.priority === "URGENT" && !["RESOLVED", "CLOSED"].includes(i.status)).length;
  const failedCount = messages.reduce((a, m) => a + Object.values(m.recipients).filter((r) => r.status === "failed").length, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Bell} color={COLORS.high} value={needsReminder.length} label="need a drive reminder" sub={nearestDrive ? nearestDrive.company + " \u00B7 closes " + formatDateTime(nearestDrive.deadline) : "No drives closing soon"} onClick={() => setTpoTab("compose")} />
        <StatCard icon={ShieldCheck} color={COLORS.critical} value={pendingAck} label="acknowledgments pending" sub="Critical messages awaiting confirmation" onClick={() => setTpoTab("sent")} />
        <StatCard icon={MessageSquare} color={COLORS.normal} value={openIssuesCount} label="open student issues" sub={urgentIssuesCount + " urgent"} onClick={() => setTpoTab("issues")} />
        <StatCard icon={XCircle} color={COLORS.critical} value={failedCount} label="failed deliveries" sub="Retry from the Failed tab" onClick={() => setTpoTab("failed")} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-4 text-sm" style={{ color: COLORS.ink }}>Recent activity</h3>
        <div className="space-y-3">
          {messages.slice(0, 4).map((m) => {
            const vals = Object.values(m.recipients);
            const delivered = vals.filter((r) => r.status === "delivered").length;
            const failed = vals.filter((r) => r.status === "failed").length;
            return (
              <div key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: COLORS.ink }}>{m.subject}</div>
                  <div className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{timeAgo(m.sentAt)}</div>
                </div>
                <div className="flex-shrink-0" style={{ color: COLORS.inkSoft, fontFamily: MONO, fontSize: 12 }}>
                  {delivered} delivered{failed ? ", " + failed + " failed" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function AudienceBuilder({ filters, setFilters, matched }) {
  const breakdown = branchBreakdown(matched);
  const drive = DRIVES.find((d) => d.id === filters.driveId);
  const toggleBranch = (b) => setFilters((f) => ({ ...f, branches: f.branches.includes(b) ? f.branches.filter((x) => x !== b) : [...f.branches, b] }));
  const toggleRel = (r) => setFilters((f) => ({ ...f, relationship: f.relationship.includes(r) ? f.relationship.filter((x) => x !== r) : [...f.relationship, r] }));

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} style={{ color: COLORS.ink }} />
        <h3 className="font-semibold" style={{ color: COLORS.ink }}>Audience</h3>
      </div>

      <FilterGroup label="Branch">
        {BRANCHES.map((b) => (
          <Chip key={b} active={filters.branches.includes(b)} onClick={() => toggleBranch(b)}>{b}</Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Drive">
        <Chip active={!filters.driveId} onClick={() => setFilters((f) => ({ ...f, driveId: null, relationship: [] }))}>All students</Chip>
        {DRIVES.map((d) => (
          <Chip key={d.id} active={filters.driveId === d.id} onClick={() => setFilters((f) => ({ ...f, driveId: d.id }))}>{d.company}</Chip>
        ))}
      </FilterGroup>

      {drive && (
        <div className="mb-4 p-2.5 rounded-lg" style={{ backgroundColor: COLORS.paper, color: COLORS.inkSoft, fontFamily: MONO, fontSize: 12 }}>
          {drive.role} \u00B7 {drive.package} \u00B7 closes {formatDateTime(drive.deadline)}
        </div>
      )}

      {drive && (
        <FilterGroup label={"Relationship to " + drive.company}>
          <Chip active={filters.relationship.includes("eligible")} onClick={() => toggleRel("eligible")}>Eligible</Chip>
          <Chip active={filters.relationship.includes("not_applied")} onClick={() => toggleRel("not_applied")}>Not applied</Chip>
          <Chip active={filters.relationship.includes("applied")} onClick={() => toggleRel("applied")}>Applied</Chip>
          <Chip active={filters.relationship.includes("interview")} onClick={() => toggleRel("interview")}>Interview scheduled</Chip>
          <Chip active={filters.relationship.includes("offer")} onClick={() => toggleRel("offer")}>Offer pending</Chip>
        </FilterGroup>
      )}

      <div className="mt-5 pt-4 flex items-end justify-between flex-wrap gap-3" style={{ borderTop: "1px solid " + COLORS.rule }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: COLORS.ink, lineHeight: 1 }}>{matched.length}</div>
          <div className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>{matched.length ? "students selected" : "pick a branch or drive to build an audience"}</div>
        </div>
        <div className="flex gap-3">
          {BRANCHES.filter((b) => breakdown[b] > 0).map((b) => (
            <div key={b} className="text-center">
              <div style={{ color: COLORS.ink, fontFamily: MONO, fontSize: 13, fontWeight: 600 }}>{breakdown[b]}</div>
              <div className="text-xs" style={{ color: COLORS.inkSoft }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function Composer(props) {
  const {
    subject, setSubject, body, setBody, priority, setPriority, requiresAck, setRequiresAck,
    templateId, setTemplateId, aiInstruction, setAiInstruction, aiLoading, aiError, onDraftWithAI,
    unknownVars, matched, drive,
  } = props;
  const exampleStudent = matched[0];
  const ctx = exampleStudent ? buildContext(exampleStudent, drive) : {};

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-4" style={{ color: COLORS.ink }}>Message</h3>

      <div className="mb-4">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>Start from a template</label>
        <div className="flex flex-wrap gap-2 mt-2">
          {TEMPLATES.map((t) => (
            <Chip key={t.id} active={templateId === t.id} onClick={() => { setTemplateId(t.id); setSubject(t.subject); setBody(t.body); }}>{t.label}</Chip>
          ))}
        </div>
      </div>

      <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: COLORS.paper }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} style={{ color: COLORS.normal }} />
          <span className="text-sm font-medium" style={{ color: COLORS.ink }}>Draft with AI</span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 min-w-0 px-3 py-2 rounded-lg text-sm outline-none"
            style={{ border: "1px solid " + COLORS.rule, backgroundColor: COLORS.paperRaised }}
            placeholder={matched.length ? "e.g. a concise reminder for these students" : "Select an audience first"}
            value={aiInstruction}
            disabled={!matched.length}
            onChange={(e) => setAiInstruction(e.target.value)}
          />
          <button
            onClick={onDraftWithAI}
            disabled={!matched.length || aiLoading || !aiInstruction.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-40 flex-shrink-0"
            style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}
          >
            {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            Draft
          </button>
        </div>
        {aiError && <div className="text-xs mt-2" style={{ color: COLORS.critical }}>{aiError}</div>}
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>Subject</label>
        <input className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid " + COLORS.rule }} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div className="mb-4">
        <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.inkSoft }}>Body</label>
        <textarea rows={4} className="w-full mt-1 px-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid " + COLORS.rule }} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {KNOWN_VARIABLES.map((v) => (
            <button key={v} onClick={() => setBody((b) => b + "{{" + v + "}}")} className="px-2 py-1 rounded" style={{ backgroundColor: COLORS.paper, color: COLORS.inkSoft, border: "1px solid " + COLORS.rule, fontFamily: MONO, fontSize: 11 }}>
              {"{{" + v + "}}"}
            </button>
          ))}
        </div>
        {unknownVars.length > 0 && (
          <div className="text-xs mt-2" style={{ color: COLORS.critical }}>Unknown variable{unknownVars.length > 1 ? "s" : ""}: {unknownVars.join(", ")}</div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-6 mb-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-1.5" style={{ color: COLORS.inkSoft }}>Priority</label>
          <div className="flex gap-1.5">
            {Object.keys(PRIORITY_META).map((id) => {
              const meta = PRIORITY_META[id];
              return (
                <button key={id} onClick={() => setPriority(id)} title={meta.label} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ border: "2px solid " + (priority === id ? meta.color : COLORS.rule), backgroundColor: priority === id ? meta.color + "26" : "transparent" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: meta.color, display: "block" }} />
                </button>
              );
            })}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm" style={{ color: COLORS.ink }}>
          <input type="checkbox" checked={requiresAck} onChange={(e) => setRequiresAck(e.target.checked)} />
          Require acknowledgment
        </label>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: COLORS.inkSoft }}>Channel</label>
        <div className="flex flex-wrap gap-2">
          <Badge color={COLORS.positive}><Bell size={12} /> In-app \u2014 ready</Badge>
          <Badge color={COLORS.low}><Mail size={12} /> Email \u2014 not connected</Badge>
          <Badge color={COLORS.low}><Smartphone size={12} /> SMS \u2014 not connected</Badge>
          <Badge color={COLORS.low}><MessageCircle size={12} /> WhatsApp \u2014 not connected</Badge>
        </div>
      </div>

      {exampleStudent && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid " + COLORS.rule }}>
          <label className="text-xs font-semibold uppercase tracking-wide block mb-2" style={{ color: COLORS.inkSoft }}>Preview \u2014 {exampleStudent.name}</label>
          <div className="p-3 rounded-lg" style={{ backgroundColor: COLORS.paper }}>
            <div className="font-medium text-sm" style={{ color: COLORS.ink }}>{renderTemplate(subject, ctx) || "No subject"}</div>
            <div className="text-sm mt-1" style={{ color: COLORS.inkSoft }}>{renderTemplate(body, ctx) || "No message"}</div>
          </div>
        </div>
      )}
    </Card>
  );
}

function SendConfirmModal({ count, subject, onCancel, onConfirm }) {
  return (
    <Modal onClose={onCancel}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} style={{ color: COLORS.high }} />
        <h3 className="font-semibold" style={{ color: COLORS.ink }}>Confirm send</h3>
      </div>
      <p className="text-sm mb-4" style={{ color: COLORS.inkSoft }}>
        This message will reach <strong style={{ color: COLORS.ink }}>{count} student{count !== 1 ? "s" : ""}</strong>. Once sent, it can't be unsent \u2014 a correction would go out as a new message.
      </p>
      <div className="p-3 rounded-lg mb-4" style={{ backgroundColor: COLORS.paper }}>
        <div className="text-sm font-medium" style={{ color: COLORS.ink }}>{subject || "(no subject)"}</div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: "1px solid " + COLORS.rule, color: COLORS.ink }}>Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}>Send to {count} student{count !== 1 ? "s" : ""}</button>
      </div>
    </Modal>
  );
}

function SentMessageCard({ message }) {
  const [open, setOpen] = useState(false);
  const Icon = (TYPE_META[message.type] || {}).icon || Bell;
  return (
    <Card className="p-4">
      <button className="w-full flex items-start justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)}>
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: COLORS.paper }}>
            <Icon size={15} style={{ color: COLORS.ink }} />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm truncate" style={{ color: COLORS.ink }}>{message.subject}</div>
            <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: COLORS.inkSoft }}>
              <span>{Object.keys(message.recipients).length} recipients \u00B7 {timeAgo(message.sentAt)}</span>
              <Badge color={PRIORITY_META[message.priority].color}>{PRIORITY_META[message.priority].label}</Badge>
            </div>
          </div>
        </div>
        <ChevronDown size={16} style={{ color: COLORS.inkSoft, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>
      <div className="mt-3">
        <DeliveryBar recipients={message.recipients} requiresAck={message.requiresAck} />
      </div>
      {open && (
        <div className="mt-4 pt-4" style={{ borderTop: "1px solid " + COLORS.rule }}>
          <div className="text-sm mb-3" style={{ color: COLORS.inkSoft }}>{message.bodyTemplate}</div>
          <div className="space-y-2">
            {Object.entries(message.recipients).map(([sid, r]) => {
              const s = STUDENTS.find((x) => x.id === sid);
              return (
                <div key={sid} className="flex items-center justify-between gap-3 py-1.5 flex-wrap">
                  <span className="text-sm" style={{ color: COLORS.ink }}>{s ? s.name : sid}</span>
                  <StampTrail recipient={r} requiresAck={message.requiresAck} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
function SentTab({ messages }) {
  if (!messages.length) return <EmptyState icon={Send} title="Nothing sent yet" body="Build an audience and compose your first message to see delivery results here." />;
  return (
    <div className="space-y-3">
      {messages.map((m) => <SentMessageCard key={m.id} message={m} />)}
    </div>
  );
}

function FailedTab({ messages, onRetry }) {
  const failed = messages.flatMap((m) => Object.entries(m.recipients).filter(([, r]) => r.status === "failed").map(([sid, r]) => ({ message: m, studentId: sid, ...r })));
  if (!failed.length) return <EmptyState icon={CheckCircle2} title="No failed deliveries" body="Everything sent so far has arrived." tone="positive" />;
  return (
    <div className="space-y-2">
      {failed.map((f, i) => {
        const s = STUDENTS.find((x) => x.id === f.studentId);
        return (
          <Card key={i} className="p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-medium text-sm" style={{ color: COLORS.ink }}>{s ? s.name : f.studentId}</div>
              <div className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{f.message.subject}</div>
              <div className="text-xs mt-1" style={{ color: COLORS.critical, fontFamily: MONO }}>{f.failReason}</div>
            </div>
            <button onClick={() => onRetry(f.message.id, f.studentId)} className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5" style={{ border: "1px solid " + COLORS.rule, color: COLORS.ink }}>
              <RefreshCw size={12} /> Retry
            </button>
          </Card>
        );
      })}
    </div>
  );
}

function TemplatesTab({ onUse }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {TEMPLATES.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="font-medium text-sm" style={{ color: COLORS.ink }}>{t.label}</div>
          <div className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>{t.subject}</div>
          <button onClick={() => onUse(t.id)} className="mt-3 text-xs font-medium flex items-center gap-1" style={{ color: COLORS.normal }}>Use template <ArrowRight size={12} /></button>
        </Card>
      ))}
    </div>
  );
}

function IssueDetail({ issue, student, onRespond }) {
  const [response, setResponse] = useState(issue.response || "");
  const [status, setStatus] = useState(issue.status);
  return (
    <div className="mt-4 pt-4 space-y-3" style={{ borderTop: "1px solid " + COLORS.rule }}>
      <p className="text-sm" style={{ color: COLORS.ink }}>{issue.description}</p>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: COLORS.inkSoft }}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid " + COLORS.rule }}>
          {["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_STUDENT", "RESOLVED", "CLOSED"].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: COLORS.inkSoft }}>Response to {student ? student.name.split(" ")[0] : "student"}</label>
        <textarea rows={2} value={response} onChange={(e) => setResponse(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid " + COLORS.rule }} />
      </div>
      <button onClick={() => onRespond(issue.id, status, response)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}>Save</button>
    </div>
  );
}
function IssuesTab({ issues, onRespond }) {
  const [filter, setFilter] = useState("open");
  const [openIssueId, setOpenIssueId] = useState(null);
  const filtered = issues.filter((i) => {
    if (filter === "open") return !["RESOLVED", "CLOSED"].includes(i.status);
    if (filter === "high") return i.priority === "URGENT" || i.priority === "HIGH";
    if (filter === "waiting") return i.status === "WAITING_FOR_STUDENT";
    if (filter === "resolved") return i.status === "RESOLVED" || i.status === "CLOSED";
    return true;
  });
  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[["open", "Open"], ["high", "High priority"], ["waiting", "Waiting"], ["resolved", "Resolved"]].map(([k, l]) => (
          <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>{l}</Chip>
        ))}
      </div>
      {!filtered.length ? (
        <EmptyState icon={MessageSquare} title="Nothing here" body="No issues match this filter." />
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => {
            const s = STUDENTS.find((x) => x.id === i.studentId);
            const cat = ISSUE_CATEGORIES.find((c) => c.id === i.category);
            return (
              <Card key={i.id} className="p-4">
                <button className="w-full flex items-center justify-between text-left gap-3" onClick={() => setOpenIssueId((id) => (id === i.id ? null : i.id))}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge color={(PRIORITY_META[i.priority] || {}).color || COLORS.normal}>{i.priority}</Badge>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate" style={{ color: COLORS.ink }}>{s ? s.name : i.studentId} \u00B7 {cat ? cat.label : i.category}</div>
                      <div className="text-xs mt-0.5" style={{ color: COLORS.inkSoft }}>{timeAgo(i.createdAt)} \u00B7 {i.status.replace(/_/g, " ")}</div>
                    </div>
                  </div>
                  <ChevronDown size={16} style={{ color: COLORS.inkSoft, flexShrink: 0 }} />
                </button>
                {openIssueId === i.id && <IssueDetail issue={i} student={s} onRespond={onRespond} />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatBlock({ label, value }) {
  return (
    <Card className="p-4">
      <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: COLORS.ink }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>{label}</div>
    </Card>
  );
}
function AnalyticsTab({ messages, issues }) {
  const totalSent = messages.reduce((a, m) => a + Object.keys(m.recipients).length, 0);
  const totalDelivered = messages.reduce((a, m) => a + Object.values(m.recipients).filter((r) => r.status === "delivered").length, 0);
  const totalAck = messages.reduce((a, m) => a + Object.values(m.recipients).filter((r) => r.acknowledgedAt).length, 0);
  const chartData = messages.slice(0, 6).slice().reverse().map((m) => ({
    name: m.subject.length > 14 ? m.subject.slice(0, 14) + "\u2026" : m.subject,
    delivered: Object.values(m.recipients).filter((r) => r.status === "delivered").length,
    failed: Object.values(m.recipients).filter((r) => r.status === "failed").length,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBlock label="Sent" value={totalSent} />
        <StatBlock label="Delivered" value={(totalSent ? Math.round((totalDelivered / totalSent) * 100) : 0) + "%"} />
        <StatBlock label="Acknowledged" value={totalAck} />
        <StatBlock label="Open issues" value={issues.filter((i) => !["RESOLVED", "CLOSED"].includes(i.status)).length} />
      </div>
      <Card className="p-5">
        <h3 className="font-semibold mb-4 text-sm" style={{ color: COLORS.ink }}>Delivered vs. failed, recent messages</h3>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.rule} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: COLORS.inkSoft }} axisLine={{ stroke: COLORS.rule }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: COLORS.inkSoft }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid " + COLORS.rule, fontSize: 12 }} />
              <Bar dataKey="delivered" stackId="a" fill={COLORS.positive} />
              <Bar dataKey="failed" stackId="a" fill={COLORS.critical} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Student view                                                         */
/* ------------------------------------------------------------------ */
function NotificationCard({ message, student, onClick }) {
  const recipient = message.recipients[student.id];
  const unread = !recipient.openedAt;
  const meta = PRIORITY_META[message.priority];
  const drive = DRIVES.find((d) => d.id === message.driveId);
  const ctx = buildContext(student, drive);
  return (
    <button onClick={onClick} className="w-full text-left p-4 rounded-xl flex items-start gap-3" style={{ backgroundColor: COLORS.paperRaised, border: "1px solid " + (unread ? meta.color : COLORS.rule), borderLeftWidth: 4 }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {unread && <span className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, backgroundColor: meta.color }} />}
          <span className="font-medium text-sm truncate" style={{ color: COLORS.ink }}>{renderTemplate(message.subject, ctx)}</span>
        </div>
        <div className="text-sm mt-1 truncate" style={{ color: COLORS.inkSoft }}>{renderTemplate(message.bodyTemplate, ctx)}</div>
        <div className="mt-2" style={{ color: COLORS.inkSoft, fontFamily: MONO, fontSize: 11 }}>
          {timeAgo(message.sentAt)}{message.requiresAck && !recipient.acknowledgedAt ? " \u00B7 needs acknowledgment" : ""}
        </div>
      </div>
    </button>
  );
}
function MessageDetailModal({ message, student, onClose, onAcknowledge }) {
  const recipient = message.recipients[student.id];
  const drive = DRIVES.find((d) => d.id === message.driveId);
  const ctx = buildContext(student, drive);
  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between mb-3 gap-3">
        <Badge color={PRIORITY_META[message.priority].color}>{PRIORITY_META[message.priority].label}</Badge>
        <button onClick={onClose} aria-label="Close"><X size={16} style={{ color: COLORS.inkSoft }} /></button>
      </div>
      <h3 className="font-semibold mb-1" style={{ color: COLORS.ink, fontFamily: SERIF, fontSize: 20 }}>{renderTemplate(message.subject, ctx)}</h3>
      <p className="text-sm mb-4" style={{ color: COLORS.inkSoft }}>{renderTemplate(message.bodyTemplate, ctx)}</p>
      <div className="mb-4 overflow-x-auto">
        <StampTrail recipient={recipient} requiresAck={message.requiresAck} />
      </div>
      {message.requiresAck && !recipient.acknowledgedAt && (
        <button onClick={() => onAcknowledge(message.id, student.id)} className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}>Acknowledge</button>
      )}
      {recipient.acknowledgedAt && (
        <div className="flex items-center gap-1.5" style={{ color: COLORS.positive, fontFamily: MONO, fontSize: 12 }}><ShieldCheck size={13} /> Acknowledged {timeAgo(recipient.acknowledgedAt)}</div>
      )}
    </Modal>
  );
}
function MyIssues({ issues, onNew }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h3 className="font-semibold text-sm" style={{ color: COLORS.ink }}>Your requests</h3>
        <button onClick={onNew} className="text-xs font-medium flex items-center gap-1 flex-shrink-0" style={{ color: COLORS.normal }}><Plus size={13} /> Report an issue</button>
      </div>
      {!issues.length ? (
        <p className="text-sm" style={{ color: COLORS.inkSoft }}>Nothing reported. If something looks wrong \u2014 a broken link, a missing deadline \u2014 let the placement office know.</p>
      ) : (
        <div className="space-y-2">
          {issues.map((i) => (
            <div key={i.id} className="p-3 rounded-lg" style={{ backgroundColor: COLORS.paper }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium" style={{ color: COLORS.ink }}>{(ISSUE_CATEGORIES.find((c) => c.id === i.category) || {}).label}</span>
                <Badge color={i.status === "RESOLVED" || i.status === "CLOSED" ? COLORS.positive : COLORS.high}>{i.status.replace(/_/g, " ")}</Badge>
              </div>
              <p className="text-xs mt-1" style={{ color: COLORS.inkSoft }}>{i.description}</p>
              {i.response && <p className="text-xs mt-2 pt-2" style={{ color: COLORS.ink, borderTop: "1px solid " + COLORS.rule }}><strong>Placement office:</strong> {i.response}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function ReportIssueModal({ onClose, onSubmit }) {
  const [category, setCategory] = useState(ISSUE_CATEGORIES[0].id);
  const [description, setDescription] = useState("");
  return (
    <Modal onClose={onClose}>
      <h3 className="font-semibold mb-4" style={{ color: COLORS.ink }}>Report an issue</h3>
      <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: COLORS.inkSoft }}>What's wrong?</label>
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mb-3 outline-none" style={{ border: "1px solid " + COLORS.rule }}>
        {ISSUE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <label className="text-xs font-semibold uppercase tracking-wide block mb-1" style={{ color: COLORS.inkSoft }}>Details</label>
      <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mb-4 outline-none" style={{ border: "1px solid " + COLORS.rule }} placeholder="What happened?" />
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ border: "1px solid " + COLORS.rule, color: COLORS.ink }}>Cancel</button>
        <button disabled={!description.trim()} onClick={() => onSubmit(category, description)} className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}>Submit</button>
      </div>
    </Modal>
  );
}
function StudentView({ student, messages, issues, onOpen, onAcknowledge, onCreateIssue }) {
  const myMessages = messages.filter((m) => m.recipients[student.id] && m.recipients[student.id].status !== "failed");
  const myIssues = issues.filter((i) => i.studentId === student.id);
  const [detailId, setDetailId] = useState(null);
  const [showIssueForm, setShowIssueForm] = useState(false);

  const grouped = { Critical: [], Important: [], Normal: [], Informational: [] };
  myMessages.forEach((m) => grouped[PRIORITY_META[m.priority].tier].push(m));
  const tiers = ["Critical", "Important", "Normal", "Informational"];
  const detailMessage = detailId ? messages.find((m) => m.id === detailId) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <TodayPanel student={student} />

      {tiers.map((tier) => grouped[tier].length > 0 && (
        <div key={tier}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.inkSoft }}>{tier}</div>
          <div className="space-y-2">
            {grouped[tier].map((m) => (
              <NotificationCard key={m.id} message={m} student={student} onClick={() => { onOpen(m.id, student.id); setDetailId(m.id); }} />
            ))}
          </div>
        </div>
      ))}

      {!myMessages.length && <EmptyState icon={Inbox} title="No notifications yet" body="Placement updates addressed to you will show up here." />}

      <Card className="p-4">
        <MyIssues issues={myIssues} onNew={() => setShowIssueForm(true)} />
      </Card>

      {showIssueForm && (
        <ReportIssueModal
          onClose={() => setShowIssueForm(false)}
          onSubmit={(cat, desc) => { onCreateIssue(student.id, cat, desc); setShowIssueForm(false); }}
        />
      )}
      {detailMessage && (
        <MessageDetailModal message={detailMessage} student={student} onClose={() => setDetailId(null)} onAcknowledge={onAcknowledge} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seed data                                                            */
/* ------------------------------------------------------------------ */
function seedMessages() {
  const arun = byName("Arun Kumar");
  const meera = byName("Meera Iyer");
  const nikhil = byName("Nikhil Bhat");
  const priya = byName("Priya Nair");
  const rahul = byName("Rahul Verma");

  const nexoraEligible = STUDENTS.filter((s) => s.eligible.nexora);
  const msg1Recipients = {};
  nexoraEligible.forEach((s, idx) => {
    if (s.id === rahul.id) {
      msg1Recipients[s.id] = { status: "failed", failReason: "Student account inactive", deliveredAt: null, openedAt: null, acknowledgedAt: null };
      return;
    }
    const opened = idx % 3 !== 0;
    msg1Recipients[s.id] = { status: "delivered", deliveredAt: hrs(-47), openedAt: opened ? hrs(-40) : null, acknowledgedAt: null };
  });

  const msg2Recipients = {
    [arun.id]: { status: "delivered", deliveredAt: hrs(-3), openedAt: null, acknowledgedAt: null },
    [meera.id]: { status: "delivered", deliveredAt: hrs(-3), openedAt: hrs(-2), acknowledgedAt: null },
    [nikhil.id]: { status: "delivered", deliveredAt: hrs(-3), openedAt: hrs(-2), acknowledgedAt: hrs(-2) },
  };

  const msg3Recipients = {
    [priya.id]: { status: "delivered", deliveredAt: hrs(-20), openedAt: hrs(-19), acknowledgedAt: null },
  };

  return [
    { id: "m-2", type: "INTERVIEW_NOTIFICATION", subject: "Interview scheduled \u2014 Orbital Robotics", bodyTemplate: "Hi {{student_name}}, your {{role}} interview at {{company_name}} is on {{interview_date}} at {{interview_time}}. Please join 15 minutes early.", priority: "URGENT", requiresAck: true, driveId: "orbital", sentAt: hrs(-3), createdAt: hrs(-3), recipients: msg2Recipients },
    { id: "m-3", type: "OFFER_NOTIFICATION", subject: "Offer from Orbital Robotics", bodyTemplate: "Hi {{student_name}}, congratulations \u2014 an offer from {{company_name}} has been published to your account. Please review it and respond from your dashboard.", priority: "HIGH", requiresAck: false, driveId: "orbital", sentAt: hrs(-20), createdAt: hrs(-20), recipients: msg3Recipients },
    { id: "m-1", type: "DRIVE_NOTIFICATION", subject: "Nexora Systems is now hiring", bodyTemplate: "Hi {{student_name}}, {{company_name}} is now open for {{role}}. Applications close {{deadline}}.", priority: "NORMAL", requiresAck: false, driveId: "nexora", sentAt: hrs(-47), createdAt: hrs(-47), recipients: msg1Recipients },
  ];
}
function seedIssues() {
  const meera = byName("Meera Iyer");
  return [
    { id: "iss-1", studentId: meera.id, category: "link_broken", priority: "URGENT", status: "OPEN", description: "The interview link for Orbital Robotics isn't opening on my laptop.", createdAt: hrs(-2), response: null },
  ];
}

/* ------------------------------------------------------------------ */
/* App                                                                   */
/* ------------------------------------------------------------------ */
export default function PrepVistaCommunicationCenter() {
  const [role, setRole] = useState("tpo");
  const arunDefault = byName("Arun Kumar");
  const [currentStudentId, setCurrentStudentId] = useState(arunDefault.id);
  const [messages, setMessages] = useState(seedMessages);
  const [issues, setIssues] = useState(seedIssues);
  const [tpoTab, setTpoTab] = useState("overview");

  const [filters, setFilters] = useState({ branches: [], driveId: null, relationship: [] });
  const matched = useAudienceMatch(STUDENTS, filters);
  const [templateId, setTemplateId] = useState(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [requiresAck, setRequiresAck] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const unknownVars = useMemo(() => [...new Set([...getUnknownVariables(subject), ...getUnknownVariables(body)])], [subject, body]);
  const drive = DRIVES.find((d) => d.id === filters.driveId);

  async function handleDraftWithAI() {
    setAiLoading(true);
    setAiError(null);
    try {
      const facts = {
        audienceCount: matched.length,
        branchBreakdown: branchBreakdown(matched),
        drive: drive ? { company: drive.company, role: drive.role, package: drive.package, deadline: formatDateTime(drive.deadline) } : null,
        priority,
      };
      const draft = await draftWithAI(aiInstruction, facts);
      setSubject(draft.subject);
      setBody(draft.body);
      setTemplateId(null);
    } catch (e) {
      setAiError("Couldn't reach the drafting assistant \u2014 write it directly instead.");
    } finally {
      setAiLoading(false);
    }
  }

  function handleUseTemplate(id) {
    const t = TEMPLATES.find((x) => x.id === id);
    setTemplateId(id);
    setSubject(t.subject);
    setBody(t.body);
    setTpoTab("compose");
  }

  function resetComposer() {
    setSubject("");
    setBody("");
    setTemplateId(null);
    setRequiresAck(false);
    setPriority("NORMAL");
    setFilters({ branches: [], driveId: null, relationship: [] });
    setAiInstruction("");
  }

  function handleConfirmSend() {
    const recipients = {};
    matched.forEach((s) => {
      if (FLAKY_IDS.has(s.id)) recipients[s.id] = { status: "failed", failReason: "Student account inactive", deliveredAt: null, openedAt: null, acknowledgedAt: null };
      else recipients[s.id] = { status: "delivered", deliveredAt: new Date(), openedAt: null, acknowledgedAt: null };
    });
    const newMsg = {
      id: "m-" + Date.now(),
      type: templateId ? TEMPLATE_TYPE[templateId] : "ANNOUNCEMENT",
      subject, bodyTemplate: body, priority, requiresAck,
      driveId: filters.driveId,
      sentAt: new Date(), createdAt: new Date(),
      recipients,
    };
    setMessages((prev) => [newMsg, ...prev]);
    setShowConfirm(false);
    resetComposer();
    setTpoTab("sent");
  }

  function handleOpen(messageId, studentId) {
    setMessages((prev) => prev.map((m) => (m.id !== messageId ? m : { ...m, recipients: { ...m.recipients, [studentId]: { ...m.recipients[studentId], openedAt: m.recipients[studentId].openedAt || new Date() } } })));
  }
  function handleAcknowledge(messageId, studentId) {
    setMessages((prev) => prev.map((m) => (m.id !== messageId ? m : { ...m, recipients: { ...m.recipients, [studentId]: { ...m.recipients[studentId], acknowledgedAt: new Date() } } })));
  }
  function handleRetry(messageId, studentId) {
    setMessages((prev) => prev.map((m) => (m.id !== messageId ? m : { ...m, recipients: { ...m.recipients, [studentId]: { status: "delivered", deliveredAt: new Date(), openedAt: null, acknowledgedAt: null, failReason: null } } })));
  }
  function handleCreateIssue(studentId, category, description) {
    const cat = ISSUE_CATEGORIES.find((c) => c.id === category);
    setIssues((prev) => [{ id: "iss-" + Date.now(), studentId, category, priority: cat.defaultPriority, status: "OPEN", description, createdAt: new Date(), response: null }, ...prev]);
  }
  function handleRespond(issueId, status, response) {
    setIssues((prev) => prev.map((i) => (i.id !== issueId ? i : { ...i, status, response })));
  }

  const openIssuesCount = issues.filter((i) => !["RESOLVED", "CLOSED"].includes(i.status)).length;
  const failedCount = messages.reduce((a, m) => a + Object.values(m.recipients).filter((r) => r.status === "failed").length, 0);
  const currentStudent = STUDENTS.find((s) => s.id === currentStudentId);
  const featuredStudents = STUDENTS.filter((s) => ["Arun Kumar", "Meera Iyer", "Priya Nair", "Nikhil Bhat", "Rahul Verma"].includes(s.name));

  const canSend = matched.length > 0 && subject.trim() && body.trim() && unknownVars.length === 0;

  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: COLORS.paper, fontFamily: "'IBM Plex Sans', sans-serif" }}>
      <style>{"\n" + FONT_IMPORT + "\n* { box-sizing: border-box; }\ninput, textarea, select, button { font-family: inherit; }\n::selection { background: " + COLORS.ink + "; color: " + COLORS.paperRaised + "; }\ninput:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible {\n  outline: 2px solid " + COLORS.ink + ";\n  outline-offset: 2px;\n}\n@media (prefers-reduced-motion: reduce) {\n  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }\n}\n"}</style>

      <header className="px-4 sm:px-6 lg:px-8 pt-6 pb-4" style={{ borderBottom: "1px solid " + COLORS.rule }}>
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 22, letterSpacing: "0.02em", color: COLORS.ink }}>PREPVISTA</span>
              <span style={{ color: COLORS.inkSoft, fontFamily: MONO, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em" }}>Communication Center</span>
            </div>
            <div className="mt-1" style={{ color: COLORS.inkSoft, fontFamily: MONO, fontSize: 11 }}>Prototype \u00B7 24-student mock roster \u00B7 in-app channel only</div>
          </div>
          <div className="flex items-center gap-2">
            <RoleToggle role={role} setRole={setRole} />
            {role === "student" && (
              <select value={currentStudentId} onChange={(e) => setCurrentStudentId(e.target.value)} className="px-3 py-2 rounded-lg text-sm outline-none" style={{ border: "1px solid " + COLORS.rule, backgroundColor: COLORS.paperRaised }}>
                {featuredStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </header>

      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {role === "tpo" ? (
          <div className="max-w-5xl mx-auto">
            <TPONav tab={tpoTab} setTab={setTpoTab} openIssuesCount={openIssuesCount} failedCount={failedCount} />
            <div className="mt-5">
              {tpoTab === "overview" && <OverviewTab messages={messages} issues={issues} setTpoTab={setTpoTab} />}
              {tpoTab === "compose" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <AudienceBuilder filters={filters} setFilters={setFilters} matched={matched} />
                  <div>
                    <Composer
                      subject={subject} setSubject={setSubject} body={body} setBody={setBody}
                      priority={priority} setPriority={setPriority} requiresAck={requiresAck} setRequiresAck={setRequiresAck}
                      templateId={templateId} setTemplateId={setTemplateId}
                      aiInstruction={aiInstruction} setAiInstruction={setAiInstruction} aiLoading={aiLoading} aiError={aiError}
                      onDraftWithAI={handleDraftWithAI} unknownVars={unknownVars} matched={matched} drive={drive}
                    />
                    <button
                      disabled={!canSend}
                      onClick={() => setShowConfirm(true)}
                      className="w-full mt-3 py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
                      style={{ backgroundColor: COLORS.ink, color: COLORS.paperRaised }}
                    >
                      <Send size={15} /> Review & send{matched.length ? " to " + matched.length + " students" : ""}
                    </button>
                  </div>
                </div>
              )}
              {tpoTab === "sent" && <SentTab messages={messages} />}
              {tpoTab === "failed" && <FailedTab messages={messages} onRetry={handleRetry} />}
              {tpoTab === "templates" && <TemplatesTab onUse={handleUseTemplate} />}
              {tpoTab === "issues" && <IssuesTab issues={issues} onRespond={handleRespond} />}
              {tpoTab === "analytics" && <AnalyticsTab messages={messages} issues={issues} />}
            </div>
          </div>
        ) : (
          <StudentView student={currentStudent} messages={messages} issues={issues} onOpen={handleOpen} onAcknowledge={handleAcknowledge} onCreateIssue={handleCreateIssue} />
        )}
      </main>

      {showConfirm && <SendConfirmModal count={matched.length} subject={subject} onCancel={() => setShowConfirm(false)} onConfirm={handleConfirmSend} />}
    </div>
  );
}

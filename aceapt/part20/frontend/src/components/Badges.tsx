export function DifficultyBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    Easy: "bg-emerald-100 text-emerald-700",
    Medium: "bg-sky-100 text-sky-700",
    Hard: "bg-amber-100 text-amber-700",
    "Very Hard": "bg-rose-100 text-rose-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[level] || "bg-slate-100 text-slate-600"}`}>{level}</span>;
}

export function DecisionBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    Overinvestment: "bg-rose-100 text-rose-700",
    "Premature Guess": "bg-rose-100 text-rose-700",
    "Bad Skip": "bg-rose-100 text-rose-700",
    "Late Skip": "bg-amber-100 text-amber-700",
    "Not Reached": "bg-slate-100 text-slate-500",
    "Good Skip": "bg-sky-100 text-sky-700",
    "Good Attempt": "bg-slate-100 text-slate-600",
    "Efficient Solve": "bg-emerald-100 text-emerald-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[label] || "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

export function SelectionBadge({ quality }: { quality: string }) {
  const map: Record<string, string> = {
    Strong: "bg-emerald-100 text-emerald-700",
    Moderate: "bg-amber-100 text-amber-700",
    Weak: "bg-rose-100 text-rose-700",
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[quality] || "bg-slate-100 text-slate-600"}`}>{quality}</span>;
}

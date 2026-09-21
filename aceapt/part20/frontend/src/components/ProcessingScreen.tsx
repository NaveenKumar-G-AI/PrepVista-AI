import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

const STEPS = [
  "Scoring your responses",
  "Calculating time allocation",
  "Detecting behavioral patterns",
  "Building your performance report",
];

export default function ProcessingScreen() {
  const [doneCount, setDoneCount] = useState(0);

  useEffect(() => {
    const timers = STEPS.map((_, i) => setTimeout(() => setDoneCount((c) => Math.max(c, i + 1)), 450 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="mx-auto max-w-md py-16">
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <div className="mb-6 text-center font-semibold text-slate-900">Analyzing your simulation…</div>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = i < doneCount;
            const active = i === doneCount;
            return (
              <div key={step} className={`flex items-center gap-3 text-sm ${done ? "text-slate-700" : "text-slate-400"}`}>
                {done ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : active ? (
                  <Loader2 size={18} className="animate-spin text-indigo-500" />
                ) : (
                  <span className="inline-block h-[18px] w-[18px] rounded-full border-2 border-slate-200" />
                )}
                {step}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

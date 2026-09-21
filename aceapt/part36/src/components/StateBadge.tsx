import { TONE_CLASSES, type Tone } from "@/lib/presentation";

export default function StateBadge({ label, tone }: { label: string; tone: Tone }) {
  const cls = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs font-medium ${cls.bg} ${cls.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cls.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
}

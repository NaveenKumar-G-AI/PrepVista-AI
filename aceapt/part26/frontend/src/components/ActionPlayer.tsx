import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ContentItemPublic } from "../types";

interface SubmittedAnswer {
  itemId: string;
  selectedIndex: number;
  responseTimeSeconds: number;
}

interface ActionPlayerProps {
  items: ContentItemPublic[];
  onSubmit: (answers: SubmittedAnswer[]) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function ActionPlayer({ items, onSubmit, onCancel, submitting }: ActionPlayerProps) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<SubmittedAnswer[]>([]);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
    setSelected(null);
  }, [index]);

  const item = items[index];
  const isLast = index === items.length - 1;

  function handleNext() {
    if (selected === null) return;
    const responseTimeSeconds = Math.max(1, (Date.now() - startedAt.current) / 1000);
    const next = [...answers, { itemId: item.id, selectedIndex: selected, responseTimeSeconds }];

    if (isLast) {
      onSubmit(next);
    } else {
      setAnswers(next);
      setIndex((i) => i + 1);
    }
  }

  return (
    <div className="rounded-2xl border border-line-soft bg-ink-900/60 p-6">
      <div className="mb-5 flex items-center justify-between">
        <span className="font-mono text-xs text-faint">
          {index + 1} / {items.length}
        </span>
        <button type="button" onClick={onCancel} className="text-xs text-faint hover:text-muted">
          Cancel
        </button>
      </div>

      <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-signal transition-all duration-300"
          style={{ width: `${((index + (selected !== null ? 1 : 0)) / items.length) * 100}%` }}
        />
      </div>

      <p className="mt-6 font-display text-lg leading-snug text-paper">{item.prompt}</p>

      <div className="mt-5 space-y-2">
        {item.options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
              selected === i
                ? "border-signal bg-signal/10 text-paper"
                : "border-line-soft text-muted hover:border-line hover:text-paper"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={handleNext}
        disabled={selected === null || submitting}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-priority py-2.5 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {submitting && <Loader2 size={15} className="animate-spin" />}
        {isLast ? "Finish" : "Next"}
      </button>
    </div>
  );
}

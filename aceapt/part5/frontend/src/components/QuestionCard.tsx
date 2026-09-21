import { useState } from "react";
import { api } from "../api";
import { Hint, Question } from "../types";
import { ConfidenceSelector } from "./ConfidenceSelector";

interface Props {
  sessionId: string;
  question: Question;
  shownAt: number;
  onSubmit: (selectedOptionId: string, timeToStartMs: number, confidence: number | null) => void;
  submitting: boolean;
}

export function QuestionCard({ sessionId, question, shownAt, onSubmit, submitting }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [firstInteractionAt, setFirstInteractionAt] = useState<number | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [hintLoading, setHintLoading] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);

  function selectOption(id: string) {
    if (firstInteractionAt === null) setFirstInteractionAt(Date.now());
    setSelected(id);
  }

  async function requestHint() {
    if (hintLoading || hints.length >= 5) return;
    setHintLoading(true);
    try {
      const result = await api.getHint(sessionId);
      if (result.hint) setHints((prev) => [...prev, result.hint!]);
    } finally {
      setHintLoading(false);
    }
  }

  function handleSubmit() {
    if (!selected) return;
    const timeToStartMs = firstInteractionAt ? firstInteractionAt - shownAt : 0;
    onSubmit(selected, timeToStartMs, confidence);
  }

  const nextHintLevel = hints.length + 1;
  const hasMoreHints = nextHintLevel <= 5;

  return (
    <div className="space-y-5">
      <p className="font-body text-lg leading-relaxed text-ink-900 sm:text-xl">{question.prompt}</p>

      <div className="space-y-2">
        {question.options.map((opt, i) => {
          const isSelected = selected === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => selectOption(opt.id)}
              className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left font-body text-sm transition-colors ${
                isSelected ? "border-signal-cyan bg-signal-cyan/8 text-ink-900" : "border-ink-900/12 bg-white text-ink-900 hover:border-signal-cyan/40"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                  isSelected ? "border-signal-cyan bg-signal-cyan text-white" : "border-ink-900/25 text-ink-700/50"
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {opt.text}
            </button>
          );
        })}
      </div>

      {hints.length > 0 && (
        <div className="space-y-2 rounded-lg border border-signal-cyan/20 bg-signal-cyan/5 p-3">
          {hints.map((h) => (
            <div key={h.level} className="flex gap-2 text-sm">
              <span className="shrink-0 font-mono text-[10px] font-medium uppercase tracking-wider text-signal-cyanDark">L{h.level}</span>
              <span className="font-body text-ink-900">{h.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-900/8 pt-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={requestHint}
            disabled={hintLoading || !hasMoreHints}
            className="font-body text-sm font-medium text-signal-cyanDark underline decoration-signal-cyan/40 underline-offset-4 hover:decoration-signal-cyan disabled:cursor-not-allowed disabled:text-ink-700/30 disabled:no-underline"
          >
            {hasMoreHints ? `Hint (${nextHintLevel}/5)` : "No more hints"}
          </button>
          <ConfidenceSelector value={confidence} onChange={setConfidence} />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className="rounded-md bg-signal-cyan px-5 py-2 font-body text-sm font-semibold text-white transition-colors hover:bg-signal-cyanDark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Submit Answer"}
        </button>
      </div>
    </div>
  );
}

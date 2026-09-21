import type { SessionMode } from '../types';

const MODES: { value: SessionMode; label: string }[] = [
  { value: 'LEARNING', label: 'Learning' },
  { value: 'PRACTICE', label: 'Practice' },
  { value: 'TIMED_TRAINING', label: 'Timed training' },
  { value: 'FORMAL_ASSESSMENT', label: 'Formal assessment' },
];

export function ModeSwitcher({ mode, onChange }: { mode: SessionMode; onChange: (m: SessionMode) => void }) {
  return (
    <div className="inline-flex rounded-full border border-line bg-white p-1 text-sm">
      {MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => onChange(m.value)}
          className={`rounded-full px-3 py-1 transition-colors ${
            mode === m.value ? 'bg-ink text-paper' : 'text-inksoft hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function StageProgress({ currentIndex, total }: { currentIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-2" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={total} aria-label={`Stage ${currentIndex + 1} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full font-data text-[11px] ${
              i < currentIndex ? 'bg-signal-dim text-signal' : i === currentIndex ? 'bg-signal text-white' : 'bg-raised text-text-3'
            }`}
          >
            {i + 1}
          </div>
          {i < total - 1 && <div className={`h-px w-6 ${i < currentIndex ? 'bg-signal-dim' : 'bg-line'}`} />}
        </div>
      ))}
    </div>
  );
}

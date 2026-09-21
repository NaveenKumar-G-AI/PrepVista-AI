import { useEffect, useRef, useState } from 'react';

function format(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function Timer({
  remainingSeconds,
  totalSeconds,
  onExpire,
}: {
  remainingSeconds: number;
  totalSeconds: number;
  onExpire?: () => void;
}) {
  const [display, setDisplay] = useState(remainingSeconds);
  const firedExpiry = useRef(false);

  useEffect(() => {
    firedExpiry.current = false;
    setDisplay(remainingSeconds);
  }, [remainingSeconds]);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplay((prev) => {
        const next = Math.max(0, prev - 1);
        if (next === 0 && !firedExpiry.current) {
          firedExpiry.current = true;
          onExpire?.();
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onExpire]);

  const fraction = totalSeconds > 0 ? display / totalSeconds : 0;
  const urgency = fraction < 0.08 ? 'critical' : fraction < 0.2 ? 'warn' : 'calm';
  const color = urgency === 'critical' ? '#c8493c' : urgency === 'warn' ? '#e2a23d' : 'var(--ink-text)';

  return (
    <div
      className="data-num"
      role="timer"
      aria-live={urgency === 'critical' ? 'assertive' : 'off'}
      style={{
        fontSize: 'var(--text-xl)',
        fontWeight: 500,
        color,
        letterSpacing: '0.02em',
        transition: 'color 300ms var(--ease-standard)',
      }}
    >
      {format(display)}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';

export function Timer({ initialSeconds, onExpire }: { initialSeconds: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const expiredRef = useRef(false);
  const lastInitialRef = useRef(initialSeconds);

  // Resync whenever the server hands us a fresh value (e.g. after a stage
  // transition response comes back) rather than only trusting local ticks —
  // this keeps client drift bounded without re-fetching every second.
  useEffect(() => {
    if (initialSeconds !== lastInitialRef.current) {
      setSeconds(initialSeconds);
      lastInitialRef.current = initialSeconds;
      expiredRef.current = false;
    }
  }, [initialSeconds]);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const low = seconds <= 60;
  return (
    <span className={`font-data text-lg tabular-nums ${low ? 'text-critical' : 'text-text-1'}`} aria-live="polite" aria-atomic="true">
      {formatClock(seconds)}
    </span>
  );
}

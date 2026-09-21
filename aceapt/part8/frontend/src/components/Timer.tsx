import { useEffect, useState } from "react";

/** Count-up stopwatch, not a countdown - verification measures how long
 *  something genuinely took, it doesn't threaten the student with a clock
 *  running out (spec section 57: calm, not punitive). Turns from ink to
 *  caution once past the question's expected time, as a quiet signal
 *  rather than an alarm. */
export function Timer({ expectedSeconds, onTick }: { expectedSeconds: number; onTick?: (seconds: number) => void }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const interval = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        onTick?.(next);
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expectedSeconds]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const overExpected = seconds > expectedSeconds;

  return (
    <span className={`font-mono tabular text-sm ${overExpected ? "text-caution" : "text-ink-soft"}`}>
      {mins}:{secs.toString().padStart(2, "0")}
    </span>
  );
}

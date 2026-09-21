export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Days between the server's actual current time and a target ISO date. Never fabricated —
 *  always derived from a real Date object at call time (spec section 9). */
export function daysUntil(targetIsoDate: string, now: Date = new Date()): number {
  const target = new Date(targetIsoDate + "T00:00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

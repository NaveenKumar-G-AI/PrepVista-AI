/** Monday-start ISO date (YYYY-MM-DD) for the week containing `date`. */
export function weekStartFor(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function currentWeekStart(): string {
  return weekStartFor(new Date());
}

export function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export function daysUntil(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatShortDate(dateIso: string): string {
  return new Date(dateIso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

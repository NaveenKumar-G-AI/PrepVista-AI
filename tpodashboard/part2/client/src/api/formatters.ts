export function formatDueDate(iso: string | null): { text: string; urgent: boolean; overdue: boolean } {
  if (!iso) return { text: "—", urgent: false, overdue: false };
  const due = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday.getTime() + 86_400_000);
  const startOfDayAfter = new Date(startOfToday.getTime() + 2 * 86_400_000);

  const time = due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (due < startOfToday) {
    const days = Math.floor((startOfToday.getTime() - due.getTime()) / 86_400_000);
    return { text: `Overdue · ${days}d`, urgent: true, overdue: true };
  }
  if (due < startOfTomorrow) return { text: `Today · ${time}`, urgent: true, overdue: false };
  if (due < startOfDayAfter) return { text: `Tomorrow · ${time}`, urgent: false, overdue: false };
  return { text: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }), urgent: false, overdue: false };
}

export function formatRelativeDays(days: number | null): string {
  if (days === null) return "No contact yet";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

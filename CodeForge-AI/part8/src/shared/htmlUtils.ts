/**
 * Every dynamic string that lands in rendered HTML goes through
 * escapeHtml() first. Report and replay content includes student-authored
 * text (clarification questions, restatements, follow-up answers), and
 * this output can be viewed by TPOs — unescaped interpolation would be a
 * stored XSS vector, not a cosmetic bug.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function section(title: string, bodyHtml: string): string {
  return `<section class="cf-report-section">
  <h2>${escapeHtml(title)}</h2>
  ${bodyHtml}
</section>`;
}

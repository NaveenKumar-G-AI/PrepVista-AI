/** Capture is evidence: keep the student's words and numbers intact.
 * Any suggested technical-term repair belongs in a separate, auditable layer.
 */
export function normalizeCapturedAnswer(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// Tab-local recovery only. Never reads or imports anonymous CodeForge storage.
export const CODING_DRAFT_PREFIX = 'pv_coding_draft_v1:';
export interface CodingDraft { code: string; explanation: string; assisted: boolean }
export function draftKey(profileId: string, challengeId: string) {
  return `${CODING_DRAFT_PREFIX}${encodeURIComponent(profileId)}:${encodeURIComponent(challengeId)}`;
}
export function decodeDraft(raw: string | null): CodingDraft | null {
  if (!raw || raw.length > 150000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.version !== 1 || typeof value.code !== 'string' || value.code.length > 20000 ||
        typeof value.explanation !== 'string' || value.explanation.length > 3000 ||
        typeof value.assisted !== 'boolean') return null;
    return { code: value.code, explanation: value.explanation, assisted: value.assisted };
  } catch { return null; }
}

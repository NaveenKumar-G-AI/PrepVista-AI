import type { NoveltyPort } from './types.js';

/**
 * Feature 49 — Anti-Memorization / novelty adapter.
 *
 * TODO(integration): in the real system, novelty and exposure count come
 * from Feature 49's own tracking, not from a flag stored directly on the
 * attempt. This reference implementation stores is_novel/exposure_number
 * directly on the attempt row (see db/reference schema) as a stand-in, so
 * this adapter is close to a pass-through — but it still enforces one
 * invariant that's cheap to get wrong at the call site: exposure_number > 1
 * can never be reported as novel, regardless of what the raw flag says,
 * because "the student has seen this before" is definitionally not novel
 * (§43-45).
 */
export class PassthroughNoveltyAdapter implements NoveltyPort {
  classifyExposure(attempt: { isNovelRaw: boolean; exposureNumberRaw: number }): {
    isNovel: boolean;
    exposureNumber: number;
  } {
    const exposureNumber = Math.max(1, Math.floor(attempt.exposureNumberRaw));
    const isNovel = exposureNumber <= 1 && attempt.isNovelRaw;
    return { isNovel, exposureNumber };
  }
}

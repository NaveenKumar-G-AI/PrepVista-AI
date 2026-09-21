import type { ReviewSession, ReviewFinding, ReviewMessage, ReviewEvent } from '../domain/types';

/**
 * In-memory store so this service runs standalone for demonstration and
 * local development. In production, replace this module with a Postgres
 * client against db/migrations/001_init.sql — the shape of these methods
 * maps directly onto that schema (code_reviews, review_findings,
 * review_messages, review_events), so routes.ts shouldn't need to change.
 *
 * Ownership is enforced here at the app layer as defense in depth; the SQL
 * migration enforces the same boundary again via RLS at the database layer.
 */

interface StoredReview {
  review: ReviewSession;
  ownerId: string;
}

const reviews = new Map<string, StoredReview>();
const messages = new Map<string, ReviewMessage[]>(); // keyed by findingId
const events: ReviewEvent[] = [];

export const store = {
  saveReview(review: ReviewSession, ownerId: string): void {
    reviews.set(review.id, { review, ownerId });
  },

  getReview(id: string, requesterId: string): ReviewSession | null {
    const rec = reviews.get(id);
    if (!rec) return null;
    if (rec.ownerId !== requesterId) return null; // cross-user access denied, not "not found" leaked as a 404 vs 403 distinction
    return rec.review;
  },

  updateFinding(reviewId: string, requesterId: string, finding: ReviewFinding): boolean {
    const rec = reviews.get(reviewId);
    if (!rec || rec.ownerId !== requesterId) return false;
    const idx = rec.review.findings.findIndex((f) => f.id === finding.id);
    if (idx === -1) return false;
    rec.review.findings[idx] = finding;
    return true;
  },

  addMessage(findingId: string, message: ReviewMessage): void {
    const list = messages.get(findingId) ?? [];
    list.push(message);
    messages.set(findingId, list);
  },

  getMessages(findingId: string): ReviewMessage[] {
    return messages.get(findingId) ?? [];
  },

  addEvent(event: ReviewEvent): void {
    events.push(event);
  },

  getEvents(reviewId: string): ReviewEvent[] {
    return events.filter((e) => e.reviewId === reviewId);
  },
};

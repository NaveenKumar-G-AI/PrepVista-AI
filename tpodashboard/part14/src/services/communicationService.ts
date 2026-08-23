import type { ActionResultDetail } from "../types/action.types.js";

export interface Recipient {
  id: string;
  name: string;
}

/**
 * Stands in for Part 9's real CommunicationService/provider integration.
 * Part 14 never sends a message itself — every communication action routes
 * through this single choke point (spec section 17: "Never bypass Part 9"),
 * which is where real provider idempotency, retries, and delivery receipts
 * would live.
 */
class CommunicationService {
  /** Exposed for tests to assert the underlying provider was called at most once per idempotency key. */
  public callLog: string[] = [];
  private sentKeys = new Set<string>();

  async sendBulk(
    recipients: Recipient[],
    message: string,
    channel: string,
    idempotencyKey: string
  ): Promise<ActionResultDetail> {
    this.callLog.push(idempotencyKey);

    // Defense in depth: even if something upstream called us twice with the
    // same key, the provider-level idempotency guard here returns the same
    // outcome rather than sending twice.
    if (this.sentKeys.has(idempotencyKey)) {
      return { requested: recipients.length, succeeded: recipients.length, failed: 0, skipped: recipients.length, errors: [] };
    }
    this.sentKeys.add(idempotencyKey);

    const errors: ActionResultDetail["errors"] = [];
    let succeeded = 0;
    recipients.forEach((r, i) => {
      // Deterministic simulated delivery failures for realism in bulk sends.
      const simulatedFailure = recipients.length > 10 && (i === 3 || i === 47);
      if (simulatedFailure) {
        errors.push({ target: r.id, reason: "delivery_failed: device_unreachable" });
      } else {
        succeeded++;
      }
    });

    return { requested: recipients.length, succeeded, failed: errors.length, skipped: 0, errors };
  }
}

export const communicationService = new CommunicationService();

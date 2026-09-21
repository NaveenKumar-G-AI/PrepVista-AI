import crypto from "node:crypto";
import type { StructuredSignal } from "../../types/index.js";

export interface OutboundSignal {
  targetFeature: string;
  signal: StructuredSignal;
}

export interface FeatureAdapter {
  deliver(payload: OutboundSignal): Promise<void>;
}

/**
 * Default adapter when no webhook URL is configured for a target feature.
 * Feature 8 has no way to know Feature 3/4/6/7's real endpoints in this
 * standalone build, so signals land durably in signal_outbox and are logged
 * - nothing is lost, nothing pretends to have been delivered to a service
 * that doesn't exist here. Swap in WebhookFeatureAdapter (or a real
 * in-process call) once the target feature exists.
 */
export class LoggingFeatureAdapter implements FeatureAdapter {
  async deliver(payload: OutboundSignal): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[signal -> ${payload.targetFeature}] ${payload.signal.signal} (severity=${payload.signal.severity})`, JSON.stringify(payload.signal.evidence));
  }
}

/** HMAC-signed webhook delivery, used once a real Feature 3/4/6/7 endpoint exists. */
export class WebhookFeatureAdapter implements FeatureAdapter {
  constructor(private readonly url: string, private readonly secret: string | undefined) {}

  async deliver(payload: OutboundSignal): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.secret) {
      headers["X-ACEAPT-Signature"] = crypto.createHmac("sha256", this.secret).update(body).digest("hex");
    }
    const res = await fetch(this.url, { method: "POST", headers, body });
    if (!res.ok) {
      throw new Error(`Webhook delivery to ${this.url} failed: ${res.status} ${res.statusText}`);
    }
  }
}

const ENV_BY_FEATURE: Record<string, string> = {
  FEATURE_3: "FEATURE3_WEBHOOK_URL",
  FEATURE_4: "FEATURE4_WEBHOOK_URL",
  FEATURE_6: "FEATURE6_WEBHOOK_URL",
  FEATURE_7: "FEATURE7_WEBHOOK_URL",
};

export function getAdapterFor(targetFeature: string): FeatureAdapter {
  const envVar = ENV_BY_FEATURE[targetFeature];
  const url = envVar ? process.env[envVar] : undefined;
  if (url) {
    return new WebhookFeatureAdapter(url, process.env.INTEGRATION_WEBHOOK_SECRET);
  }
  return new LoggingFeatureAdapter();
}

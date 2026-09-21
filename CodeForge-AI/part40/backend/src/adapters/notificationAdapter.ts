import { env } from "../config/env";
import { baseLogger } from "../lib/logger";
import type { AlertSeverity } from "../types/events";

/**
 * SECURITY EVENT NOTIFICATIONS / ALERT ESCALATION
 * -----------------------------------------------------------------------
 * "Use existing notification infrastructure where available." No
 * repository was available to inspect in this environment, so this is an
 * interface + a safe default implementation, not a real email/SMS
 * integration — wire `NotificationAdapter` to CodeForge's actual
 * notification system (or a real ESP client) in the host repo.
 *
 * Hard rule this adapter exists partly to enforce: never notify normal
 * students about internal platform incidents. Only
 * notifyOperators()-shaped calls exist here; there is deliberately no
 * "notify all users" method in this module.
 */

export interface OperatorNotification {
  severity: AlertSeverity;
  title: string;
  description: string;
  organizationId: string | null;
  alertId?: string;
  incidentId?: string;
}

export interface NotificationAdapter {
  notifyOperators(notification: OperatorNotification): Promise<void>;
}

/**
 * Default: logs at a level matching severity so it's visible in
 * operational logs/whatever log pipeline CodeForge already ships to, and
 * is a safe no-op otherwise. Never claims to have sent an email it didn't
 * actually send — ALERT_EMAIL_PROVIDER_API_KEY is intentionally blank in
 * .env.example, so this is what runs until a real key is configured.
 */
class ConsoleNotificationAdapter implements NotificationAdapter {
  async notifyOperators(notification: OperatorNotification): Promise<void> {
    const configured = Boolean(env.ALERT_EMAIL_PROVIDER_API_KEY && env.ALERT_EMAIL_FROM);
    const level = notification.severity === "CRITICAL" || notification.severity === "HIGH" ? "error" : "warn";
    baseLogger[level](
      { notification, emailDeliveryConfigured: configured },
      configured
        ? "operator_notification (email adapter not implemented in this module — wire a real ESP client)"
        : "operator_notification (no email provider configured — dashboard/log only)"
    );
  }
}

export const notificationAdapter: NotificationAdapter = new ConsoleNotificationAdapter();

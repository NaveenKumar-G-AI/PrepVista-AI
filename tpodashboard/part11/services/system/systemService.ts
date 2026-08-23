import { db } from '../../src/lib/db';
import { insertDevOutboxMessage, listDevOutboxMessages } from '../../db/repositories/devOutboxRepo';

/**
 * Real checks only. If a dependency isn't wired up, this says so plainly —
 * it never reports "healthy" or "connected" for something that was never
 * actually configured (spec sections 39-40).
 */
export function getSystemHealth() {
  const start = Date.now();
  let databaseStatus: 'HEALTHY' | 'UNHEALTHY' = 'HEALTHY';
  let latencyMs: number | null = null;
  try {
    db.prepare('SELECT 1').get();
    latencyMs = Date.now() - start;
  } catch {
    databaseStatus = 'UNHEALTHY';
  }

  return {
    database: { status: databaseStatus, latencyMs },
    queue: { status: 'NOT_CONFIGURED', note: 'No queue provider is connected in this environment.' },
    documentStorage: { status: 'NOT_CONFIGURED', note: 'No document storage provider is connected in this environment.' },
    backups: { status: 'NOT_CONFIGURED', note: 'Backup monitoring not configured.' },
    checkedAt: new Date().toISOString(),
  };
}

export function getIntegrationStatus() {
  const configured = (envVar: string) => Boolean(process.env[envVar] && process.env[envVar]!.length > 0);
  return [
    { key: 'email', label: 'Email provider', status: configured('SMTP_HOST') ? 'CONNECTED' : 'NOT_CONFIGURED' },
    { key: 'sms', label: 'SMS provider', status: configured('SMS_PROVIDER_KEY') ? 'CONNECTED' : 'NOT_CONFIGURED' },
    { key: 'whatsapp', label: 'WhatsApp provider', status: configured('WHATSAPP_PROVIDER_KEY') ? 'CONNECTED' : 'NOT_CONFIGURED' },
    { key: 'documentStorage', label: 'Document storage', status: configured('DOCUMENT_STORAGE_URL') ? 'CONNECTED' : 'NOT_CONFIGURED' },
    { key: 'ai', label: 'AI provider', status: configured('ANTHROPIC_API_KEY') ? 'CONNECTED' : 'NOT_CONFIGURED' },
  ];
}

/**
 * Stand-in for a real email/SMS provider. Only active outside production, and
 * even then it stores what WOULD have been sent — it never claims delivery
 * happened, because it didn't (spec section 17: "do not fake delivery").
 */
export function pushDevOutbox(to: string, subject: string, body: string): void {
  if (process.env.NODE_ENV === 'production') return;
  insertDevOutboxMessage(to, subject, body);
}

export function readDevOutbox() {
  if (process.env.NODE_ENV === 'production') return [];
  return listDevOutboxMessages();
}

/**
 * Event Delivery System
 * Handles reliable webhook delivery with retries, dead-letter queue, and idempotency
 */
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { getActiveCredential } from './services';
import { EventStatus, ErrorCategory, ErrorSeverity } from '@prepvista/shared';

interface DeliveryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: DeliveryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  timeoutMs: 30000,
};

interface DeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  error?: string;
  errorCategory?: ErrorCategory;
  durationMs: number;
}

export class EventDeliveryService {
  private config: DeliveryConfig;

  constructor(config: Partial<DeliveryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Delivers a single event with retry logic
   */
  async deliverEvent(eventId: string): Promise<DeliveryResult> {
    const event = await prisma.integrationEvent.findUnique({
      where: { eventId },
      include: { integration: true },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    if (event.status === 'DELIVERED' || event.status === 'CANCELLED') {
      logger.info({ eventId }, 'Event already delivered or cancelled, skipping');
      return { success: true, durationMs: 0 };
    }

    if (event.status === 'DEAD_LETTER') {
      throw new Error('Event is in dead letter queue');
    }

    // Update status to delivering
    await prisma.integrationEvent.update({
      where: { eventId },
      data: { status: 'DELIVERING', lastDeliveryAt: new Date() },
    });

    const webhookUrl = (event.integration.config as any).webhookUrl;
    if (!webhookUrl) {
      const result = await this.handleDeliveryFailure(event, 'Webhook URL not configured', 'VALIDATION', 0);
      return result;
    }

    const webhookSecret = await getActiveCredential(event.integrationId, 'WEBHOOK_SECRET');

    const payload = event.payload;
    const headers = this.buildHeaders(event, webhookSecret);

    let lastResult: DeliveryResult;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        const response = await this.executeDelivery(webhookUrl, payload, headers, this.config.timeoutMs);
        const durationMs = Date.now() - startTime;

        if (response.success) {
          await this.handleDeliverySuccess(event, response, durationMs, attempt + 1);
          return { ...response, durationMs };
        }

        lastResult = { ...response, durationMs };

        // Check if we should retry
        if (attempt < this.config.maxRetries && this.isRetryable(response.statusCode, response.errorCategory)) {
          const delay = this.calculateBackoff(attempt);
          logger.warn({ eventId, attempt: attempt + 1, delay, statusCode: response.statusCode }, 'Delivery failed, scheduling retry');
          await this.scheduleRetry(event, delay);
          await this.sleep(delay);
          continue;
        }

        // Non-retryable or max retries reached
        await this.handleDeliveryFailure(event, response.error || 'Delivery failed', response.errorCategory || 'UNKNOWN', durationMs);
        return lastResult;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const errorCategory = this.categorizeError(error);

        logger.error({ eventId, attempt: attempt + 1, error: errorMessage }, 'Delivery attempt failed');

        if (attempt < this.config.maxRetries && this.isRetryableError(error)) {
          const delay = this.calculateBackoff(attempt);
          await this.scheduleRetry(event, delay);
          await this.sleep(delay);
          continue;
        }

        await this.handleDeliveryFailure(event, errorMessage, errorCategory, durationMs);
        return {
          success: false,
          error: errorMessage,
          errorCategory,
          durationMs,
        };
      }
    }

    // Should not reach here, but just in case
    return { success: false, error: 'Max retries exhausted', errorCategory: 'UNKNOWN', durationMs: 0 };
  }

  private async executeDelivery(
    url: string,
    payload: any,
    headers: Record<string, string>,
    timeoutMs: number
  ): Promise<DeliveryResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();

      const success = response.status >= 200 && response.status < 300;

      let errorCategory: ErrorCategory | undefined;
      if (!success) {
        if (response.status === 401 || response.status === 403) errorCategory = 'AUTHORIZATION';
        else if (response.status === 429) errorCategory = 'RATE_LIMIT';
        else if (response.status >= 500) errorCategory = 'NETWORK';
        else errorCategory = 'VALIDATION';
      }

      return {
        success,
        statusCode: response.status,
        responseBody: responseBody.slice(0, 10000),
        error: success ? undefined : `HTTP ${response.status}`,
        errorCategory,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout',
          errorCategory: 'TIMEOUT',
        };
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        errorCategory: 'NETWORK',
      };
    }
  }

  private buildHeaders(event: any, webhookSecret: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'X-Event-ID': event.eventId,
      'X-Event-Type': event.eventType,
      'X-Schema-Version': event.schemaVersion,
      'X-Organization-Ref': event.organizationRef,
      'X-Timestamp': event.occurredAt.toISOString(),
      'X-Idempotency-Key': event.idempotencyKey,
    };

    if (event.externalStudentRef) {
      headers['X-External-Student-Ref'] = event.externalStudentRef;
    }

    if (webhookSecret) {
      // HMAC signature for webhook verification
      const crypto = await import('crypto');
      const signature = crypto.createHmac('sha256', webhookSecret)
        .update(JSON.stringify(event.payload))
        .digest('hex');
      headers['X-Signature'] = `sha256=${signature}`;
    }

    return headers;
  }

  private isRetryable(statusCode: number | undefined, errorCategory: ErrorCategory | undefined): boolean {
    if (!statusCode) return true; // Network errors are retryable
    if (statusCode === 429) return true; // Rate limit
    if (statusCode >= 500) return true; // Server errors
    if (statusCode === 408) return true; // Timeout
    return false; // 4xx client errors (except 429) are not retryable
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    if (error instanceof TypeError && error.message.includes('fetch')) return true; // Network error
    return false;
  }

  private categorizeError(error: unknown): ErrorCategory {
    if (error instanceof DOMException && error.name === 'AbortError') return 'TIMEOUT';
    if (error instanceof TypeError && error.message.includes('fetch')) return 'NETWORK';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) return 'AUTHORIZATION';
      if (error.message.includes('429')) return 'RATE_LIMIT';
      if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) return 'NETWORK';
    }
    return 'UNKNOWN';
  }

  private calculateBackoff(attempt: number): number {
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt),
      this.config.maxDelayMs
    );
    // Add jitter (±10%)
    return Math.floor(delay * (0.9 + Math.random() * 0.2));
  }

  private async scheduleRetry(event: any, delayMs: number): Promise<void> {
    const nextRetryAt = new Date(Date.now() + delayMs);
    await prisma.integrationEvent.update({
      where: { eventId: event.eventId },
      data: {
        deliveryCount: event.deliveryCount + 1,
        nextRetryAt,
        status: 'QUEUED',
      },
    });
  }

  private async handleDeliverySuccess(
    event: any,
    result: DeliveryResult,
    durationMs: number,
    attempts: number
  ): Promise<void> {
    await prisma.$transaction([
      prisma.integrationEvent.update({
        where: { eventId: event.eventId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          deliveryCount: attempts,
          errorMessage: null,
          errorCategory: null,
        },
      }),
      prisma.webhookDelivery.create({
        data: {
          eventId: event.eventId,
          integrationId: event.integrationId,
          url: (event.integration.config as any).webhookUrl,
          attempt: attempts,
          requestPayload: event.payload as any,
          requestHeaders: this.buildHeaders(event, null) as any,
          responseStatus: result.statusCode,
          responseBody: result.responseBody,
          success: true,
          durationMs,
        },
      }),
    ]);

    // Update integration health
    await prisma.integration.update({
      where: { id: event.integrationId },
      data: {
        errorCount: 0,
        lastError: null,
      },
    });

    logger.info({ eventId: event.eventId, attempts, durationMs }, 'Event delivered successfully');
  }

  private async handleDeliveryFailure(
    event: any,
    error: string,
    errorCategory: ErrorCategory,
    durationMs: number
  ): Promise<DeliveryResult> {
    const attempt = event.deliveryCount + 1;
    const isFinalFailure = attempt > this.config.maxRetries;

    await prisma.$transaction([
      prisma.integrationEvent.update({
        where: { eventId: event.eventId },
        data: {
          status: isFinalFailure ? 'DEAD_LETTER' : 'FAILED',
          deliveryCount: attempt,
          failedAt: isFinalFailure ? new Date() : null,
          errorMessage: error,
          errorCategory,
          nextRetryAt: isFinalFailure ? null : event.nextRetryAt,
        },
      }),
      prisma.webhookDelivery.create({
        data: {
          eventId: event.eventId,
          integrationId: event.integrationId,
          url: (event.integration.config as any).webhookUrl,
          attempt,
          requestPayload: event.payload as any,
          requestHeaders: this.buildHeaders(event, null) as any,
          responseStatus: isFinalFailure ? null : 0,
          responseBody: error,
          success: false,
          errorCategory,
          errorMessage: error,
          durationMs,
        },
      }),
      // Record integration error
      prisma.integrationError.create({
        data: {
          integrationId: event.integrationId,
          category: errorCategory,
          severity: isFinalFailure ? 'HIGH' : 'MEDIUM',
          message: error,
          details: { eventId: event.eventId, attempt } as any,
          eventId: event.eventId,
          status: isFinalFailure ? 'OPEN' : 'AUTO_RESOLVED',
        },
      }),
    ]);

    // Update integration error count
    await prisma.integration.update({
      where: { id: event.integrationId },
      data: {
        errorCount: { increment: 1 },
        lastError: error,
      },
    });

    logger.error({ eventId: event.eventId, attempt, error, errorCategory, final: isFinalFailure }, 'Event delivery failed');
    return { success: false, error, errorCategory, durationMs };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Processes pending events (for scheduled worker)
   */
  async processPendingEvents(integrationId?: string, batchSize = 50): Promise<{ processed: number; succeeded: number; failed: number }> {
    const now = new Date();

    const where: any = {
      status: { in: ['PENDING', 'QUEUED'] },
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } },
      ],
    };

    if (integrationId) {
      where.integrationId = integrationId;
    }

    const events = await prisma.integrationEvent.findMany({
      where,
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const result = await this.deliverEvent(event.eventId);
        processed++;
        if (result.success) succeeded++;
        else failed++;
      } catch (error) {
        processed++;
        failed++;
        logger.error({ err: error, eventId: event.eventId }, 'Event processing error');
      }
    }

    return { processed, succeeded, failed };
  }

  /**
   * Retries a dead-lettered event
   */
  async retryDeadLetter(eventId: string, actorId: string): Promise<void> {
    const event = await prisma.integrationEvent.findUnique({
      where: { eventId },
    });

    if (!event) {
      throw new Error('Event not found');
    }

    if (event.status !== 'DEAD_LETTER') {
      throw new Error('Event is not in dead letter queue');
    }

    await prisma.integrationEvent.update({
      where: { eventId },
      data: {
        status: 'QUEUED',
        nextRetryAt: new Date(),
        deliveryCount: 0,
        errorMessage: null,
        errorCategory: null,
      },
    });

    // Record audit
    await prisma.integrationAudit.create({
      data: {
        integrationId: event.integrationId,
        action: 'event_retry',
        actorId,
        actorType: 'USER',
        resourceType: 'IntegrationEvent',
        resourceId: eventId,
        metadata: { eventType: event.eventType } as any,
      },
    });

    logger.info({ eventId, actorId }, 'Dead letter event retried');
  }
}

export const eventDelivery = new EventDeliveryService();
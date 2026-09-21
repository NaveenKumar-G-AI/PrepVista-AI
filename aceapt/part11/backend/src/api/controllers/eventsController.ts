import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { incomingEventSchema } from '../../domain/eventValidation';
import { eventStore } from '../../infrastructure/store';
import { BehaviorEvent } from '../../types/events';

async function ingest(input: unknown): Promise<BehaviorEvent> {
  const parsed = incomingEventSchema.parse(input);
  const event: BehaviorEvent = {
    ...parsed,
    id: parsed.id ?? randomUUID(),
    occurredAtUtc: parsed.occurredAtUtc ?? new Date().toISOString(),
  };
  return eventStore.append(event);
}

export async function postEvent(req: Request, res: Response): Promise<void> {
  const stored = await ingest(req.body);
  res.status(201).json(stored);
}

export async function postEventBatch(req: Request, res: Response): Promise<void> {
  const items = Array.isArray(req.body?.events) ? req.body.events : [];
  const stored: BehaviorEvent[] = [];
  for (const item of items) stored.push(await ingest(item));
  res.status(201).json({ count: stored.length, events: stored });
}

export async function postStudentContext(req: Request, res: Response): Promise<void> {
  // Section 27: student-provided context ("I only have 15 minutes today")
  // is stored as its own event type, never conflated with observed
  // behavioral data - it's context, not evidence about a pattern.
  const studentId = req.params.id as string;
  const stored = await ingest({ ...req.body, studentId, type: 'STUDENT_CONTEXT_PROVIDED' });
  res.status(201).json(stored);
}

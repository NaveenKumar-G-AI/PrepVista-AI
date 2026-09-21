import { NextResponse } from 'next/server';

export function apiError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleUnexpected(err: unknown) {
  const status = (err as { status?: number })?.status ?? 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return apiError(message, status);
}

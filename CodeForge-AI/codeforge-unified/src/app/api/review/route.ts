import { z } from 'zod';
import { readInput, errorResponse, RequestError } from '@/lib/security';
import { reviewSource } from '@/lib/quality';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const input = z.object({ code: z.string().trim().min(1).max(20000) }).strict().safeParse(await readInput(request, 'review', 30));
    if (!input.success) throw new RequestError(400, 'Enter JavaScript code under 20,000 characters.');
    return Response.json({ findings: await reviewSource(input.data.code), note: 'Static, best-effort analysis. These rules do not establish correctness or measure runtime complexity.' });
  } catch (error) { return errorResponse(error); }
}

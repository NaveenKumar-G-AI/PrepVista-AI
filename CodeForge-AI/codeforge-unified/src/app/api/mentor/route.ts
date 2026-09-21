import { readInput, errorResponse, RequestError } from '@/lib/security';
import { mentorInput } from '@/ai/schemas';
import { askGemini } from '@/ai/provider';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const parsed = mentorInput.safeParse(await readInput(request, 'mentor'));
    if (!parsed.success) throw new RequestError(400, 'Enter a question and keep code under 20,000 characters.');
    return Response.json(await askGemini(parsed.data, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}

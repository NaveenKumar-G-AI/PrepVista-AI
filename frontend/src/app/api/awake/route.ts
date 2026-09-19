import { createAwakeProbe } from '@/lib/backend-awake';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const probe = createAwakeProbe();
export async function GET() {
  const backend = await probe(process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || process.env.BACKEND_URL || '');
  return Response.json({ status: 'awake', service: 'prepvista-frontend', timestamp: new Date().toISOString(), backend }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache', 'X-Robots-Tag': 'noindex' },
  });
}

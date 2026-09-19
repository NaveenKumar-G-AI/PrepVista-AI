import { AuthHeader } from '@/components/auth-header';
import { JourneyView } from '@/modules/coding/journey';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-6xl px-6 py-8"><JourneyView snapshotId={id} /></main></div>;
}

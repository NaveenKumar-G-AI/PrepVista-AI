import { AuthHeader } from '@/components/auth-header';
import { JourneyView } from '@/modules/coding/journey';
import { ReadinessSharing } from '@/modules/coding/sharing';
export default function Page() {
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-6xl px-6 py-8"><JourneyView /><ReadinessSharing /></main></div>;
}

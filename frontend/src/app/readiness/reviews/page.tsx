import { AuthHeader } from '@/components/auth-header';
import { ArtifactReviews } from '@/modules/coding/artifact-review';
export default function Page() {
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-6xl px-6 py-8"><ArtifactReviews /></main></div>;
}

import { AuthHeader } from '@/components/auth-header';
import { ValidationReceipt } from '@/modules/coding/validation-receipt';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="min-h-screen surface-primary"><AuthHeader /><main className="mx-auto max-w-4xl px-6 py-8"><ValidationReceipt id={id} /></main></div>;
}

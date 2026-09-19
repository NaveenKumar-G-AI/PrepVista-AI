import { AuthHeader } from '@/components/auth-header';
import { AssignmentInbox } from '@/modules/coding/assignment-inbox';
export default function Page() {
  return <div className="min-h-screen surface-primary"><AuthHeader/><main className="mx-auto max-w-6xl px-6 py-8"><AssignmentInbox/></main></div>;
}

import { AppShell } from '@/components/nav/AppShell';
import { NewOutcomeForm } from './NewOutcomeForm';

export default function NewOutcomePage() {
  return (
    <AppShell>
      <h1 className="font-display text-3xl text-ink mb-2">Record an Outcome</h1>
      <p className="text-sm text-muted mb-8 max-w-xl">
        Record what happened as it actually happened. ACEAPT never fills in a reason you did not
        give it — an outcome without recruiter feedback is recorded honestly as unknown.
      </p>
      <NewOutcomeForm />
    </AppShell>
  );
}

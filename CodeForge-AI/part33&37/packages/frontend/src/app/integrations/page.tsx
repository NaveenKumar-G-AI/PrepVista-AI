'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { IntegrationsTable } from '@/components/integrations/IntegrationsTable';
import { CreateIntegrationDialog } from '@/components/integrations/CreateIntegrationDialog';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function IntegrationsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Only COLLEGE_ADMIN and SUPER_ADMIN can access
  if (!['COLLEGE_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
          <p className="text-muted-foreground mt-2">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground mt-1">Manage PrepVista integration settings and synchronization</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Integration
        </Button>
      </div>

      <IntegrationsTable onView={router.push} />

      <CreateIntegrationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => setShowCreateDialog(false)}
      />
    </div>
  );
}
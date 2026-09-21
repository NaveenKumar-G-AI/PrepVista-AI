'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronRight, ExternalLink, AlertCircle, CheckCircle, XCircle, RefreshCw, Settings, Database, Users, Activity, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { CredentialsTab, OrganizationMappingsTab, IdentityMappingsTab, SyncJobsTab, AuditLogTab, HealthTab } from './IntegrationDetailTabs';

interface Integration {
  id: string;
  name: string;
  type: string;
  status: string;
  collegeId: string;
  externalId: string | null;
  config: Record<string, any>;
  sharingPolicy: {
    id: string;
    name: string;
    scopes: string[];
    defaultScope: string;
    studentOptIn: boolean;
    autoApprove: boolean;
    retentionDays: number;
  } | null;
  _count: {
    credentials: number;
    mappings: number;
    identityMappings: number;
    syncJobs: number;
  };
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  errorCount: number;
}

interface IntegrationsTableProps {
  onView: (path: string) => void;
}

export function IntegrationsTable({ onView }: IntegrationsTableProps) {
  const { user, getAccessToken } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'credentials' | 'org-mappings' | 'identity-mappings' | 'sync' | 'audit'>('overview');

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const token = await getAccessToken();
      const res = await fetch('/api/integrations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setIntegrations(data.integrations || []);
    } catch (error) {
      console.error('Failed to fetch integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
      ACTIVE: 'success',
      PENDING: 'warning',
      CONNECTING: 'warning',
      DEGRADED: 'warning',
      DISCONNECTING: 'secondary',
      DISCONNECTED: 'secondary',
      ERROR: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const handleViewDetail = (integration: Integration) => {
    setSelectedIntegration(integration);
    setDetailTab('overview');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (integrations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ExternalLink className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No integrations configured</h3>
          <p className="text-muted-foreground mb-4">
            Create your first PrepVista integration to start syncing technical intelligence.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Integrations List */}
      <Card>
        <CardHeader>
          <CardTitle>Configured Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Students Linked</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {integrations.map((integration) => (
                <TableRow key={integration.id} onClick={() => handleViewDetail(integration)} className="cursor-pointer hover:bg-accent/50">
                  <TableCell className="font-medium">{integration.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{integration.type}</Badge>
                  </TableCell>
                  <TableCell>{getStatusBadge(integration.status)}</TableCell>
                  <TableCell>{integration._count.identityMappings}</TableCell>
                  <TableCell>
                    {integration.lastSyncAt ? format(new Date(integration.lastSyncAt), 'MMM d, yyyy HH:mm') : 'Never'}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleViewDetail(integration); }}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedIntegration} onOpenChange={(open) => !open && setSelectedIntegration(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          {selectedIntegration && (
            <div className="flex flex-col h-full">
              <DialogHeader>
                <div className="flex items-center justify-between w-full">
                  <DialogTitle>{selectedIntegration.name}</DialogTitle>
                  <StatusBadge status={selectedIntegration.status} />
                </div>
              </DialogHeader>
              <Separator />
              <Tabs value={detailTab} onValueChange={setDetailTab} className="flex-1 overflow-hidden">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="overview"><Activity className="mr-2 h-4 w-4" />Overview</TabsTrigger>
                  <TabsTrigger value="credentials"><Shield className="mr-2 h-4 w-4" />Credentials</TabsTrigger>
                  <TabsTrigger value="org-mappings"><Database className="mr-2 h-4 w-4" />Org Mappings</TabsTrigger>
                  <TabsTrigger value="identity-mappings"><Users className="mr-2 h-4 w-4" />Identity Mappings</TabsTrigger>
                  <TabsTrigger value="sync"><RefreshCw className="mr-2 h-4 w-4" />Sync Jobs</TabsTrigger>
                  <TabsTrigger value="audit"><Settings className="mr-2 h-4 w-4" />Audit</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="flex-1 overflow-auto p-4 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">External ID</label>
                      <p>{selectedIntegration.externalId || 'Not set'}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">College ID</label>
                      <p>{selectedIntegration.collegeId}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Connected At</label>
                      <p>{selectedIntegration.connectedAt ? format(new Date(selectedIntegration.connectedAt), 'MMM d, yyyy HH:mm') : 'Not connected'}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Disconnected At</label>
                      <p>{selectedIntegration.disconnectedAt ? format(new Date(selectedIntegration.disconnectedAt), 'MMM d, yyyy HH:mm') : 'N/A'}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Last Sync</label>
                      <p>{selectedIntegration.lastSyncAt ? format(new Date(selectedIntegration.lastSyncAt), 'MMM d, yyyy HH:mm') : 'Never'}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Error Count</label>
                      <p className={selectedIntegration.errorCount > 0 ? 'text-destructive' : 'text-success'}>
                        {selectedIntegration.errorCount}
                      </p>
                    </div>
                    {selectedIntegration.lastError && (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-destructive">Last Error</label>
                        <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{selectedIntegration.lastError}</p>
                      </div>
                    )}
                  </div>

                  {selectedIntegration.sharingPolicy && (
                    <div className="space-y-4 border-t pt-4">
                      <h4 className="font-medium">Sharing Policy</h4>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Default Scope</label>
                          <Badge variant="secondary">{selectedIntegration.sharingPolicy.defaultScope}</Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Student Opt-In</label>
                          <Badge variant={selectedIntegration.sharingPolicy.studentOptIn ? 'success' : 'secondary'}>
                            {selectedIntegration.sharingPolicy.studentOptIn ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Auto Approve</label>
                          <Badge variant={selectedIntegration.sharingPolicy.autoApprove ? 'success' : 'secondary'}>
                            {selectedIntegration.sharingPolicy.autoApprove ? 'Enabled' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="md:col-span-3">
                          <label className="text-sm font-medium text-muted-foreground">Enabled Scopes</label>
                          <div className="flex flex-wrap gap-2">
                            {selectedIntegration.sharingPolicy.scopes.map((scope: string) => (
                              <Badge key={scope} variant="outline">{scope}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Retention</label>
                          <p>{selectedIntegration.sharingPolicy.retentionDays} days</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={() => setDetailTab('sync')}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Trigger Sync
                    </Button>
                    <Button variant="outline" onClick={() => setDetailTab('identity-mappings')}>
                      <Users className="mr-2 h-4 w-4" />
                      Manage Mappings
                    </Button>
                    <Button variant="outline" onClick={() => setDetailTab('credentials')}>
                      <Shield className="mr-2 h-4 w-4" />
                      Manage Credentials
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="credentials" className="flex-1 overflow-auto p-4">
                  <CredentialsTab integrationId={selectedIntegration.id} />
                </TabsContent>

                <TabsContent value="org-mappings" className="flex-1 overflow-auto p-4">
                  <OrganizationMappingsTab integrationId={selectedIntegration.id} />
                </TabsContent>

                <TabsContent value="identity-mappings" className="flex-1 overflow-auto p-4">
                  <IdentityMappingsTab integrationId={selectedIntegration.id} />
                </TabsContent>

                <TabsContent value="sync" className="flex-1 overflow-auto p-4">
                  <SyncJobsTab integrationId={selectedIntegration.id} />
                </TabsContent>

                <TabsContent value="audit" className="flex-1 overflow-auto p-4">
                  <AuditLogTab integrationId={selectedIntegration.id} />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
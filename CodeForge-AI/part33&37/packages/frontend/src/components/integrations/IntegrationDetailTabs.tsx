'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, ChevronRight, AlertCircle, CheckCircle, XCircle, RefreshCw, Settings, Database, Users, Activity, Shield, Key, Trash2, Edit, Eye, Download, Upload, RotateCcw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/use-toast';

interface Credential {
  id: string;
  name: string;
  type: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  rotatedAt: string | null;
}

interface OrganizationMapping {
  id: string;
  codeforgeCollegeId: string;
  externalOrgId: string;
  externalOrgName: string | null;
  status: string;
  mappedBy: string;
  mappedAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

interface IdentityMapping {
  id: string;
  codeforgeStudentId: string;
  externalStudentId: string;
  externalEmail: string | null;
  method: string;
  status: string;
  conflictId: string | null;
  mappedBy: string | null;
  mappedAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
}

interface SyncJob {
  id: string;
  type: string;
  status: string;
  scope: string;
  studentIds: string[];
  triggeredBy: string;
  startedAt: string | null;
  completedAt: string | null;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  errorSummary: any;
  createdAt: string;
  records?: SyncRecord[];
}

interface SyncRecord {
  id: string;
  studentId: string;
  externalStudentId: string | null;
  resourceType: string;
  action: string;
  status: string;
  error: string | null;
  completedAt: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorType: string;
  resourceType: string | null;
  resourceId: string | null;
  studentId: string | null;
  metadata: any;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface HealthStatus {
  connection: string;
  identityMapping: string;
  synchronization: string;
  eventDelivery: string;
  pendingEvents: number;
  failedEvents: number;
  deadLetterEvents: number;
  lastSuccessfulSync: string | null;
  lastError: string | null;
  credentialStatus: string;
}

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  CONNECTING: 'warning',
  DEGRADED: 'warning',
  DISCONNECTING: 'secondary',
  DISCONNECTED: 'secondary',
  ERROR: 'destructive',
  VERIFIED: 'success',
  CONFLICT: 'destructive',
  REVOKED: 'secondary',
  REJECTED: 'destructive',
  COMPLETED: 'success',
  RUNNING: 'warning',
  PARTIAL: 'warning',
  FAILED: 'destructive',
  CANCELLED: 'secondary',
  DELIVERED: 'success',
  QUEUED: 'warning',
  DELIVERING: 'warning',
  DEAD_LETTER: 'destructive',
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'destructive',
  MISSING: 'destructive',
  HEALTHY: 'success',
  UNHEALTHY: 'destructive',
  NOT_CONFIGURED: 'secondary',
  NOT_STARTED: 'secondary',
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant[status] || 'default'}>{status}</Badge>;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return 'N/A';
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

export function CredentialsTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState<Credential | null>(null);
  const [formData, setFormData] = useState({ name: '', type: 'API_KEY', value: '', expiresAt: '' });

  useEffect(() => {
    fetchCredentials();
  }, [integrationId]);

  const fetchCredentials = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setCredentials(data.integration?.credentials || []);
    } catch (error) {
      console.error('Failed to fetch credentials:', error);
      toast({ title: 'Error', description: 'Failed to load credentials', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to create');
      toast({ title: 'Success', description: 'Credential created' });
      setShowCreateDialog(false);
      setFormData({ name: '', type: 'API_KEY', value: '', expiresAt: '' });
      fetchCredentials();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to create credential', variant: 'destructive' });
    }
  };

  const handleRotate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showRotateDialog) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/credentials/${showRotateDialog.id}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ value: formData.value }),
      });
      if (!res.ok) throw new Error('Failed to rotate');
      toast({ title: 'Success', description: 'Credential rotated' });
      setShowRotateDialog(null);
      setFormData({ name: '', type: 'API_KEY', value: '', expiresAt: '' });
      fetchCredentials();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to rotate credential', variant: 'destructive' });
    }
  };

  const handleRevoke = async (credential: Credential) => {
    if (!confirm(`Revoke credential "${credential.name}"? This cannot be undone.`)) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/credentials/${credential.id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to revoke');
      toast({ title: 'Success', description: 'Credential revoked' });
      fetchCredentials();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to revoke credential', variant: 'destructive' });
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Credentials</h3>
        <Button onClick={() => setShowCreateDialog(true)}><Key className="mr-2 h-4 w-4" />Add Credential</Button>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Credential</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g., api_key" required /></div>
            <div className="space-y-2"><Label htmlFor="type">Type</Label><Select value={formData.type} onValueChange={v => setFormData({...formData, type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="API_KEY">API Key</SelectItem><SelectItem value="WEBHOOK_SECRET">Webhook Secret</SelectItem><SelectItem value="OAUTH_TOKEN">OAuth Token</SelectItem><SelectItem value="OAUTH_REFRESH_TOKEN">OAuth Refresh Token</SelectItem><SelectItem value="SERVICE_ACCOUNT_KEY">Service Account Key</SelectItem><SelectItem value="CERTIFICATE">Certificate</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="value">Value</Label><Input id="value" type="password" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} required /></div>
            <div className="space-y-2"><Label htmlFor="expiresAt">Expires At (Optional)</Label><Input id="expiresAt" type="datetime-local" value={formData.expiresAt} onChange={e => setFormData({...formData, expiresAt: e.target.value})} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showRotateDialog} onOpenChange={open => !open && setShowRotateDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rotate Credential: {showRotateDialog?.name}</DialogTitle></DialogHeader>
          <form onSubmit={handleRotate} className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Enter the new credential value. The old value will be immediately invalidated.</p>
            <div className="space-y-2"><Label htmlFor="rotateValue">New Value</Label><Input id="rotateValue" type="password" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} required /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowRotateDialog(null)}>Cancel</Button><Button type="submit">Rotate</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {credentials.length === 0 ? (
        <Card><CardContent className="py-8 text-center"><Key className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><h4 className="font-medium mb-2">No credentials configured</h4><p className="text-muted-foreground">Add API keys, webhook secrets, or OAuth tokens for the integration.</p></CardContent></Card>
      ) : (
        <Card><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Expires</TableHead><TableHead>Last Used</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
          {credentials.map(cred => (
            <TableRow key={cred.id}>
              <TableCell className="font-medium">{cred.name}</TableCell>
              <TableCell><Badge variant="secondary">{cred.type}</Badge></TableCell>
              <TableCell><StatusBadge status={cred.status} /></TableCell>
              <TableCell>{cred.expiresAt ? formatDate(cred.expiresAt) : 'Never'}</TableCell>
              <TableCell>{cred.lastUsedAt ? formatDate(cred.lastUsedAt) : 'Never'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {cred.status === 'ACTIVE' && <Button variant="ghost" size="icon" onClick={() => { setFormData({...formData, value: ''}); setShowRotateDialog(cred); }} title="Rotate"><RotateCcw className="h-4 w-4" /></Button>}
                  {cred.status === 'ACTIVE' && <Button variant="ghost" size="icon" onClick={() => handleRevoke(cred)} title="Revoke" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}

export function OrganizationMappingsTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [mappings, setMappings] = useState<OrganizationMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({ codeforgeCollegeId: '', externalOrgId: '', externalOrgName: '' });

  useEffect(() => { fetchMappings(); }, [integrationId]);

  const fetchMappings = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMappings(data.integration?.mappings || []);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load mappings', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/organization-mapping`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(formData) });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Success', description: 'Mapping created' });
      setShowCreateDialog(false);
      setFormData({ codeforgeCollegeId: '', externalOrgId: '', externalOrgName: '' });
      fetchMappings();
    } catch (e) { toast({ title: 'Error', description: 'Failed to create mapping', variant: 'destructive' }); }
  };

  const handleVerify = async (mapping: OrganizationMapping) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/organization-mapping/${mapping.id}/verify`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Success', description: 'Mapping verified' });
      fetchMappings();
    } catch (e) { toast({ title: 'Error', description: 'Failed to verify', variant: 'destructive' }); }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Organization Mappings</h3>
        <Button onClick={() => setShowCreateDialog(true)}><Users className="mr-2 h-4 w-4" />Add Mapping</Button>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Organization Mapping</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="codeforgeCollegeId">CodeForge College ID</Label><Input id="codeforgeCollegeId" value={formData.codeforgeCollegeId} onChange={e => setFormData({...formData, codeforgeCollegeId: e.target.value})} placeholder="UUID" required /></div>
            <div className="space-y-2"><Label htmlFor="externalOrgId">PrepVista Organization ID</Label><Input id="externalOrgId" value={formData.externalOrgId} onChange={e => setFormData({...formData, externalOrgId: e.target.value})} placeholder="pv-org-123" required /></div>
            <div className="space-y-2"><Label htmlFor="externalOrgName">Organization Name (Optional)</Label><Input id="externalOrgName" value={formData.externalOrgName} onChange={e => setFormData({...formData, externalOrgName: e.target.value})} placeholder="PrepVista Demo Org" /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {mappings.length === 0 ? (
        <Card><CardContent className="py-8 text-center"><Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><h4 className="font-medium mb-2">No organization mappings</h4><p className="text-muted-foreground">Map CodeForge colleges to PrepVista organizations.</p></CardContent></Card>
      ) : (
        <Card><CardContent><Table><TableHeader><TableRow><TableHead>CodeForge College</TableHead><TableHead>External Org ID</TableHead><TableHead>External Name</TableHead><TableHead>Status</TableHead><TableHead>Mapped By</TableHead><TableHead>Verified At</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
          {mappings.map(m => (
            <TableRow key={m.id}>
              <TableCell>{m.codeforgeCollegeId}</TableCell>
              <TableCell className="font-mono text-sm">{m.externalOrgId}</TableCell>
              <TableCell>{m.externalOrgName || '-'}</TableCell>
              <TableCell><StatusBadge status={m.status} /></TableCell>
              <TableCell className="text-sm">{m.mappedBy}</TableCell>
              <TableCell>{m.verifiedAt ? formatDate(m.verifiedAt) : 'Pending'}</TableCell>
              <TableCell>{m.status === 'PENDING' && <Button variant="ghost" size="sm" onClick={() => handleVerify(m)}>Verify</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}

export function IdentityMappingsTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [mappings, setMappings] = useState<IdentityMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [formData, setFormData] = useState({ codeforgeStudentId: '', externalStudentId: '', externalEmail: '', method: 'ADMIN_MANUAL' });

  useEffect(() => { fetchMappings(); }, [integrationId, filterStatus]);

  const fetchMappings = async () => {
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      const res = await fetch(`/api/integrations/${integrationId}/identity-mappings?${params}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMappings(data.mappings || []);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load mappings', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/identity-mapping`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(formData) });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Success', description: 'Identity mapping created' });
      setShowCreateDialog(false);
      setFormData({ codeforgeStudentId: '', externalStudentId: '', externalEmail: '', method: 'ADMIN_MANUAL' });
      fetchMappings();
    } catch (e) { toast({ title: 'Error', description: 'Failed to create mapping', variant: 'destructive' }); }
  };

  const handleVerify = async (mapping: IdentityMapping) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/identity-mapping/${mapping.id}/verify`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Success', description: 'Identity mapping verified' });
      fetchMappings();
    } catch (e) { toast({ title: 'Error', description: 'Failed to verify', variant: 'destructive' }); }
  };

  const handleRevoke = async (mapping: IdentityMapping) => {
    const reason = prompt('Reason for revocation (optional):');
    if (reason === null) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/identity-mapping/${mapping.id}/revoke`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ reason }) });
      if (!res.ok) throw new Error('Failed');
      toast({ title: 'Success', description: 'Identity mapping revoked' });
      fetchMappings();
    } catch (e) { toast({ title: 'Error', description: 'Failed to revoke', variant: 'destructive' }); }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Identity Mappings</h3>
        <div className="flex items-center gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter by status" /></SelectTrigger><SelectContent>
            <SelectItem value="">All</SelectItem><SelectItem value="PENDING">Pending</SelectItem><SelectItem value="VERIFIED">Verified</SelectItem><SelectItem value="CONFLICT">Conflict</SelectItem><SelectItem value="REVOKED">Revoked</SelectItem><SelectItem value="REJECTED">Rejected</SelectItem></SelectContent></Select>
          <Button onClick={() => setShowCreateDialog(true)}><Users className="mr-2 h-4 w-4" />Add Mapping</Button>
        </div>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Identity Mapping</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="codeforgeStudentId">CodeForge Student ID</Label><Input id="codeforgeStudentId" value={formData.codeforgeStudentId} onChange={e => setFormData({...formData, codeforgeStudentId: e.target.value})} placeholder="UUID" required /></div>
            <div className="space-y-2"><Label htmlFor="externalStudentId">PrepVista Student ID</Label><Input id="externalStudentId" value={formData.externalStudentId} onChange={e => setFormData({...formData, externalStudentId: e.target.value})} placeholder="pv-student-123" required /></div>
            <div className="space-y-2"><Label htmlFor="externalEmail">External Email (Optional)</Label><Input id="externalEmail" type="email" value={formData.externalEmail} onChange={e => setFormData({...formData, externalEmail: e.target.value})} placeholder="student@prepvista.com" /></div>
            <div className="space-y-2"><Label htmlFor="method">Mapping Method</Label><Select value={formData.method} onValueChange={v => setFormData({...formData, method: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="EXTERNAL_ID">External ID</SelectItem><SelectItem value="VERIFIED_EMAIL">Verified Email</SelectItem><SelectItem value="INSTITUTION_ID">Institution ID</SelectItem><SelectItem value="ADMIN_MANUAL">Admin Manual</SelectItem><SelectItem value="AUTO_MATCHED">Auto Matched</SelectItem></SelectContent></Select></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {mappings.length === 0 ? (
        <Card><CardContent className="py-8 text-center"><Users className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><h4 className="font-medium mb-2">No identity mappings</h4><p className="text-muted-foreground">Link CodeForge students to PrepVista student identities.</p></CardContent></Card>
      ) : (
        <Card><CardContent><Table><TableHeader><TableRow><TableHead>CodeForge Student</TableHead><TableHead>External Student ID</TableHead><TableHead>External Email</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead>Mapped At</TableHead><TableHead>Verified At</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
          {mappings.map(m => (
            <TableRow key={m.id} className={m.status === 'CONFLICT' ? 'bg-destructive/5' : ''}>
              <TableCell className="font-mono text-sm">{m.codeforgeStudentId}</TableCell>
              <TableCell className="font-mono text-sm">{m.externalStudentId}</TableCell>
              <TableCell>{m.externalEmail || '-'}</TableCell>
              <TableCell><Badge variant="secondary">{m.method}</Badge></TableCell>
              <TableCell><StatusBadge status={m.status} /></TableCell>
              <TableCell>{formatDate(m.mappedAt)}</TableCell>
              <TableCell>{m.verifiedAt ? formatDate(m.verifiedAt) : '-'}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  {m.status === 'PENDING' && <Button variant="ghost" size="icon" onClick={() => handleVerify(m)} title="Verify"><CheckCircle className="h-4 w-4 text-success" /></Button>}
                  {m.status === 'CONFLICT' && <AlertTriangle className="h-4 w-4 text-destructive" title="Conflict detected" />}
                  {(m.status === 'VERIFIED' || m.status === 'PENDING') && <Button variant="ghost" size="icon" onClick={() => handleRevoke(m)} title="Revoke" className="text-destructive hover:text-destructive"><XCircle className="h-4 w-4" /></Button>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}

export function SyncJobsTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedJob, setSelectedJob] = useState<SyncJob | null>(null);
  const [showTriggerDialog, setShowTriggerDialog] = useState(false);
  const [triggerForm, setTriggerForm] = useState({ type: 'INCREMENTAL', scope: 'CHANGED_ONLY', studentIds: '' });

  useEffect(() => { fetchJobs(); }, [integrationId, page]);

  const fetchJobs = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/sync?page=${page}&limit=20`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load sync jobs', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const handleTrigger = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = await getAccessToken();
      const body: any = { type: triggerForm.type, scope: triggerForm.scope };
      if (triggerForm.studentIds) body.studentIds = triggerForm.studentIds.split(',').map(s => s.trim());
      const res = await fetch(`/api/integrations/${integrationId}/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      toast({ title: 'Success', description: 'Sync job triggered' });
      setShowTriggerDialog(false);
      setTriggerForm({ type: 'INCREMENTAL', scope: 'CHANGED_ONLY', studentIds: '' });
      setTimeout(fetchJobs, 1000);
    } catch (e) { toast({ title: 'Error', description: 'Failed to trigger sync', variant: 'destructive' }); }
  };

  const handleView = async (job: SyncJob) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/sync/${job.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setSelectedJob(data.syncJob);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load job details', variant: 'destructive' }); }
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Sync Jobs</h3>
        <Button onClick={() => setShowTriggerDialog(true)}><RefreshCw className="mr-2 h-4 w-4" />Trigger Sync</Button>
      </div>

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Trigger Sync Job</DialogTitle></DialogHeader>
          <form onSubmit={handleTrigger} className="space-y-4 py-4">
            <div className="space-y-2"><Label htmlFor="syncType">Sync Type</Label><Select value={triggerForm.type} onValueChange={v => setTriggerForm({...triggerForm, type: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="INITIAL">Initial</SelectItem><SelectItem value="INCREMENTAL">Incremental</SelectItem><SelectItem value="FULL_RESYNC">Full Resync</SelectItem><SelectItem value="SINGLE_STUDENT">Single Student</SelectItem><SelectItem value="RECONCILIATION">Reconciliation</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="syncScope">Scope</Label><Select value={triggerForm.scope} onValueChange={v => setTriggerForm({...triggerForm, scope: v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="ALL_ELIGIBLE">All Eligible</SelectItem><SelectItem value="SPECIFIC_STUDENTS">Specific Students</SelectItem><SelectItem value="CHANGED_ONLY">Changed Only</SelectItem><SelectItem value="FAILED_RETRY">Failed Retry</SelectItem></SelectContent></Select></div>
            {triggerForm.scope === 'SPECIFIC_STUDENTS' && <div className="space-y-2"><Label htmlFor="studentIds">Student IDs (comma-separated)</Label><Input id="studentIds" value={triggerForm.studentIds} onChange={e => setTriggerForm({...triggerForm, studentIds: e.target.value})} placeholder="student-1, student-2" /></div>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setShowTriggerDialog(false)}>Cancel</Button><Button type="submit">Trigger</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedJob} onOpenChange={open => !open && setSelectedJob(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Sync Job Details</DialogTitle></DialogHeader>
          {selectedJob && (
            <div className="space-y-4 py-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div><label className="text-sm font-medium text-muted-foreground">Type</label><p><StatusBadge status={selectedJob.type} /></p></div>
                <div><label className="text-sm font-medium text-muted-foreground">Status</label><p><StatusBadge status={selectedJob.status} /></p></div>
                <div><label className="text-sm font-medium text-muted-foreground">Scope</label><p>{selectedJob.scope}</p></div>
                <div><label className="text-sm font-medium text-muted-foreground">Total Records</label><p>{selectedJob.totalRecords}</p></div>
                <div><label className="text-sm font-medium text-muted-foreground">Processed</label><p className="text-success">{selectedJob.processedRecords}</p></div>
                <div><label className="text-sm font-medium text-muted-foreground">Failed</label><p className="text-destructive">{selectedJob.failedRecords}</p></div>
                <div className="md:col-span-3"><label className="text-sm font-medium text-muted-foreground">Started</label><p>{formatDate(selectedJob.startedAt)}</p></div>
                <div className="md:col-span-3"><label className="text-sm font-medium text-muted-foreground">Completed</label><p>{formatDate(selectedJob.completedAt)}</p></div>
              </div>
              {selectedJob.errorSummary && <div><label className="text-sm font-medium text-destructive">Errors</label><pre className="text-sm text-destructive bg-destructive/10 p-2 rounded overflow-auto">{JSON.stringify(selectedJob.errorSummary, null, 2)}</pre></div>}
              {selectedJob.records && selectedJob.records.length > 0 && (
                <div><label className="text-sm font-medium">Records</label><Table><TableHeader><TableRow><TableHead>Student</TableHead><TableHead>External ID</TableHead><TableHead>Resource</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>
                  {selectedJob.records.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">{r.studentId}</TableCell>
                      <TableCell className="font-mono text-sm">{r.externalStudentId || '-'}</TableCell>
                      <TableCell>{r.resourceType}</TableCell>
                      <TableCell>{r.action}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-destructive text-sm">{r.error || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {jobs.length === 0 ? (
        <Card><CardContent className="py-8 text-center"><Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><h4 className="font-medium mb-2">No sync jobs</h4><p className="text-muted-foreground">Trigger a sync to start synchronizing data.</p></CardContent></Card>
      ) : (
        <Card><CardContent><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Scope</TableHead><TableHead>Records</TableHead><TableHead>Started</TableHead><TableHead>Completed</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>
          {jobs.map(job => (
            <TableRow key={job.id} onClick={() => handleView(job)} className="cursor-pointer hover:bg-accent/50">
              <TableCell><StatusBadge status={job.type} /></TableCell>
              <TableCell><StatusBadge status={job.status} /></TableCell>
              <TableCell>{job.scope}</TableCell>
              <TableCell>{job.processedRecords} / {job.totalRecords}</TableCell>
              <TableCell>{formatDate(job.startedAt)}</TableCell>
              <TableCell>{formatDate(job.completedAt)}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleView(job); }}><Eye className="h-4 w-4" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody></Table></CardContent></Card>
      )}
    </div>
  );
}

export function AuditLogTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { fetchLogs(); }, [integrationId, page]);

  const fetchLogs = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/audit?page=${page}&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalPages(data.totalPages || 1);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load audit log', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const actionLabels: Record<string, string> = {
    created: 'Created', connected: 'Connected', disconnected: 'Disconnected',
    credential_created: 'Credential Created', credential_rotated: 'Credential Rotated', credential_revoked: 'Credential Revoked',
    sharing_policy_created: 'Sharing Policy Created', sharing_policy_updated: 'Sharing Policy Updated',
    organization_mapped: 'Organization Mapped', organization_verified: 'Organization Verified',
    student_linked: 'Student Linked', identity_verified: 'Identity Verified', student_unlinked: 'Student Unlinked',
    identity_conflict_detected: 'Identity Conflict', event_retry: 'Event Retry',
    webhook_signature_failed: 'Webhook Signature Failed', data_requested: 'Data Requested',
  };

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="font-medium">Audit Log</h3>
      {logs.length === 0 ? (
        <Card><CardContent className="py-8 text-center"><Activity className="mx-auto h-12 w-12 text-muted-foreground mb-4" /><h4 className="font-medium mb-2">No audit entries</h4><p className="text-muted-foreground">Audit entries will appear here as integration actions occur.</p></CardContent></Card>
      ) : (
        <Card><CardContent><Table><TableHeader><TableRow><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Resource</TableHead><TableHead>Student</TableHead><TableHead>IP Address</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>
          {logs.map(log => (
            <TableRow key={log.id}>
              <TableCell><Badge variant="secondary">{actionLabels[log.action] || log.action}</Badge></TableCell>
              <TableCell className="text-sm">{log.actorId} <Badge variant="outline" className="ml-1">{log.actorType}</Badge></TableCell>
              <TableCell>{log.resourceType ? `${log.resourceType}${log.resourceId ? `: ${log.resourceId}` : ''}` : '-'}</TableCell>
              <TableCell>{log.studentId || '-'}</TableCell>
              <TableCell className="text-sm font-mono">{log.ipAddress || '-'}</TableCell>
              <TableCell>{formatDate(log.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody></Table>
        <div className="flex items-center justify-between mt-4">
          <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
        </div></CardContent></Card>
      )}
    </div>
  );
}

export function HealthTab({ integrationId }: { integrationId: string }) {
  const { getAccessToken } = useAuth();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchHealth(); }, [integrationId]);

  const fetchHealth = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/integrations/${integrationId}/health`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setHealth(data.health);
    } catch (e) { toast({ title: 'Error', description: 'Failed to load health', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  const healthCards = [
    { key: 'connection', label: 'Connection', icon: Database },
    { key: 'identityMapping', label: 'Identity Mapping', icon: Users },
    { key: 'synchronization', label: 'Synchronization', icon: RefreshCw },
    { key: 'eventDelivery', label: 'Event Delivery', icon: Activity },
    { key: 'credentialStatus', label: 'Credentials', icon: Shield },
  ] as const;

  if (loading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!health) return <Card><CardContent className="py-8 text-center">Failed to load health</CardContent></Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {healthCards.map(({ key, label, icon: Icon }) => (
          <Card key={key} className={health[key as keyof HealthStatus] === 'HEALTHY' || health[key as keyof HealthStatus] === 'VALID' ? 'border-success' : health[key as keyof HealthStatus] === 'DEGRADED' || health[key as keyof HealthStatus] === 'EXPIRING' ? 'border-warning' : 'border-destructive'}>
            <CardContent className="flex items-center gap-4">
              <Icon className={`h-8 w-8 ${health[key as keyof HealthStatus] === 'HEALTHY' || health[key as keyof HealthStatus] === 'VALID' ? 'text-success' : health[key as keyof HealthStatus] === 'DEGRADED' || health[key as keyof HealthStatus] === 'EXPIRING' ? 'text-warning' : 'text-destructive'}`} />
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="font-medium"><StatusBadge status={health[key as keyof HealthStatus] as string} /></p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card><CardHeader><CardTitle>Details</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <div><label className="text-sm font-medium text-muted-foreground">Pending Events</label><p className="font-mono text-2xl">{health.pendingEvents}</p></div>
        <div><label className="text-sm font-medium text-muted-foreground">Failed Events</label><p className="font-mono text-2xl text-destructive">{health.failedEvents}</p></div>
        <div><label className="text-sm font-medium text-muted-foreground">Dead Letter Events</label><p className="font-mono text-2xl text-destructive">{health.deadLetterEvents}</p></div>
        <div><label className="text-sm font-medium text-muted-foreground">Last Successful Sync</label><p>{health.lastSuccessfulSync ? formatDate(health.lastSuccessfulSync) : 'Never'}</p></div>
        {health.lastError && <div className="md:col-span-2"><label className="text-sm font-medium text-destructive">Last Error</label><p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{health.lastError}</p></div>}
      </CardContent></Card>
    </div>
  );
}
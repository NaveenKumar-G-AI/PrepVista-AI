'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, Shield, Database, Users, Activity, AlertCircle, CheckCircle, Info, ExternalLink, Lock, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

interface StudentIntegration {
  integration: {
    id: string;
    name: string;
    type: string;
    status: string;
    collegeId: string;
    sharingPolicy: {
      defaultScope: string;
      studentOptIn: boolean;
      autoApprove: boolean;
      scopes: string[];
      retentionDays: number;
    } | null;
  } | null;
  identityMapping: {
    id: string;
    externalStudentId: string;
    status: string;
    mappedAt: string;
    verifiedAt: string | null;
    revokedAt: string | null;
  } | null;
  lastProfileSync: string | null;
}

interface SharedDataPreview {
  scope: string;
  skillsCount: number;
  masteryCount: number;
  gapsCount: number;
  readinessRoles: string[];
  evidenceSummary: {
    assessmentCount: number;
    interviewCount: number;
    projectCount: number;
    totalEvidencePoints: number;
  };
  lastSynced: string | null;
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pending Setup',
  CONNECTING: 'Connecting...',
  ACTIVE: 'Active',
  DEGRADED: 'Degraded',
  DISCONNECTING: 'Disconnecting',
  DISCONNECTED: 'Disconnected',
  ERROR: 'Error',
};

const mappingStatusLabels: Record<string, string> = {
  PENDING: 'Pending Verification',
  VERIFIED: 'Verified',
  CONFLICT: 'Conflict Detected',
  REVOKED: 'Revoked',
  REJECTED: 'Rejected',
};

const scopeLabels: Record<string, string> = {
  MINIMAL: 'Minimal (Readiness Only)',
  STANDARD: 'Standard (Skills, Mastery, Readiness, Gaps)',
  DETAILED: 'Detailed (All + Evidence, Assessments, Growth)',
};

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
};

function StatusBadge({ status, labels }: { status: string; labels: Record<string, string> }) {
  const label = labels[status] || status;
  return <Badge variant={statusVariant[status] || 'default'}>{label}</Badge>;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return 'Never';
  return format(new Date(date), 'MMM d, yyyy HH:mm');
}

export function StudentIntegrationStatus() {
  const { user, loading: authLoading, getAccessToken } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<StudentIntegration | null>(null);
  const [preview, setPreview] = useState<SharedDataPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && !authLoading) {
      fetchData();
    }
  }, [user, authLoading]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getAccessToken();
      const res = await fetch('/api/student/integrations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setData(null);
          setPreview(null);
          return;
        }
        throw new Error('Failed to fetch');
      }
      const result = await res.json();
      setData(result.integration || null);
      setPreview(result.preview || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load integration status');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="py-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h4 className="font-medium mb-2">Failed to load integration status</h4>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={fetchData}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h4 className="font-medium mb-2">No Integration Connected</h4>
          <p className="text-muted-foreground mb-4">
            Your institution has not connected PrepVista yet. When they do, you'll see your data sharing status here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { integration, identityMapping, lastProfileSync } = data;
  const isActive = integration.status === 'ACTIVE';
  const isLinked = identityMapping && identityMapping.status === 'VERIFIED';
  const sharingPolicy = integration.sharingPolicy;

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className={isActive ? 'border-success' : 'border-warning'}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {integration.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {integration.type} Integration
              {integration.status === 'ACTIVE' && ' • Connected'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={integration.status} labels={statusLabels} />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Connection Status</p>
              <p className="font-medium flex items-center gap-2">
                <StatusBadge status={integration.status} labels={statusLabels} />
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Identity Mapping</p>
              <p className="font-medium flex items-center gap-2">
                {identityMapping ? (
                  <StatusBadge status={identityMapping.status} labels={mappingStatusLabels} />
                ) : (
                  <Badge variant="secondary">Not Linked</Badge>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Last Profile Sync</p>
              <p className="font-medium">{formatDate(lastProfileSync)}</p>
            </div>
          </div>

          {identityMapping && identityMapping.status === 'CONFLICT' && (
            <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Identity Conflict Detected</span>
              </div>
              <p className="text-sm mt-1 text-destructive/80">
                Multiple PrepVista identities appear to map to your CodeForge account. Please contact your institution administrator to resolve this.
              </p>
            </div>
          )}

          {identityMapping && identityMapping.status === 'PENDING' && (
            <div className="mt-4 p-3 bg-warning/10 border border-warning/20 rounded-lg">
              <div className="flex items-center gap-2 text-warning">
                <Info className="h-4 w-4" />
                <span className="font-medium">Identity Pending Verification</span>
              </div>
              <p className="text-sm mt-1 text-warning/80">
                Your identity mapping is awaiting administrator verification. Data sharing will begin once verified.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What is Shared Card */}
      {isActive && isLinked && sharingPolicy && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                What Data is Shared
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setShowDetails(!showDetails)}>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg"><Database className="h-5 w-5 text-primary" /></div>
                  <div>
                    <p className="font-medium">Sharing Scope</p>
                    <p className="text-sm text-muted-foreground">{scopeLabels[sharingPolicy.defaultScope] || sharingPolicy.defaultScope}</p>
                  </div>
                </div>
                <Badge variant="secondary">{sharingPolicy.defaultScope}</Badge>
              </div>

              <p className="text-sm text-muted-foreground">
                Your institution has configured the <strong>{scopeLabels[sharingPolicy.defaultScope] || sharingPolicy.defaultScope}</strong> sharing scope.
                {sharingPolicy.studentOptIn && ' You can opt out of sharing at any time.'}
              </p>

              {showDetails && (
                <div className="space-y-3 pt-3 border-t">
                  <h5 className="font-medium text-sm">Data Included in This Scope</h5>
                  <div className="grid gap-2 md:grid-cols-2">
                    {sharingPolicy.scopes.includes('MINIMAL') && (
                      <Badge variant="outline" className="text-left p-3">
                        <div className="font-medium">Minimal</div>
                        <div className="text-xs text-muted-foreground">Technical Readiness Only</div>
                      </Badge>
                    )}
                    {sharingPolicy.scopes.includes('STANDARD') && (
                      <Badge variant="outline" className="text-left p-3">
                        <div className="font-medium">Standard</div>
                        <div className="text-xs text-muted-foreground">Skills, Mastery, Role Readiness, Skill Gaps</div>
                      </Badge>
                    )}
                    {sharingPolicy.scopes.includes('DETAILED') && (
                      <Badge variant="outline" className="text-left p-3">
                        <div className="font-medium">Detailed</div>
                        <div className="text-xs text-muted-foreground">All Standard + Evidence Summary, Assessments, Interviews, Growth</div>
                      </Badge>
                    )}
                  </div>

                  <Separator />

                  <h5 className="font-medium text-sm">Data NOT Shared</h5>
                  <div className="grid gap-2 md:grid-cols-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Raw source code</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Private transcripts</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Audio recordings</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Hidden test cases</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Internal AI prompts & reasoning</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Security metadata</span></div>
                    <div className="flex items-center gap-2"><Lock className="h-4 w-4" /><span>Unrelated personal information</span></div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview Card */}
      {isActive && isLinked && preview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              Your Shared Data Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Skills Shared</p>
                <p className="font-medium text-2xl">{preview.skillsCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Mastery Levels</p>
                <p className="font-medium text-2xl">{preview.masteryCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Skill Gaps</p>
                <p className="font-medium text-2xl text-warning">{preview.gapsCount}</p>
              </div>
            </div>

            {preview.readinessRoles.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-muted-foreground">Role Readiness Shared</p>
                <div className="flex flex-wrap gap-2">
                  {preview.readinessRoles.map(role => (
                    <Badge key={role} variant="secondary">{role}</Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator className="my-4" />

            <div className="grid gap-4 md:grid-cols-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Assessments</p>
                <p className="font-medium">{preview.evidenceSummary.assessmentCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Interviews</p>
                <p className="font-medium">{preview.evidenceSummary.interviewCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Projects</p>
                <p className="font-medium">{preview.evidenceSummary.projectCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Evidence Points</p>
                <p className="font-medium">{preview.evidenceSummary.totalEvidencePoints}</p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Last synced: {formatDate(preview.lastSynced)}</p>
              <Badge variant="outline">Data Version: {preview.scope}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Your Rights Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Your Rights & Controls
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">CodeForge Remains the Authority</p>
                <p className="text-muted-foreground">All technical intelligence (skills, mastery, readiness, gaps) is calculated by CodeForge and shared as-is. PrepVista uses this for personalization only.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Minimum Necessary Data</p>
                <p className="text-muted-foreground">Only data required for placement preparation is shared. Raw code, private transcripts, and internal AI reasoning are never shared.</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Retention Control</p>
                <p className="text-muted-foreground">Shared data is retained for {sharingPolicy?.retentionDays || 'configured'} days per institutional policy, then automatically purged.</p>
              </div>
            </div>
            {sharingPolicy?.studentOptIn && (
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Opt-Out Available</p>
                  <p className="text-muted-foreground">You can request to stop data sharing at any time through your institution's administration.</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Transparency</p>
                <p className="text-muted-foreground">You can view exactly what data is being shared above. Contact your institution's admin for questions.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Integration Details (expandable) */}
      <Card>
        <CardHeader className="pb-2">
          <Button variant="ghost" className="w-full justify-between p-0" onClick={() => toggleSection('details')}>
            <span className="font-medium">Integration Details</span>
            {expandedSections.details ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardHeader>
        {expandedSections.details && (
          <CardContent className="pt-0 space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <div><span className="text-muted-foreground">Integration ID</span> <code className="ml-2 font-mono text-xs">{integration.id}</code></div>
              <div><span className="text-muted-foreground">Type</span> <span className="ml-2">{integration.type}</span></div>
              <div><span className="text-muted-foreground">College ID</span> <code className="ml-2 font-mono text-xs">{integration.collegeId}</code></div>
              <div><span className="text-muted-foreground">Status</span> <span className="ml-2"><StatusBadge status={integration.status} labels={statusLabels} /></span></div>
              {identityMapping && (
                <>
                  <div><span className="text-muted-foreground">External Student ID</span> <code className="ml-2 font-mono text-xs">{identityMapping.externalStudentId}</code></div>
                  <div><span className="text-muted-foreground">Mapping Status</span> <span className="ml-2"><StatusBadge status={identityMapping.status} labels={mappingStatusLabels} /></span></div>
                  <div><span className="text-muted-foreground">Mapped At</span> <span className="ml-2">{formatDate(identityMapping.mappedAt)}</span></div>
                  <div><span className="text-muted-foreground">Verified At</span> <span className="ml-2">{formatDate(identityMapping.verifiedAt)}</span></div>
                  {identityMapping.revokedAt && <div><span className="text-muted-foreground">Revoked At</span> <span className="ml-2 text-destructive">{formatDate(identityMapping.revokedAt)}</span></div>}
                </>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
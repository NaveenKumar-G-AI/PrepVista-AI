'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { Target, Brain, TrendingUp, Award, ArrowRight, RotateCcw, CheckCircle, Clock } from 'lucide-react';

interface Recommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  reason: string;
  priority: number;
  targetSkillId: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED' | 'EXPIRED';
  createdAt: string;
  completedAt: string | null;
  targetSkill?: {
    id: string;
    name: string;
    category: string;
  };
}

const typeConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  FOCUSED_INTERVIEW: { label: 'Focused Interview', icon: <Target className="h-4 w-4" />, color: 'text-blue-600 bg-blue-50 border-blue-200' },
  SKILL_PRACTICE: { label: 'Skill Practice', icon: <Brain className="h-4 w-4" />, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  REATTEMPT_WEAK_CATEGORY: { label: 'Reattempt Weak Category', icon: <RotateCcw className="h-4 w-4" />, color: 'text-orange-600 bg-orange-50 border-orange-200' },
  COMMUNICATION_DRILL: { label: 'Communication Drill', icon: <Award className="h-4 w-4" />, color: 'text-green-600 bg-green-50 border-green-200' },
  HIGHER_DIFFICULTY: { label: 'Higher Difficulty', icon: <TrendingUp className="h-4 w-4" />, color: 'text-red-600 bg-red-50 border-red-200' },
  REASSESS_READINESS: { label: 'Reassess Readiness', icon: <Brain className="h-4 w-4" />, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
};

const statusConfig = {
  PENDING: { label: 'Pending', variant: 'default' as const },
  IN_PROGRESS: { label: 'In Progress', variant: 'info' as const },
  COMPLETED: { label: 'Completed', variant: 'success' as const },
  DISMISSED: { label: 'Dismissed', variant: 'default' as const },
  EXPIRED: { label: 'Expired', variant: 'destructive' as const },
};

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'>('all');

  useEffect(() => {
    fetchRecommendations();
  }, []);

  async function fetchRecommendations() {
    try {
      setLoading(true);
      const res = await api.get<{ recommendations: Recommendation[] }>('/intelligence/recommendations?limit=50');
      setRecommendations(res.recommendations);
    } catch (error) {
      console.error('Failed to fetch recommendations', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: Recommendation['status']) {
    try {
      await api.patch(`/intelligence/recommendations/${id}`, { status });
      setRecommendations(prev =>
        prev.map(r => r.id === id ? { ...r, status, completedAt: status === 'COMPLETED' ? new Date().toISOString() : r.completedAt } : r)
      );
      toast(`Marked as ${status.toLowerCase().replace('_', ' ')}`, 'success');
    } catch (error) {
      toast('Failed to update status', 'error');
    }
  }

  const filtered = activeFilter === 'all'
    ? recommendations
    : recommendations.filter(r => r.status === activeFilter);

  const pendingCount = recommendations.filter(r => r.status === 'PENDING').length;
  const inProgressCount = recommendations.filter(r => r.status === 'IN_PROGRESS').length;
  const completedCount = recommendations.filter(r => r.status === 'COMPLETED').length;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="h-24 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Action Center</h1>
          <p className="text-muted-foreground">Personalized recommendations to improve your interview readiness</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeFilter}
            onChange={e => setActiveFilter(e.target.value as any)}
            className="px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All ({recommendations.length})</option>
            <option value="PENDING">Pending ({pendingCount})</option>
            <option value="IN_PROGRESS">In Progress ({inProgressCount})</option>
            <option value="COMPLETED">Completed ({completedCount})</option>
          </select>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="Pending"
          value={pendingCount}
          color="text-blue-600"
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="In Progress"
          value={inProgressCount}
          color="text-orange-600"
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="Completed"
          value={completedCount}
          color="text-green-600"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">
              {activeFilter === 'all' ? 'No Recommendations Yet' : `No ${activeFilter.toLowerCase()} Recommendations`}
            </h3>
            <p className="mt-2 text-muted-foreground">
              {activeFilter === 'all'
                ? 'Complete an assessment to receive personalized action items.'
                : 'Try changing the filter or complete more actions.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered
            .sort((a, b) => {
              // Sort by status (pending first), then priority
              const statusOrder = { PENDING: 0, IN_PROGRESS: 1, COMPLETED: 2, DISMISSED: 3, EXPIRED: 4 };
              const statusDiff = statusOrder[a.status] - statusOrder[b.status];
              if (statusDiff !== 0) return statusDiff;
              return a.priority - b.priority;
            })
            .map(rec => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                onStatusChange={updateStatus}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${color} bg-current/10`}>
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendationCard({ recommendation, onStatusChange }: { recommendation: Recommendation; onStatusChange: (id: string, status: Recommendation['status']) => void }) {
  const config = typeConfig[recommendation.type] || { label: recommendation.type, icon: <Brain className="h-4 w-4" />, color: 'text-muted-foreground' };
  const status = statusConfig[recommendation.status];

  return (
    <Card className={recommendation.status === 'COMPLETED' ? 'opacity-60' : ''}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-lg border ${config.color} flex items-center justify-center`}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold">{recommendation.title}</h4>
              <Badge variant="secondary">{config.label}</Badge>
              <Badge variant="outline">Priority {recommendation.priority}</Badge>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{recommendation.description}</p>
            <p className="mt-2 text-sm text-primary/80"><strong>Reason:</strong> {recommendation.reason}</p>
            {recommendation.targetSkill && (
              <p className="mt-1 text-sm">
                <Badge variant="outline" className="mr-1">{recommendation.targetSkill.category}</Badge>
                <Badge variant="outline">{recommendation.targetSkill.name}</Badge>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {recommendation.status === 'PENDING' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onStatusChange(recommendation.id, 'IN_PROGRESS')}
                >
                  Start
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onStatusChange(recommendation.id, 'DISMISSED')}
                >
                  Dismiss
                </Button>
              </>
            )}
            {recommendation.status === 'IN_PROGRESS' && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => onStatusChange(recommendation.id, 'COMPLETED')}
                >
                  <CheckCircle className="mr-2 h-3.5 w-3.5" />
                  Complete
                </Button>
              </>
            )}
            {recommendation.status === 'COMPLETED' && (
              <Badge variant="success">Completed</Badge>
            )}
            {recommendation.status === 'DISMISSED' && (
              <Badge variant="outline">Dismissed</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadarChart } from '@/components/ui/chart';
import { api } from '@/lib/api';
import {
  Brain,
  TrendingUp,
  Target,
  AlertTriangle,
  Clock,
  Award,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { formatDate, calculatePercentage, getInitials } from '@/lib/utils';
import { StudentIntegrationStatus } from '@/components/integrations/StudentIntegrationStatus';

interface ReadinessData {
  overallReadiness: number;
  dimensionScores: Array<{ dimension: string; score: number; evidence: string[] }>;
  topWeaknesses: Array<{
    skillId: string;
    skillName: string;
    category: string;
    severity: 'CRITICAL' | 'MODERATE' | 'MILD';
    confidence: string;
    evidence: string[];
    trend: string;
  }>;
  recommendedActions: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    reason: string;
    priority: number;
    targetSkillId?: string;
  }>;
  evidenceConfidence: string;
  assessmentsCompleted: number;
  lastAssessmentDate: string | null;
  trendDirection: string;
}

interface SkillNode {
  id: string;
  name: string;
  parentId: string | null;
  category: string;
  proficiency: number | null;
  confidence: string;
  evidenceCount: number;
}

export default function DashboardPage() {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [skillGraph, setSkillGraph] = useState<SkillNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'readiness' | 'skills' | 'recommendations'>('readiness');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [readinessRes, skillsRes] = await Promise.all([
          api.get<{ readiness: ReadinessData }>('/intelligence/readiness'),
          api.get<{ skillGraph: SkillNode[] }>('/intelligence/skills'),
        ]);
        setReadiness(readinessRes.readiness);
        setSkillGraph(skillsRes.skillGraph);
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <DashboardSkeleton />
        <DashboardSkeleton />
        <DashboardSkeleton />
      </div>
    );
  }

  if (error || !readiness) {
    return (
      <div className="text-center py-12">
        <Brain className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold">Unable to Load Dashboard</h2>
        <p className="mt-2 text-muted-foreground">{error || 'No data available. Complete an assessment to get started.'}</p>
        <Button onClick={() => window.location.href = '/assessments'} className="mt-4">
          Take Assessment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your personalized interview readiness overview
          </p>
        </div>
        <Button onClick={() => window.location.href = '/assessments/new'}>
          <Target className="mr-2 h-4 w-4" />
          New Assessment
        </Button>
      </div>

      {/* Integration Status */}
      <StudentIntegrationStatus />

      {/* Overall Readiness Card */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10" />
        <CardContent className="relative p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Main Score */}
            <div className="sm:col-span-2 lg:col-span-1 flex flex-col items-center text-center sm:items-start sm:text-left">
              <div className="relative mb-4">
                <svg width="120" height="120" className="transform -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="hsl(var(--muted))"
                    strokeWidth="8"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${calculatePercentage(readiness.overallReadiness, 100) * 3.14} 314`}
                    style={{ strokeDashoffset: 314 }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl font-bold">{readiness.overallReadiness}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Overall Readiness</p>
                <div className="flex items-center gap-2 mt-1">
                  <TrendingUp className={`h-4 w-4 ${readiness.trendDirection === 'IMPROVING' ? 'text-green-500' : readiness.trendDirection === 'DECLINING' ? 'text-red-500' : 'text-muted-foreground'}`} />
                  <span className="text-sm font-medium capitalize">
                    {readiness.trendDirection.replace('_', ' ').toLowerCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-4">
              <StatItem
                icon={<Award className="h-5 w-5" />}
                label="Assessments"
                value={readiness.assessmentsCompleted}
              />
              <StatItem
                icon={<Clock className="h-5 w-5" />}
                label="Last Assessment"
                value={readiness.lastAssessmentDate ? formatDate(readiness.lastAssessmentDate) : 'Never'}
              />
            </div>

            <div className="space-y-4">
              <StatItem
                icon={<Brain className="h-5 w-5" />}
                label="Evidence Confidence"
                value={readiness.evidenceConfidence}
              />
              <StatItem
                icon={<AlertTriangle className="h-5 w-5" />}
                label="Top Weaknesses"
                value={readiness.topWeaknesses.length}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dimension Scores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Dimension Scores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {readiness.dimensionScores.map(dim => (
              <DimensionCard key={dim.dimension} dimension={dim} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs for Skills, Weaknesses, Recommendations */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="readiness">Readiness Details</TabsTrigger>
          <TabsTrigger value="skills">Skill Graph</TabsTrigger>
          <TabsTrigger value="recommendations">Action Center</TabsTrigger>
        </TabsList>

        <TabsContent value="readiness" className="space-y-6">
          {/* Top Weaknesses */}
          {readiness.topWeaknesses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Priority Weaknesses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {readiness.topWeaknesses.map((weakness, index) => (
                    <WeaknessCard key={weakness.skillId} weakness={weakness} index={index} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Evidence Confidence Notice */}
          {readiness.evidenceConfidence === 'INSUFFICIENT' && (
            <Card className="border-yellow-300 bg-yellow-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-yellow-900">Insufficient Evidence</p>
                    <p className="text-sm text-yellow-700">
                      Complete more assessments to get accurate skill analysis and personalized recommendations.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="skills">
          <SkillGraphView skills={skillGraph} />
        </TabsContent>

        <TabsContent value="recommendations">
          <RecommendationsView recommendations={readiness.recommendedActions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}

function DimensionCard({ dimension }: { dimension: { dimension: string; score: number; evidence: string[] } }) {
  const colors: Record<string, string> = {
    TECHNICAL: 'hsl(var(--primary))',
    PROBLEM_SOLVING: 'hsl(var(--primary))',
    COMMUNICATION: 'hsl(142 76% 36%)',
    BEHAVIORAL: 'hsl(262 83% 58%)',
    CONFIDENCE: 'hsl(38 92% 50%)',
    ROLE_RELEVANCE: 'hsl(199 89% 48%)',
  };

  return (
    <div className="p-4 rounded-lg border border-border/50 bg-background">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{dimension.dimension.replace('_', ' ')}</span>
        <span className="text-2xl font-bold" style={{ color: colors[dimension.dimension] }}>
          {dimension.score}
        </span>
      </div>
      <Progress value={dimension.score} className="h-2" />
      <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
        {dimension.evidence.join('; ') || 'No evidence available'}
      </div>
    </div>
  );
}

function WeaknessCard({ weakness, index }: { weakness: any; index: number }) {
  const severityColors = {
    CRITICAL: 'text-red-600 bg-red-50 border-red-200',
    MODERATE: 'text-orange-600 bg-orange-50 border-orange-200',
    MILD: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  };

  const severityIcons = {
    CRITICAL: <AlertTriangle className="h-4 w-4" />,
    MODERATE: <AlertTriangle className="h-4 w-4" />,
    MILD: <Target className="h-4 w-4" />,
  };

  return (
    <div className={`p-4 rounded-lg border ${severityColors[weakness.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {severityIcons[weakness.severity]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{weakness.skillName}</span>
            <Badge variant="outline" className="text-xs">{weakness.category}</Badge>
            <Badge variant="outline" className="text-xs capitalize">{weakness.severity.toLowerCase()}</Badge>
            <Badge variant="outline" className="text-xs">{weakness.confidence}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {weakness.evidence[0] || 'No evidence available'}
          </p>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 capitalize">{weakness.trend.toLowerCase()} trend</span>
            <span>{weakness.evidence.length} evidence points</span>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SkillGraphView({ skills }: { skills: SkillNode[] }) {
  // Flatten skills for radar chart
  const categorySkills = skills.filter(s => !s.parentId && s.proficiency !== null);
  const radarData = categorySkills.map(s => ({
    subject: s.name,
    score: s.proficiency || 0,
    fullMark: 100,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Skill Proficiency Radar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <RadarChart data={radarData} />
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Shows proficiency across top-level skill categories. Grey area = average benchmark.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detailed Skill Tree</CardTitle>
        </CardHeader>
        <CardContent>
          <SkillTree skills={skills} />
        </CardContent>
      </Card>
    </div>
  );
}

function SkillTree({ skills }: { skills: SkillNode[] }) {
  const roots = skills.filter(s => !s.parentId);
  const childrenMap = new Map<string, SkillNode[]>();
  skills.forEach(s => {
    if (s.parentId) {
      const arr = childrenMap.get(s.parentId) || [];
      arr.push(s);
      childrenMap.set(s.parentId, arr);
    }
  });

  const getConfidenceColor = (conf: string) => {
    switch (conf) {
      case 'HIGH': return 'text-green-600';
      case 'MEDIUM': return 'text-yellow-600';
      case 'LOW': return 'text-orange-600';
      default: return 'text-muted-foreground';
    }
  };

  const renderNode = (skill: SkillNode, depth: number = 0) => {
    const children = childrenMap.get(skill.id) || [];
    const hasChildren = children.length > 0;

    return (
      <div key={skill.id} className="space-y-1" style={{ paddingLeft: `${depth * 1.5}rem` }}>
        <div className="flex items-center gap-3 py-2">
          {hasChildren && (
            <span className="text-muted-foreground">├─</span>
          )}
          <div className="flex-1 flex items-center gap-3 min-w-0">
            <span className="font-medium truncate">{skill.name}</span>
            {skill.proficiency !== null && (
              <>
                <Progress value={skill.proficiency} className="w-32 h-1.5" />
                <span className="text-sm font-mono" style={{ color: `hsl(${120 - skill.proficiency * 1.2}, 70%, 40%)` }}>
                  {skill.proficiency}%
                </span>
              </>
            )}
            {skill.proficiency === null && (
              <Badge variant="outline" className="text-xs">
                No data
              </Badge>
            )}
            <Badge variant="outline" className={`text-xs ${getConfidenceColor(skill.confidence)}`}>
              {skill.confidence}
            </Badge>
          </div>
        </div>
        {children.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
      {roots.map(root => renderNode(root))}
    </div>
  );
}

function RecommendationsView({ recommendations }: { recommendations: any[] }) {
  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">No Recommendations Yet</h3>
          <p className="mt-2 text-muted-foreground">
            Complete an assessment to receive personalized action items.
          </p>
          <Button onClick={() => window.location.href = '/assessments/new'} className="mt-4">
            Take Assessment
          </Button>
        </CardContent>
      </Card>
    );
  }

  const typeIcons: Record<string, React.ReactNode> = {
    FOCUSED_INTERVIEW: <Target className="h-4 w-4" />,
    SKILL_PRACTICE: <Brain className="h-4 w-4" />,
    REATTEMPT_WEAK_CATEGORY: <TrendingUp className="h-4 w-4" />,
    COMMUNICATION_DRILL: <Award className="h-4 w-4" />,
    HIGHER_DIFFICULTY: <ArrowRight className="h-4 w-4" />,
    REASSESS_READINESS: <Brain className="h-4 w-4" />,
  };

  const typeLabels: Record<string, string> = {
    FOCUSED_INTERVIEW: 'Focused Interview',
    SKILL_PRACTICE: 'Skill Practice',
    REATTEMPT_WEAK_CATEGORY: 'Reattempt Weak Category',
    COMMUNICATION_DRILL: 'Communication Drill',
    HIGHER_DIFFICULTY: 'Higher Difficulty',
    REASSESS_READINESS: 'Reassess Readiness',
  };

  return (
    <div className="space-y-4">
      {recommendations
        .sort((a, b) => a.priority - b.priority)
        .map((rec, index) => (
          <Card key={rec.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  {typeIcons[rec.type] || <Brain className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{rec.title}</h4>
                    <Badge variant="secondary">{typeLabels[rec.type] || rec.type}</Badge>
                    <Badge variant="outline">Priority {rec.priority}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{rec.description}</p>
                  <p className="mt-2 text-sm text-primary/80"><strong>Reason:</strong> {rec.reason}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">Start</Button>
                  <Button variant="ghost" size="icon">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="h-32 w-32 mx-auto rounded-full bg-muted animate-pulse" />
          </div>
          <div className="space-y-4">
            <div className="h-20 w-full bg-muted animate-pulse rounded-lg" />
            <div className="h-20 w-full bg-muted animate-pulse rounded-lg" />
          </div>
          <div className="space-y-4">
            <div className="h-20 w-full bg-muted animate-pulse rounded-lg" />
            <div className="h-20 w-full bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
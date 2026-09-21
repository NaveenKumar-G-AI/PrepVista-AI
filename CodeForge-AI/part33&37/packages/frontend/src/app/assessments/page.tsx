'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  Plus,
  Play,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  ExternalLink,
} from 'lucide-react';

type AssessmentType = 'TECHNICAL' | 'BEHAVIORAL' | 'COMMUNICATION' | 'COMBINED';
type AssessmentStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'EXPIRED';

interface Assessment {
  id: string;
  type: AssessmentType;
  difficulty: string;
  targetRole: string | null;
  status: AssessmentStatus;
  questionCount: number;
  timeLimitMinutes: number;
  overallScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  questions: Array<{
    id: string;
    answer: string | null;
    score: number | null;
  }>;
  student: {
    user: { name: string; email: string };
  };
}

const statusConfig: Record<AssessmentStatus, { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'info'; icon: React.ReactNode }> = {
  CREATED: { label: 'Created', variant: 'default', icon: <Clock className="h-3 w-3" /> },
  IN_PROGRESS: { label: 'In Progress', variant: 'info', icon: <Play className="h-3 w-3" /> },
  COMPLETED: { label: 'Completed', variant: 'success', icon: <CheckCircle className="h-3 w-3" /> },
  PROCESSING: { label: 'Processing', variant: 'warning', icon: <Clock className="h-3 w-3 animate-spin" /> },
  FAILED: { label: 'Failed', variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  EXPIRED: { label: 'Expired', variant: 'default', icon: <Clock className="h-3 w-3" /> },
};

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchAssessments();
  }, [page]);

  async function fetchAssessments() {
    try {
      setLoading(true);
      const res = await api.get<{ assessments: Assessment[]; pagination: { totalPages: number } }>(
        `/assessments?page=${page}&limit=10`
      );
      setAssessments(res.assessments);
      setTotalPages(res.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch assessments', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAssessment(id: string) {
    if (!confirm('Are you sure you want to delete this assessment?')) return;
    try {
      await api.delete(`/assessments/${id}`);
      setAssessments(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      alert('Failed to delete assessment');
    }
  }

  const getProgress = (assessment: Assessment) => {
    if (!assessment.questions.length) return 0;
    const answered = assessment.questions.filter(q => q.answer).length;
    return Math.round((answered / assessment.questions.length) * 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assessments</h1>
          <p className="text-muted-foreground">Your interview practice history</p>
        </div>
        <Link href="/assessments/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Assessment
          </Button>
        </Link>
      </div>

      {loading ? (
        <AssessmentsSkeleton />
      ) : assessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">No Assessments Yet</h3>
            <p className="mt-2 text-muted-foreground">
              Start your interview preparation journey with your first assessment.
            </p>
            <Link href="/assessments/new">
              <Button className="mt-4">
                <Plus className="mr-2 h-4 w-4" />
                Create Assessment
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {assessments.map(assessment => {
              const config = statusConfig[assessment.status];
              const progress = getProgress(assessment);
              const isActive = assessment.status === 'IN_PROGRESS';

              return (
                <Card key={assessment.id}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Status & Type */}
                      <div className="flex items-center gap-3">
                        <Badge variant={config.variant} className="gap-1">
                          {config.icon}
                          {config.label}
                        </Badge>
                        <Badge variant="outline">{assessment.type}</Badge>
                        <Badge variant="outline">{assessment.difficulty}</Badge>
                      </div>

                      {/* Details */}
                      <div className="flex-1 grid gap-4 sm:grid-cols-3 text-sm text-muted-foreground">
                        <div>
                          <p className="font-medium">Target Role</p>
                          <p>{assessment.targetRole || 'General'}</p>
                        </div>
                        <div>
                          <p className="font-medium">Questions</p>
                          <p>{assessment.questions.length}/{assessment.questionCount}</p>
                        </div>
                        <div>
                          <p className="font-medium">Time Limit</p>
                          <p>{assessment.timeLimitMinutes} min</p>
                        </div>
                      </div>

                      {/* Progress */}
                      <div className="w-full sm:w-48">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <Progress value={progress} />
                      </div>

                      {/* Score */}
                      <div className="w-full sm:w-32 text-center">
                        {assessment.overallScore !== null ? (
                          <>
                            <p className="text-sm text-muted-foreground">Score</p>
                            <p className="text-2xl font-bold">{assessment.overallScore}</p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">Pending</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <Link href={`/assessments/${assessment.id}`}>
                            <Button>Continue</Button>
                          </Link>
                        )}
                        {assessment.status === 'COMPLETED' && (
                          <Link href={`/assessments/${assessment.id}`}>
                            <Button variant="outline">View Results</Button>
                          </Link>
                        )}
                        {assessment.status === 'CREATED' && (
                          <Link href={`/assessments/${assessment.id}`}>
                            <Button variant="outline">Start</Button>
                          </Link>
                        )}
                        {(assessment.status === 'CREATED' || assessment.status === 'COMPLETED' || assessment.status === 'FAILED') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAssessment(assessment.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Metadata */}
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span>Created: {formatDateTime(assessment.createdAt)}</span>
                      {assessment.startedAt && <span>Started: {formatDateTime(assessment.startedAt)}</span>}
                      {assessment.completedAt && <span>Completed: {formatDateTime(assessment.completedAt)}</span>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AssessmentsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="h-6 w-24 bg-muted animate-pulse rounded" />
              <div className="flex-1 grid gap-4 sm:grid-cols-3">
                <div className="h-16 bg-muted animate-pulse rounded" />
                <div className="h-16 bg-muted animate-pulse rounded" />
                <div className="h-16 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
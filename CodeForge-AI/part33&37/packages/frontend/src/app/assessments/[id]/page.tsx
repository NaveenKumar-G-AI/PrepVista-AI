'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/utils';
import {
  ArrowLeft,
  Send,
  Clock,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface Question {
  id: string;
  questionText: string;
  category: string;
  difficulty: string;
  expectedSkills: string[];
  answer: string | null;
  score: number | null;
  feedback: string | null;
  timeSpentSeconds: number | null;
  order: number;
}

interface Assessment {
  id: string;
  type: string;
  difficulty: string;
  targetRole: string | null;
  status: string;
  questionCount: number;
  timeLimitMinutes: number;
  overallScore: number | null;
  startedAt: string | null;
  completedAt: string | null;
  questions: Question[];
}

export default function AssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const assessmentId = params.id as string;

  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answer, setAnswer] = useState('');
  const [timeSpent, setTimeSpent] = useState(0);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchAssessment();
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [assessmentId]);

  async function fetchAssessment() {
    try {
      setLoading(true);
      const res = await api.get<{ assessment: Assessment }>(`/assessments/${assessmentId}`);
      setAssessment(res.assessment);

      // Start timer if in progress
      if (res.assessment.status === 'IN_PROGRESS') {
        startTimer();
      }
    } catch (err: any) {
      toast(err.message || 'Failed to load assessment', 'error');
      router.push('/assessments');
    } finally {
      setLoading(false);
    }
  }

  function startTimer() {
    const interval = setInterval(() => {
      setTimeSpent(t => t + 1);
    }, 1000);
    setTimer(interval);
  }

  function stopTimer() {
    if (timer) clearInterval(timer);
  }

  const currentQuestion = assessment?.questions[currentQuestionIndex];

  async function handleSubmitAnswer() {
    if (!currentQuestion || !answer.trim()) {
      toast('Please provide an answer', 'warning');
      return;
    }

    stopTimer();
    setSubmitting(true);

    try {
      const res = await api.post<{
        score: number;
        feedback: string;
        isComplete: boolean;
      }>(`/assessments/${assessmentId}/answer`, {
        questionId: currentQuestion.id,
        answer: answer.trim(),
        timeSpentSeconds: timeSpent,
      });

      // Update local state
      setAssessment(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: prev.questions.map(q =>
            q.id === currentQuestion.id
              ? { ...q, answer: answer.trim(), score: res.score, feedback: res.feedback, timeSpentSeconds: timeSpent }
              : q
          ),
          status: res.isComplete ? 'PROCESSING' : prev.status,
        };
      });

      toast(`Score: ${res.score}/100`, 'success');

      if (res.isComplete) {
        // Wait for processing then redirect to results
        setTimeout(() => router.push(`/assessments/${assessmentId}`), 2000);
      } else {
        // Move to next unanswered question
        const nextUnanswered = assessment?.questions.findIndex(
          (q, i) => i > currentQuestionIndex && !q.answer
        );
        if (nextUnanswered !== -1) {
          setCurrentQuestionIndex(nextUnanswered);
          setAnswer('');
          setTimeSpent(0);
          startTimer();
        }
      }
    } catch (err: any) {
      toast(err.message || 'Failed to submit answer', 'error');
      startTimer();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStartAssessment() {
    try {
      await api.post(`/assessments/${assessmentId}/start`);
      setAssessment(prev => prev ? { ...prev, status: 'IN_PROGRESS' } : null);
      startTimer();
    } catch (err: any) {
      toast(err.message || 'Failed to start assessment', 'error');
    }
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTimeLimit(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <AssessmentSkeleton />
      </div>
    );
  }

  if (!assessment) return null;

  const answeredCount = assessment.questions.filter(q => q.answer).length;
  const progress = assessment.questions.length > 0
    ? Math.round((answeredCount / assessment.questions.length) * 100)
    : 0;

  // Show results if completed
  if (assessment.status === 'COMPLETED' || assessment.status === 'FAILED') {
    return (
      <AssessmentResults assessment={assessment} />
    );
  }

  // Show processing state
  if (assessment.status === 'PROCESSING') {
    return (
      <div className="max-w-3xl mx-auto text-center py-12">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
        <h2 className="mt-4 text-xl font-semibold">Processing Your Assessment</h2>
        <p className="mt-2 text-muted-foreground">
          Our AI is analyzing your responses and computing detailed scores.
          This usually takes a few seconds.
        </p>
        <Button
          variant="outline"
          onClick={() => router.refresh()}
          className="mt-6"
        >
          Refresh
        </Button>
      </div>
    );
  }

  // Not started yet
  if (assessment.status === 'CREATED') {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/assessments">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{assessment.type} Assessment</h1>
            <p className="text-muted-foreground">
              {assessment.questionCount} questions • {formatTimeLimit(assessment.timeLimitMinutes)} time limit
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ready to Begin?</CardTitle>
            <CardDescription>
              This assessment contains {assessment.questionCount} questions covering {assessment.type.toLowerCase()} topics.
              You'll have {formatTimeLimit(assessment.timeLimitMinutes)} to complete it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{assessment.type}</Badge>
                <Badge variant="outline">{assessment.difficulty}</Badge>
                {assessment.targetRole && <Badge variant="secondary">{assessment.targetRole}</Badge>}
              </div>
              <Button onClick={handleStartAssessment} size="lg" className="w-full">
                <CheckCircle className="mr-2 h-4 w-4" />
                Start Assessment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // In progress - show current question
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/assessments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 text-center">
          <h1 className="text-xl font-semibold">{assessment.type} Assessment</h1>
          <p className="text-sm text-muted-foreground">
            Question {currentQuestionIndex + 1} of {assessment.questions.length}
          </p>
        </div>
        <div className="w-10" />
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm font-mono">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{answeredCount}/{assessment.questions.length} answered</span>
            <Clock className="h-4 w-4" />
            <span>{formatTime(timeSpent)} / {formatTimeLimit(assessment.timeLimitMinutes)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Question Navigation */}
      <div className="flex flex-wrap gap-1">
        {assessment.questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => {
              setCurrentQuestionIndex(i);
              setAnswer(q.answer || '');
              setTimeSpent(q.timeSpentSeconds || 0);
            }}
            className={`h-8 w-8 rounded border text-sm font-medium transition-colors ${
              i === currentQuestionIndex
                ? 'border-primary bg-primary text-primary-foreground'
                : q.answer
                ? 'border-green-500 bg-green-50 text-green-600'
                : 'border-border hover:border-primary/50'
            }`}
            aria-label={`Question ${i + 1}`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current Question */}
      {currentQuestion && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{currentQuestion.category}</Badge>
              <Badge variant="outline">{currentQuestion.difficulty}</Badge>
            </div>
            <CardTitle className="mt-2">{currentQuestion.questionText}</CardTitle>
            {currentQuestion.expectedSkills.length > 0 && (
              <CardDescription>
                Expected skills: {currentQuestion.expectedSkills.join(', ')}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Type your answer here..."
              className="min-h-[200px] font-mono text-base"
              rows={10}
              disabled={submitting}
            />

            {currentQuestion.answer && (
              <div className="mt-4 p-4 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center gap-2 text-green-800 mb-2">
                  <CheckCircle className="h-4 w-4" />
                  <span className="font-medium">Answer Submitted</span>
                  <Badge variant="success">Score: {currentQuestion.score}/100</Badge>
                </div>
                <p className="text-sm text-green-700">{currentQuestion.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation & Submit */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
          disabled={currentQuestionIndex === 0}
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Previous
        </Button>

        {currentQuestion && !currentQuestion.answer && (
          <Button
            onClick={handleSubmitAnswer}
            disabled={submitting || !answer.trim()}
            size="lg"
            className="w-full sm:w-auto"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit Answer
                <Send className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function AssessmentResults({ assessment }: { assessment: Assessment }) {
  const answeredCount = assessment.questions.filter(q => q.answer).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/assessments">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {assessment.status === 'COMPLETED' ? 'Assessment Complete' : 'Assessment Failed'}
          </h1>
          <p className="text-muted-foreground">
            {assessment.status === 'COMPLETED'
              ? `Scored ${assessment.overallScore}/100 • ${answeredCount}/${assessment.questions.length} questions`
              : 'Something went wrong. Please try again.'}
          </p>
        </div>
      </div>

      {assessment.status === 'COMPLETED' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Your Score</CardTitle>
            </CardHeader>
            <CardContent className="text-center py-4">
              <div className="text-6xl font-bold text-primary">{assessment.overallScore}</div>
              <div className="mt-2 text-muted-foreground">out of 100</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Question Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assessment.questions.map((q, i) => (
                  <div key={q.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                    <span className="w-8 text-center text-sm text-muted-foreground">Q{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{q.questionText}</p>
                      <p className="text-sm text-muted-foreground">{q.category} • {q.difficulty}</p>
                    </div>
                    {q.score !== null ? (
                      <Badge variant={q.score >= 70 ? 'success' : q.score >= 40 ? 'warning' : 'destructive'}>
                        {q.score}/100
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not Answered</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="flex-1">
                View Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/assessments">
              <Button size="lg" variant="outline" className="flex-1">
                Back to Assessments
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function AssessmentSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="h-8 w-1/3 bg-muted animate-pulse rounded" />
        <div className="h-4 w-full bg-muted animate-pulse rounded" />
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-40 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}
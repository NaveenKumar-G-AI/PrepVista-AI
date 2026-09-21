'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { ArrowRight, Brain, Loader2 } from 'lucide-react';

type AssessmentType = 'TECHNICAL' | 'BEHAVIORAL' | 'COMMUNICATION' | 'COMBINED';
type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT';

const typeOptions: { value: AssessmentType; label: string; description: string }[] = [
  { value: 'TECHNICAL', label: 'Technical', description: 'Code, algorithms, system design, debugging' },
  { value: 'BEHAVIORAL', label: 'Behavioral', description: 'STAR method, leadership, teamwork, conflicts' },
  { value: 'COMMUNICATION', label: 'Communication', description: 'Technical explanation, clarity, articulation' },
  { value: 'COMBINED', label: 'Combined', description: 'Mixed technical, behavioral, and communication' },
];

const difficultyOptions: { value: DifficultyLevel; label: string; description: string }[] = [
  { value: 'EASY', label: 'Easy', description: 'Fundamental concepts, basic problem solving' },
  { value: 'MEDIUM', label: 'Medium', description: 'Standard interview difficulty, typical questions' },
  { value: 'HARD', label: 'Hard', description: 'Advanced topics, complex problem solving' },
  { value: 'EXPERT', label: 'Expert', description: 'Senior-level, architecture, deep expertise' },
];

export default function NewAssessmentPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    type: 'COMBINED' as AssessmentType,
    difficulty: 'MEDIUM' as DifficultyLevel,
    targetRole: '',
    questionCount: 5,
    timeLimitMinutes: 30,
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'questionCount' || name === 'timeLimitMinutes' ? parseInt(value, 10) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post<{ assessment: { id: string } }>('/assessments', formData);
      toast('Assessment created! Redirecting...', 'success');
      router.push(`/assessments/${res.assessment.id}`);
    } catch (err: any) {
      toast(err.message || 'Failed to create assessment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create New Assessment</h1>
        <p className="text-muted-foreground">
          Configure your interview practice session
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assessment Type</CardTitle>
          <CardDescription>Choose the focus area for your interview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {typeOptions.map(opt => (
              <TypeOptionCard
                key={opt.value}
                option={opt}
                selected={formData.type === opt.value}
                onClick={() => setFormData(prev => ({ ...prev, type: opt.value }))}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Difficulty Level</CardTitle>
          <CardDescription>Select based on your current preparation level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {difficultyOptions.map(opt => (
              <TypeOptionCard
                key={opt.value}
                option={opt}
                selected={formData.difficulty === opt.value}
                onClick={() => setFormData(prev => ({ ...prev, difficulty: opt.value }))}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customization</CardTitle>
          <CardDescription>Fine-tune your assessment parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="targetRole" className="text-sm font-medium">
              Target Role (Optional)
            </label>
            <Input
              id="targetRole"
              name="targetRole"
              placeholder="e.g., Software Engineer, Frontend Developer, Data Scientist"
              value={formData.targetRole}
              onChange={handleChange}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="questionCount" className="text-sm font-medium">
                Number of Questions
              </label>
              <Select name="questionCount" value={String(formData.questionCount)} onValueChange={handleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[3, 5, 7, 10, 15].map(n => (
                    <SelectItem key={n} value={String(n)}>{n} questions</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="timeLimitMinutes" className="text-sm font-medium">
                Time Limit (Minutes)
              </label>
              <Select name="timeLimitMinutes" value={String(formData.timeLimitMinutes)} onValueChange={handleChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 20, 30, 45, 60].map(m => (
                    <SelectItem key={m} value={String(m)}>{m} minutes</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={loading} size="lg" className="w-full sm:w-auto">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create Assessment
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function TypeOptionCard({ option, selected, onClick }: { option: { value: string; label: string; description: string }; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all text-left ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50 hover:bg-muted/30'
      }`}
    >
      <div className="font-medium">{option.label}</div>
      <div className="mt-1 text-sm text-muted-foreground">{option.description}</div>
      {selected && (
        <div className="mt-2 flex items-center gap-1 text-primary text-sm">
          <Brain className="h-3.5 w-3.5" />
          Selected
        </div>
      )}
    </button>
  );
}
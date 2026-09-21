'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Brain, TrendingUp, Target, Users, Shield } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsAuthenticated(!!token);
  }, []);

  if (isAuthenticated) {
    // Redirect to dashboard if authenticated
    useEffect(() => {
      router.push('/dashboard');
    }, [router]);
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/50">
      {/* Navigation */}
      <nav className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">PrepVista</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/register">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-20 lg:py-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <Badge variant="secondary" className="mb-6 text-base px-4 py-2">
              Next-Generation AI Interview Intelligence
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Interview Preparation That
              <br />
              <span className="text-primary">Actually Understands You</span>
            </h1>
            <p className="mb-8 text-lg text-muted-foreground sm:text-xl">
              Move beyond generic practice. Get evidence-based skill analysis, personalized recommendations,
              and adaptive coaching that evolves with your progress.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register">
                <Button size="xl" className="w-full sm:w-auto">
                  Start Free Assessment
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="#features">
                <Button size="xl" variant="outline" className="w-full sm:w-auto">
                  See How It Works
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">Intelligence That Adapts to You</h2>
            <p className="text-muted-foreground text-lg">
              Every feature is designed around measurable improvement, not vanity metrics.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={<Brain className="h-6 w-6" />}
              title="Evidence-Based Scoring"
              description="Transparent 6-dimension scoring with cited evidence from your answers. No black-box AI."
            />
            <FeatureCard
              icon={<Target className="h-6 w-6" />}
              title="Skill Graph & Weakness Detection"
              description="Hierarchical skill mapping with proficiency levels. Weaknesses identified with confidence scores and trends."
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              title="Adaptive Recommendations"
              description="Personalized next actions with clear reasoning. Difficulty adapts based on your performance patterns."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Multi-Tenant Security"
              description="College-level data isolation, role-based access (Student/TPO/Admin), audit logging, and privacy controls."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="TPO Analytics Dashboard"
              description="Aggregate insights for institutions: readiness distribution, common gaps, department analytics, placement reports."
            />
            <FeatureCard
              icon={<TrendingUp className="h-6 w-6" />}
              title="Progress Intelligence"
              description="Historical tracking with trend analysis. Know if you're improving, stable, or declining with mathematical confidence."
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="mb-4 text-3xl font-bold tracking-tight">The PrepVista Loop</h2>
            <p className="text-muted-foreground text-lg">
              A continuous cycle of assessment, analysis, coaching, and reassessment.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
            <StepCard
              step="01"
              title="Assess"
              description="Take AI-generated interviews tailored to your target role and current level."
              icon={<Target className="h-8 w-8" />}
            />
            <StepCard
              step="02"
              title="Analyze"
              description="Get explainable scores across 6 dimensions with specific evidence citations."
              icon={<Brain className="h-8 w-8" />}
            />
            <StepCard
              step="03"
              title="Coach"
              description="Receive personalized recommendations with clear reasoning and priority."
              icon={<Shield className="h-8 w-8" />}
            />
            <StepCard
              step="04"
              title="Improve"
              description="Practice targeted skills, reattempt weak categories, increase difficulty progressively."
              icon={<TrendingUp className="h-8 w-8" />}
            />
            <StepCard
              step="05"
              title="Reassess"
              description="Measure actual improvement with trend analysis. Loop continues automatically."
              icon={<ArrowRight className="h-8 w-8" />}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight">Ready to Level Up Your Interview Prep?</h2>
          <p className="mb-8 text-primary-foreground/80 text-lg">
            Join thousands of students using evidence-based preparation. First assessment free.
          </p>
          <Link href="/register">
            <Button size="xl" variant="secondary" className="w-full sm:w-auto">
              Start Your First Assessment
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">PrepVista</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Built for measurable interview readiness. Not a demo. Not a prototype.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Card className="h-full transition-shadow hover:shadow-lg">
      <CardHeader>
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepCard({ step, title, description, icon }: { step: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <div className="relative text-center">
      <div className="mb-4 flex items-center justify-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
      <div className="text-4xl font-bold text-primary/20">{step}</div>
      <h3 className="mt-2 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
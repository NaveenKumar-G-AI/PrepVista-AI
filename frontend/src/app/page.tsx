'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandLogo } from '@/components/brand-logo';
import { LaunchOfferBanner } from '@/components/launch-offer-banner';

import { api, ApiPublicGrowth } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const liveWaveformBars = [22, 28, 18, 30, 42, 34, 56, 44, 62, 38, 24, 40, 58, 36, 28, 50, 32, 47, 66, 42, 25, 36, 18, 27];
const secondaryWaveformBars = [18, 34, 22, 48, 36, 58, 44, 62, 28, 54, 38, 30, 44, 60, 35, 26];

export default function PrepVistaLandingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const hasTrackedLandingViewRef = useRef(false);
  const [publicGrowth, setPublicGrowth] = useState<ApiPublicGrowth | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const hasToken = !!(
      sessionStorage.getItem('pv_access_token') || 
      localStorage.getItem('pv_refresh_token') || 
      sessionStorage.getItem('pv_refresh_token')
    );
    if (hasToken) {
      router.replace('/dashboard');
    } else {
      setCheckingAuth(false);
    }
  }, [router]);

  const howItWorks = [
    {
      step: '01',
      title: 'Upload your resume',
      description:
        'We analyze your resume, skills, and project experience so each interview session reflects your actual background.',
      icon: '↗',
    },
    {
      step: '02',
      title: 'Practice by voice',
      description:
        'Respond naturally in a voice-first interview environment designed to simulate real interview flow more closely.',
      icon: '◉',
    },
    {
      step: '03',
      title: 'Get actionable feedback',
      description:
        'Receive clear feedback on clarity, structure, confidence, and answer quality after every session.',
      icon: '✦',
    },
  ];

  const features = [
    {
      title: 'Resume-based interview questions',
      description:
        'Questions are tailored to your projects, tools, and experience so practice feels role-relevant instead of generic.',
    },
    {
      title: 'Voice-first mock interview experience',
      description:
        'Practice answering aloud in a realistic interview flow that helps build confidence, fluency, and response quality.',
    },
    {
      title: 'Actionable AI coaching',
      description:
        'Get actionable coaching on how to improve your answers after every interview session.',
    },
  ];

  const trust = [
    'Privacy-aware resume handling',
    'Secure session processing',
    'Structured interview flow',
    'Clear coaching signals',
  ];

  const heroBullets = [
    'Resume-based interview questions',
    'Voice-first mock interview experience',
    'Actionable AI feedback after every session',
  ];

  const credibilityStrip = [
    'Built for final-year students, freshers, and early-career candidates',
    'First 100 users offer',
    'Remaining spots update in real time',
    'No credit card required',
    'Setup in under 2 minutes',
  ];

  const outcomes = [
    {
      title: 'Answer clarity',
      description: 'See where your responses are vague and improve how clearly you communicate key points.',
    },
    {
      title: 'Response structure',
      description: 'Build stronger answer flow so your examples sound more organized and easier to follow.',
    },
    {
      title: 'Speaking confidence',
      description: 'Practice answering aloud to improve fluency, composure, and delivery under interview pressure.',
    },
    {
      title: 'Resume-based relevance',
      description: 'Stay closer to the projects, skills, and experience you are most likely to be asked about.',
    },
  ];

  const audienceChips = ['Final-year students', 'Freshers', 'Early-career candidates', 'Placement-focused job seekers'];
  const bestForLine = 'Best for HR rounds, screening interviews, placement preparation, and early-stage interview practice.';

  const primaryHref = user ? '/dashboard' : '/login?mode=signup';
  const headerSecondaryHref = user ? '/dashboard' : '/login';
  const headerSecondaryLabel = user ? 'Dashboard' : 'Sign In';
  const headerPrimaryLabel = user ? 'Go to Dashboard' : 'Start Free Interview';
  const primaryLabel = user ? 'Go to Dashboard' : 'Start Free Interview';

  useEffect(() => {
    if (hasTrackedLandingViewRef.current) {
      return;
    }
    hasTrackedLandingViewRef.current = true;
    void api.trackEvent('landing page viewed', { page: 'landing' });
  }, []);

  useEffect(() => {
    api.getPublicGrowth<ApiPublicGrowth>()
      .then(setPublicGrowth)
      .catch(() => undefined);
  }, []);

  const trackCtaClick = (location: string, cta: string) => {
    void api.trackEvent('cta clicked', { location, cta });
  };

  if (checkingAuth) {
    return <div className="min-h-screen bg-[#050b1a]" />;
  }

  return (
    <div className="min-h-screen overflow-hidden bg-[#050b1a] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.22),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(99,102,241,0.18),transparent_24%),radial-gradient(circle_at_50%_80%,rgba(14,165,233,0.12),transparent_28%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-6 lg:px-8">
        <header className="sticky top-4 z-30 mb-10">
          <div className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 shadow-[0_10px_50px_rgba(0,0,0,0.25)] backdrop-blur-xl">
            <BrandLogo
              size={36}
              priority
              className="flex items-center gap-3"
              imageClassName="rounded-xl object-contain shadow-[0_0_30px_rgba(59,130,246,0.35)]"
              nameClassName="text-sm font-semibold tracking-wide text-white"
              subtitle="Resume-based AI interview practice"
              subtitleClassName="text-[11px] text-white/45"
            />

            <nav className="hidden items-center gap-2 md:flex">
              <a href="#product" className="rounded-xl px-4 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white">
                Product
              </a>
              <a href="#how-it-works" className="rounded-xl px-4 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white">
                How It Works
              </a>
              <a href="#features" className="rounded-xl px-4 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white">
                Features
              </a>
              <Link href="/pricing" className="rounded-xl px-4 py-2 text-sm text-white/70 transition hover:bg-white/8 hover:text-white">
                Pricing
              </Link>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href={headerSecondaryHref}
                className="hidden rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:bg-white/8 sm:block"
              >
                {headerSecondaryLabel}
              </Link>
              <Link
                href={primaryHref}
                onClick={() => trackCtaClick('header', headerPrimaryLabel)}
                className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold shadow-[0_10px_30px_rgba(59,130,246,0.35)] transition hover:scale-[1.02]"
              >
                {headerPrimaryLabel}
              </Link>
            </div>
          </div>
        </header>

        <section id="product" className="relative mb-20 grid scroll-mt-28 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:pt-10">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-4 py-2 text-xs font-medium text-blue-200">
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.9)]" />
              Resume-based AI interview practice
            </div>

            <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Practice the interview
              <span className="block bg-gradient-to-r from-blue-300 via-blue-500 to-indigo-400 bg-clip-text text-transparent">
                you&apos;re actually likely to face
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65">
              PrepVista helps final-year students, freshers, and early-career candidates practice realistic mock
              interviews based on their resume, projects, skills, and experience with voice-based responses and
              actionable AI feedback.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href={primaryHref}
                onClick={() => trackCtaClick('hero', primaryLabel)}
                className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3.5 text-sm font-semibold shadow-[0_14px_40px_rgba(59,130,246,0.35)] transition hover:scale-[1.02]"
              >
                {primaryLabel}
              </Link>
              <a
                href="#experience"
                onClick={() => trackCtaClick('hero', 'Watch Demo')}
                className="rounded-2xl border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white/90 transition hover:bg-white/[0.07]"
              >
                Watch Demo
              </a>
            </div>

            <div className="mt-5 inline-flex rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/70">
              Built for final-year students, freshers, and early-career candidates
            </div>

            <LaunchOfferBanner
              className="mt-4"
              tone="dark"
              maxSlots={publicGrowth?.launch_offer?.max_slots}
              remainingSlots={publicGrowth?.launch_offer?.remaining_slots}
              offerDurationDays={publicGrowth?.launch_offer?.offer_duration_days}
            />

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-white/45">
              <span>No credit card required</span>
              <span aria-hidden="true">&middot;</span>
              <span>Get started in under 2 minutes</span>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {heroBullets.map(item => (
                <div
                  key={item}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/75"
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-6 top-10 h-36 w-36 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-indigo-500/20 blur-3xl" />

            <div className="relative rounded-[32px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="rounded-[28px] border border-white/10 bg-[#081123] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-white/35">Interview experience preview</div>
                    <div className="mt-2 text-xl font-semibold">Tell me about yourself</div>
                  </div>
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
                    0:48
                  </div>
                </div>

                <div className="mb-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <div className="mb-3 flex items-center justify-between text-xs text-white/45">
                    <span>Voice response active</span>
                    <span>Confidence signal: Rising</span>
                  </div>
                  <div className="flex h-20 items-end gap-1 rounded-xl bg-gradient-to-b from-white/[0.03] to-transparent px-2 py-3">
                    {liveWaveformBars.map((height, index) => (
                      <div
                        key={`hero-wave-${height}-${index}`}
                        className="w-full rounded-full bg-gradient-to-t from-blue-500/60 via-blue-400/90 to-cyan-300/90"
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/35">Resume-grounded topics</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['React', 'FastAPI', 'RAG', 'Projects', 'Leadership'].map(tag => (
                        <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      Questions adapt to your background, projects, and technical experience as the interview progresses.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-blue-500/10 to-indigo-500/10 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-white/35">AI coaching insights</div>
                    <div className="mt-4 text-3xl font-bold text-blue-200">82</div>
                    <div className="mt-1 text-sm text-white/45">Session score</div>
                    <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                      Strong answer structure identified
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mb-24">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.04] px-6 py-6 shadow-[0_20px_80px_rgba(0,0,0,0.2)] backdrop-blur-xl lg:px-8">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <div className="text-sm font-medium text-blue-300">Designed for realistic preparation</div>
                <p className="mt-3 max-w-xl leading-7 text-white/55">{bestForLine}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {credibilityStrip.map(item => (
                  <div
                    key={item}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-white/75"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="experience" className="mb-24 scroll-mt-28">
          <div className="mb-8 text-center">
            <div className="text-sm font-medium text-blue-300">A more realistic and relevant way to prepare for interviews</div>
            <h2 className="mt-3 text-3xl font-semibold">
              Practice with structured flow, role relevance, and practical feedback
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/55">
              PrepVista gives you a structured interview flow, practical coaching signals, and resume-grounded
              questions so preparation feels more useful than random question lists.
            </p>
          </div>

          <div className="relative rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-[28px] border border-white/10 bg-[#091226] p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white/45">PrepVista session</div>
                    <div className="mt-1 text-3xl font-semibold">Tell me about yourself</div>
                  </div>
                  <div className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-white/55">Question 1 of 8</div>
                </div>
                <p className="max-w-xl text-white/55">
                  Reference your React, API, and project experience to answer with examples that feel specific and
                  role-relevant.
                </p>
                <div className="mt-6 flex gap-3">
                  <Link
                    href={primaryHref}
                    onClick={() => trackCtaClick('experience', primaryLabel)}
                    className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-3 text-sm font-semibold"
                  >
                    {primaryLabel}
                  </Link>
                  <a href="#features" className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/75">
                    Explore Features
                  </a>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="mb-3 flex items-center justify-between text-sm text-white/55">
                    <span>Live waveform</span>
                    <span>Mic active</span>
                  </div>
                  <div className="flex h-24 items-end gap-1">
                    {secondaryWaveformBars.map((height, index) => (
                      <div
                        key={`secondary-wave-${height}-${index}`}
                        className="w-full rounded-full bg-gradient-to-t from-indigo-500 to-cyan-300"
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm text-white/45">Feedback preview</div>
                  <div className="mt-4 space-y-3">
                    {[
                      ['Clarity', 'Strong'],
                      ['Structure', 'Improving'],
                      ['Confidence', 'Strong'],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm"
                      >
                        <span className="text-white/65">{label}</span>
                        <span className="text-blue-200">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mb-24 scroll-mt-28">
          <div className="mb-10 text-center">
            <div className="text-sm font-medium text-blue-300">From resume to interview-ready practice</div>
            <h2 className="mt-3 text-3xl font-semibold">How PrepVista personalizes each mock interview</h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {howItWorks.map((item, index) => (
              <div
                key={item.step}
                className="group relative rounded-[28px] border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:-translate-y-1 hover:border-blue-400/30 hover:bg-white/[0.055]"
              >
                {index < howItWorks.length - 1 ? (
                  <div className="absolute -right-4 top-1/2 hidden h-0.5 w-8 -translate-y-1/2 bg-gradient-to-r from-blue-400/90 to-transparent lg:block" />
                ) : null}
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-sm font-semibold text-blue-200 ring-1 ring-blue-400/20">
                    {item.step}
                  </div>
                  <div className="text-lg text-white/30 transition group-hover:text-blue-200">{item.icon}</div>
                </div>
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-4 leading-7 text-white/55">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="mb-24 scroll-mt-28">
          <div className="mb-10 text-center">
            <div className="text-sm font-medium text-blue-300">Why PrepVista</div>
            <h2 className="mt-3 text-3xl font-semibold">Built for more relevant, more effective interview practice</h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {features.map(feature => (
              <div
                key={feature.title}
                className="rounded-[28px] border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.03] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)]"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-200 ring-1 ring-blue-400/20">
                  ✦
                </div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
                <p className="mt-4 leading-7 text-white/55">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-24">
          <div className="mb-10 text-center">
            <div className="text-sm font-medium text-blue-300">What candidates improve with PrepVista</div>
            <h2 className="mt-3 text-3xl font-semibold">Practice that strengthens the signals interviewers notice first</h2>
            <p className="mx-auto mt-4 max-w-2xl text-white/55">
              Candidates use PrepVista to improve how clearly they answer, how well they structure responses, and how
              confidently they speak in role-relevant interviews.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {outcomes.map(outcome => (
              <div
                key={outcome.title}
                className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.16)]"
              >
                <div className="mb-5 inline-flex rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-200">
                  Outcome
                </div>
                <h3 className="text-xl font-semibold">{outcome.title}</h3>
                <p className="mt-4 leading-7 text-white/55">{outcome.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-24 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8">
            <div className="text-sm font-medium text-blue-300">Built with privacy and candidate trust in mind</div>
            <h2 className="mt-3 text-3xl font-semibold">Structured interview practice with privacy, clarity, and control</h2>
            <p className="mt-4 max-w-2xl leading-7 text-white/55">
              Your resume and interview responses are used to personalize practice sessions and improve coaching
              quality. PrepVista is designed to keep the experience focused, secure, and trustworthy.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {trust.map(item => (
                <div key={item} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-white/75">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-white/10 bg-gradient-to-b from-blue-500/10 to-indigo-500/10 p-8">
            <div className="text-sm font-medium text-blue-300">Built for candidates preparing for real interviews</div>
            <h3 className="mt-3 text-2xl font-semibold">Final-year students, freshers, and early-career candidates</h3>
            <p className="mt-4 leading-7 text-white/55">
              PrepVista is designed for candidates who want interview practice grounded in their real background, not
              another generic question set.
            </p>
            <div className="mt-5 text-sm text-white/60">{bestForLine}</div>
            <div className="mt-8 flex flex-wrap gap-3">
              {audienceChips.map(pill => (
                <span key={pill} className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70">
                  {pill}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-24 rounded-[36px] border border-white/10 bg-gradient-to-r from-blue-500/12 via-indigo-500/10 to-cyan-500/10 px-8 py-12 text-center shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
          <div className="text-sm font-medium text-blue-300">Start practicing with interviews tailored to your background</div>
          <h2 className="mx-auto mt-3 max-w-3xl text-4xl font-semibold leading-tight">
            Start practicing with interviews tailored to your background
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-white/55">
            Build confidence with resume-based practice, voice-first flow, and coaching signals that help you improve
            from session to session.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href={primaryHref}
              onClick={() => trackCtaClick('final_cta', primaryLabel)}
              className="rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3.5 text-sm font-semibold shadow-[0_14px_40px_rgba(59,130,246,0.35)]"
            >
              {primaryLabel}
            </Link>
            <Link
              href="/pricing"
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white/85"
            >
              See Pricing
            </Link>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-sm text-white/45">
            <span>No credit card required</span>
            <span aria-hidden="true">&middot;</span>
            <span>Setup in under 2 minutes</span>
            <span aria-hidden="true">&middot;</span>
            <span>Resume-based interview flow</span>
          </div>
        </section>

        <footer className="grid gap-8 border-t border-white/8 pt-10 text-sm text-white/50 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <BrandLogo
              size={36}
              className="flex items-center gap-3"
              imageClassName="rounded-xl object-contain"
              nameClassName="font-semibold text-white/90"
              subtitle="Resume-based AI interview practice platform"
              subtitleClassName="text-xs text-white/40"
            />
            <p className="mt-4 max-w-xs leading-7 text-white/45">
              PrepVista helps candidates practice realistic mock interviews with resume-based questions, voice-first
              simulation, and actionable AI coaching.
            </p>
          </div>

          <div>
            <div className="font-semibold text-white/85">Product</div>
            <div className="mt-4 space-y-3">
              <a href="#features" className="block transition hover:text-white">Features</a>
              <a href="#how-it-works" className="block transition hover:text-white">How it Works</a>
              <Link href="/pricing" className="block transition hover:text-white">Pricing</Link>
              <a href="#experience" className="block transition hover:text-white">Demo</a>
            </div>
          </div>

          <div>
            <div className="font-semibold text-white/85">Legal</div>
            <div className="mt-4 space-y-3">
              <Link href="/privacy" className="block transition hover:text-white">Privacy Policy</Link>
              <Link href="/terms" className="block transition hover:text-white">Terms</Link>
              <a href="#product" className="block transition hover:text-white">Security</a>
              <Link href="/pricing" className="block transition hover:text-white">Cookies</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

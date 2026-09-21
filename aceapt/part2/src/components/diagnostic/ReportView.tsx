import Link from "next/link";
import { EvidenceBar } from "@/components/diagnostic/EvidenceBar";
import { Badge, Button, Card, Eyebrow } from "@/components/ui";
import type { ConfidenceSelfRating, DiagnosticResult, Domain } from "@/lib/domain/types";

const DOMAIN_LABEL: Record<Domain, string> = {
  QUANTITATIVE: "Quantitative Aptitude",
  LOGICAL: "Logical Reasoning",
  VERBAL: "Verbal Aptitude",
};

const CONFIDENCE_LABEL: Record<ConfidenceSelfRating, string> = {
  LOW: "Not confident",
  MEDIUM: "Somewhat confident",
  HIGH: "Confident",
};

const SPEED_LABEL: Record<string, string> = {
  FAST: "Faster than the question's expected pace",
  MODERATE: "Around the question's expected pace",
  SLOW: "Slower than the question's expected pace",
  INSUFFICIENT_EVIDENCE: "Not enough timed responses yet",
};

export function ReportView({ result }: { result: DiagnosticResult }) {
  const nameById = Object.fromEntries(result.skillResults.map((s) => [s.skillId, s]));
  const startingSkill = result.recommendedStartingPointSkillId ? nameById[result.recommendedStartingPointSkillId] : null;

  return (
    <main className="min-h-screen px-6 py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <Eyebrow>Diagnostic complete</Eyebrow>
        <h1 className="font-display mt-3 text-4xl font-medium text-ink sm:text-5xl">Your Aptitude Starting Profile</h1>
        {result.aiNarrative && <p className="mt-5 text-lg leading-relaxed text-ink-soft">{result.aiNarrative.overallSummary}</p>}
        <p className="mt-3 font-mono text-xs text-ink-faint">
          {result.totalQuestions} questions answered ·{" "}
          {result.aiGenerationStatus === "SUCCESS"
            ? "narrative generated with AI, over your computed results"
            : "narrative generated deterministically (no AI key configured, or the AI call didn't return valid output)"}
        </p>

        {/* Overall */}
        <Card className="mt-8 p-6">
          <Eyebrow>Overall starting level</Eyebrow>
          <div className="mt-3">
            <EvidenceBar level={result.overallCapability} attempts={result.totalQuestions} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Accuracy" value={result.accuracyOverall !== null ? `${Math.round(result.accuracyOverall * 100)}%` : "—"} />
            <Stat label="Speed" value={SPEED_LABEL[result.speedProfileOverall] ?? result.speedProfileOverall} small />
            <Stat label="Questions" value={String(result.totalQuestions)} />
          </div>
        </Card>

        {/* Root cause / what we found */}
        {result.possibleRootCauses.length > 0 && (
          <Section title="What we found">
            <div className="space-y-3">
              {result.possibleRootCauses.map((rc, i) => (
                <Card key={i} className="p-5">
                  <Badge tone="brass">{rc.confidence === "MODERATE" ? "Likely" : "Early signal"}</Badge>
                  <p className="mt-2.5 text-ink">{rc.narrative}</p>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {/* Strengths */}
        <Section title="Your strengths">
          {result.strengths.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.strengths.map((id) => (
                <SkillCard key={id} skill={nameById[id]} />
              ))}
            </div>
          ) : (
            <EmptyNote>{result.aiNarrative?.strengthsNarrative ?? "No single area stood out as a clear strength yet."}</EmptyNote>
          )}
        </Section>

        {/* Focus areas */}
        <Section title="Focus areas">
          {result.focusAreas.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {result.focusAreas.map((id) => (
                <SkillCard key={id} skill={nameById[id]} />
              ))}
            </div>
          ) : (
            <EmptyNote>{result.aiNarrative?.focusAreasNarrative ?? "No urgent focus area stood out in this diagnostic."}</EmptyNote>
          )}
        </Section>

        {/* Self-perception vs evidence */}
        <Section title="Confidence vs. evidence">
          <Card className="divide-y divide-line overflow-hidden">
            {result.domainResults.map((dr) => (
              <div key={dr.domain} className="grid grid-cols-3 items-center gap-3 px-5 py-4">
                <span className="text-sm text-ink">{DOMAIN_LABEL[dr.domain]}</span>
                <span className="font-mono text-xs text-ink-faint">
                  you said: {CONFIDENCE_LABEL[result.selfPerceptionByDomain[dr.domain]]}
                </span>
                <div className="justify-self-end">
                  <EvidenceBar level={dr.capabilityLevel} size="sm" />
                </div>
              </div>
            ))}
          </Card>
          {result.unexpectedFindings.length > 0 && (
            <div className="mt-3 space-y-2">
              {result.unexpectedFindings.map((f, i) => (
                <p key={i} className="rounded-lg bg-brass-soft px-4 py-3 text-sm text-ink">
                  {f.narrative}
                </p>
              ))}
            </div>
          )}
        </Section>

        {/* Confidence alignment on individual questions */}
        {result.confidenceAlignment.length > 0 && (
          <Section title="Confidence patterns worth noticing">
            <ul className="space-y-2">
              {result.confidenceAlignment.map((f, i) => (
                <li key={i} className="text-sm leading-relaxed text-ink-soft">
                  {f.narrative}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Full breakdown */}
        <Section title="Full evidence breakdown">
          <Card className="divide-y divide-line overflow-hidden">
            {result.skillResults.map((s) => (
              <div key={s.skillId} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{s.skillName}</span>
                  <span className="font-mono text-[0.7rem] text-ink-faint">{DOMAIN_LABEL[s.domain]}</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <MiniEvidence label="Foundation" sub={s.foundation} />
                  <MiniEvidence label="Application" sub={s.application} />
                  <MiniEvidence label="Transfer" sub={s.transfer} />
                </div>
              </div>
            ))}
          </Card>
        </Section>

        {/* Recommended starting point */}
        <Section title="Recommended starting point">
          <Card className="p-6">
            <p className="font-display text-2xl text-ink">{startingSkill?.skillName ?? "Broad review across all three domains"}</p>
            <p className="mt-3 leading-relaxed text-ink-soft">{result.recommendedStartingPointReason}</p>
            <div className="mt-6">
              <Button disabled title="Feature 3 (Adaptive Practice) isn't built yet in this prototype">
                Start personalized practice
              </Button>
              <p className="mt-2 text-xs text-ink-faint">
                This connects to ACEAPT&rsquo;s practice engine, which is a future feature — not part of this build.
              </p>
            </div>
          </Card>
        </Section>

        <div className="mt-14 flex justify-center">
          <Link href="/">
            <Button variant="ghost">Back to start</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <Eyebrow>{title}</Eyebrow>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="font-mono text-[0.7rem] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`mt-1 text-ink ${small ? "text-sm leading-snug" : "text-lg font-medium"}`}>{value}</p>
    </div>
  );
}

function SkillCard({ skill }: { skill: DiagnosticResult["skillResults"][number] | undefined }) {
  if (!skill) return null;
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-ink">{skill.skillName}</p>
      <p className="font-mono text-[0.7rem] text-ink-faint">{DOMAIN_LABEL[skill.domain]}</p>
      <div className="mt-3">
        <EvidenceBar level={skill.overall.evidenceLevel} attempts={skill.overall.attempts} size="sm" />
      </div>
    </Card>
  );
}

function MiniEvidence({ label, sub }: { label: string; sub: { evidenceLevel: string; attempts: number; accuracy: number | null } }) {
  return (
    <div>
      <p className="font-mono text-[0.65rem] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-0.5 text-sm text-ink">
        {sub.attempts === 0 ? "Not assessed" : `${sub.accuracy !== null ? Math.round(sub.accuracy * 100) + "%" : "—"} · ${sub.attempts} asked`}
      </p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-ink-soft">{children}</p>;
}

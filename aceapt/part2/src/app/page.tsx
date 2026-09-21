import Link from "next/link";
import { getDemoStudentId } from "@/lib/auth/demoAuth";
import { getLatestSessionForStudent } from "@/lib/db/repo";
import { Button, Card, Eyebrow } from "@/components/ui";

export default async function HomePage() {
  const studentId = await getDemoStudentId();
  const session = studentId ? getLatestSessionForStudent(studentId) : null;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16 sm:py-24">
        <Eyebrow>ACEAPT — Feature 2 prototype</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-medium leading-[1.1] text-ink sm:text-5xl">
          Adaptive Aptitude
          <br />
          Diagnostic Engine
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">
          A short, adaptive diagnostic that decides what it needs to learn about you
          next, one question at a time — instead of handing you a fixed test and a
          percentage at the end.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          {session?.status === "IN_PROGRESS" ? (
            <>
              <Link href={`/diagnostic/${session.id}/run`}>
                <Button>Resume your diagnostic</Button>
              </Link>
              <Link href="/onboarding-sim">
                <Button variant="ghost">Start a new one instead</Button>
              </Link>
            </>
          ) : session?.status === "COMPLETED" ? (
            <>
              <Link href={`/diagnostic/${session.id}/report`}>
                <Button>View your report</Button>
              </Link>
              <Link href="/onboarding-sim">
                <Button variant="secondary">Start a new diagnostic</Button>
              </Link>
            </>
          ) : (
            <Link href="/onboarding-sim">
              <Button>Start the diagnostic</Button>
            </Link>
          )}
        </div>

        <Card className="mt-14 p-6">
          <Eyebrow>About this prototype</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            This build covers <strong className="text-ink">Feature 2</strong> only — the
            diagnostic itself. ACEAPT&rsquo;s onboarding step (Feature 1) doesn&rsquo;t exist
            yet in this codebase, so the button above starts with a short stand-in form
            that produces the same shape of data Feature 1 would hand off. Everything
            after that — question selection, evidence tracking, and the report — is real,
            not scripted.
          </p>
        </Card>
      </div>
    </main>
  );
}

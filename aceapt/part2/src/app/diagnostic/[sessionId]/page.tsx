import Link from "next/link";
import { redirect } from "next/navigation";
import { getDemoStudentId } from "@/lib/auth/demoAuth";
import { getSession } from "@/lib/db/repo";
import { Button, Eyebrow } from "@/components/ui";

export default async function DiagnosticIntroPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const studentId = await getDemoStudentId();
  const session = getSession(sessionId);

  if (!session || !studentId || session.studentId !== studentId) {
    redirect("/");
  }
  if (session.status === "COMPLETED") {
    redirect(`/diagnostic/${sessionId}/report`);
  }

  return (
    <main className="flex min-h-screen items-center px-6 py-16">
      <div className="mx-auto max-w-xl">
        <Eyebrow>Adaptive diagnostic</Eyebrow>
        <h1 className="font-display mt-4 text-4xl font-medium leading-tight text-ink">
          Let&rsquo;s find out where you actually stand.
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">
          You&rsquo;ve told ACEAPT about your goals and how you&rsquo;ve prepared so far. Now a
          short adaptive diagnostic will measure your current aptitude directly —
          question by question, adjusting as it learns more about you.
        </p>
        <p className="mt-4 leading-relaxed text-ink-soft">
          This isn&rsquo;t about passing or failing. Your answers help ACEAPT see what you
          already know, where you could use reinforcement, and how you handle
          increasing difficulty — including questions you get wrong, which is exactly
          the information it needs.
        </p>
        <p className="mt-4 text-sm text-ink-faint">
          Typically 14–28 questions, depending on how quickly a clear picture forms. No
          hints or explanations appear until the end, so what gets measured is really yours.
        </p>
        <div className="mt-9">
          <Link href={`/diagnostic/${sessionId}/run`}>
            <Button>Begin diagnostic</Button>
          </Link>
        </div>
      </div>
    </main>
  );
}

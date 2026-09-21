import { redirect } from "next/navigation";
import { getDemoStudentId } from "@/lib/auth/demoAuth";
import { getSession } from "@/lib/db/repo";
import { QuestionRunner } from "@/components/diagnostic/QuestionRunner";

export default async function DiagnosticRunPage({ params }: { params: Promise<{ sessionId: string }> }) {
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
    <main className="min-h-screen">
      <QuestionRunner sessionId={sessionId} />
    </main>
  );
}

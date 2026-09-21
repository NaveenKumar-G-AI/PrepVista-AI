import { redirect } from "next/navigation";
import { getDemoStudentId } from "@/lib/auth/demoAuth";
import { getDiagnosticResultJson, getSession } from "@/lib/db/repo";
import type { DiagnosticResult } from "@/lib/domain/types";
import { ReportView } from "@/components/diagnostic/ReportView";

export default async function ReportPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const studentId = await getDemoStudentId();
  const session = getSession(sessionId);

  if (!session || !studentId || session.studentId !== studentId) {
    redirect("/");
  }

  const json = getDiagnosticResultJson(sessionId);
  if (!json) {
    // Not finished yet (e.g. a direct link before completion) — send them
    // back into the flow rather than showing a blank or broken report.
    redirect(`/diagnostic/${sessionId}/run`);
  }

  const result = JSON.parse(json) as DiagnosticResult;
  return <ReportView result={result} />;
}

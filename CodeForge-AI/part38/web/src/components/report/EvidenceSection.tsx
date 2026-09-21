import type {
  CodingPerformance,
  DebuggingEvidence,
  InterviewEvidenceEntry,
  ProjectEvidenceEntry,
  ReasoningEvidence,
} from "../../types/report";

export interface EvidenceSectionProps {
  coding: CodingPerformance | null;
  debugging: DebuggingEvidence | null;
  reasoning: ReasoningEvidence | null;
  projects: ProjectEvidenceEntry[];
  interviews: InterviewEvidenceEntry[];
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[12px] uppercase tracking-[0.06em] text-[color:var(--report-accent)] mb-2 font-medium">{title}</h3>
      <div className="text-[13.5px] text-[color:var(--report-text)] space-y-1">{children}</div>
    </div>
  );
}

export function EvidenceSection({ coding, debugging, reasoning, projects, interviews }: EvidenceSectionProps) {
  const hasAny = coding || debugging || reasoning || projects.length > 0 || interviews.length > 0;

  return (
    <section aria-labelledby="evidence-heading" className="mb-11">
      <h2
        id="evidence-heading"
        className="font-[family-name:var(--report-font-display)] text-lg font-semibold pb-2.5 mb-4 border-b border-[color:var(--report-border)]"
      >
        Evidence Summary
      </h2>
      {!hasAny ? (
        <p className="text-sm italic text-[color:var(--report-text-muted)]">No evidence on record yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {coding && (
            <Block title="Coding">
              {coding.correctness && <p>{coding.correctness}</p>}
              {coding.problemSolving && <p className="text-[color:var(--report-text-muted)]">{coding.problemSolving}</p>}
            </Block>
          )}
          {debugging && (
            <Block title="Debugging">
              {debugging.capability && <p>{debugging.capability}</p>}
              {debugging.commonWeakness && <p className="text-[color:var(--report-text-muted)]">{debugging.commonWeakness}</p>}
            </Block>
          )}
          {reasoning && (
            <Block title="Reasoning & Understanding">
              {reasoning.reasoningNote && <p>{reasoning.reasoningNote}</p>}
              {reasoning.understandingNote && <p className="text-[color:var(--report-text-muted)]">{reasoning.understandingNote}</p>}
            </Block>
          )}
          {projects.length > 0 && (
            <Block title="Projects">
              {projects.map((p) => (
                <p key={p.projectId}>
                  <strong className="font-medium">{p.projectName}</strong> — {p.technicalDepth}
                </p>
              ))}
            </Block>
          )}
          {interviews.length > 0 && (
            <Block title="Technical Interviews">
              {interviews.map((iv) => (
                <p key={iv.interviewId}>
                  <strong className="font-medium">{iv.interviewName}</strong> — {iv.outcome}
                </p>
              ))}
            </Block>
          )}
        </div>
      )}
    </section>
  );
}

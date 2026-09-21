import { useState } from "react";

/**
 * Mirrors src/redaction/toDto.ts's ExecutionResultDto shape. Duplicated
 * here (rather than imported) so this component has zero dependency on
 * server-only code paths — copy the real type import in your app once
 * this is wired into your actual frontend build.
 */
export interface ExecutionResultDtoView {
  submissionId: string;
  evaluationId: string;
  verdict:
    | "ACCEPTED"
    | "WRONG_ANSWER"
    | "COMPILATION_ERROR"
    | "RUNTIME_ERROR"
    | "TIME_LIMIT_EXCEEDED"
    | "MEMORY_LIMIT_EXCEEDED"
    | "OUTPUT_LIMIT_EXCEEDED"
    | "SYSTEM_ERROR"
    | "JUDGE_ERROR";
  message: string;
  language: string;
  tests: {
    total: number;
    passed: number;
    rows: Array<{ position: number; visible: boolean; status: string; durationMs: number | null; memoryKb: number | null }> | null;
  };
  scoring: { score: number | null; maxScore: number | null; percentage: number | null } | null;
  performance: { runtimeMs: number | null; memoryKb: number | null };
  compilationError: { line: number | null; column: number | null; message: string | null } | null;
  finalizedAtIso: string;
}

export type LifecycleDisplayState =
  | "SUBMITTED"
  | "QUEUED"
  | "COMPILING"
  | "RUNNING"
  | "EVALUATING"
  | "FINALIZING"
  | "COMPLETED";

const VERDICT_META: Record<
  ExecutionResultDtoView["verdict"],
  { label: string; tone: "success" | "failure" | "warning"; icon: string }
> = {
  ACCEPTED: { label: "ACCEPTED", tone: "success", icon: "check" },
  WRONG_ANSWER: { label: "WRONG ANSWER", tone: "failure", icon: "cross" },
  COMPILATION_ERROR: { label: "COMPILATION ERROR", tone: "failure", icon: "cross" },
  RUNTIME_ERROR: { label: "RUNTIME ERROR", tone: "failure", icon: "cross" },
  TIME_LIMIT_EXCEEDED: { label: "TIME LIMIT EXCEEDED", tone: "failure", icon: "cross" },
  MEMORY_LIMIT_EXCEEDED: { label: "MEMORY LIMIT EXCEEDED", tone: "failure", icon: "cross" },
  OUTPUT_LIMIT_EXCEEDED: { label: "OUTPUT LIMIT EXCEEDED", tone: "failure", icon: "cross" },
  SYSTEM_ERROR: { label: "EVALUATION ISSUE", tone: "warning", icon: "warn" },
  JUDGE_ERROR: { label: "EVALUATION ISSUE", tone: "warning", icon: "warn" },
};

const LIFECYCLE_LABEL: Record<LifecycleDisplayState, string> = {
  SUBMITTED: "Submitted",
  QUEUED: "Queued",
  COMPILING: "Compiling",
  RUNNING: "Running",
  EVALUATING: "Evaluating",
  FINALIZING: "Finalizing",
  COMPLETED: "Completed",
};

function formatRuntime(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function formatMemory(kb: number | null): string {
  if (kb === null) return "—";
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
}

/** Truthful lifecycle indicator — no fabricated percentage progress bars. */
export function EvaluationLifecycleIndicator({ state }: { state: LifecycleDisplayState }) {
  const order: LifecycleDisplayState[] = [
    "SUBMITTED",
    "QUEUED",
    "COMPILING",
    "RUNNING",
    "EVALUATING",
    "FINALIZING",
    "COMPLETED",
  ];
  const currentIdx = order.indexOf(state);
  return (
    <div className="flex items-center gap-2 text-sm text-[var(--cf-muted,#6b7280)]">
      {order.map((s, i) => (
        <span key={s} className={i <= currentIdx ? "font-medium text-[var(--cf-fg,#111827)]" : ""}>
          {LIFECYCLE_LABEL[s]}
          {i < order.length - 1 ? " → " : ""}
        </span>
      ))}
    </div>
  );
}

export function ExecutionResultCard({
  dto,
  onViewDetails,
}: {
  dto: ExecutionResultDtoView;
  onViewDetails?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = VERDICT_META[dto.verdict];

  const toneClasses =
    meta.tone === "success"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : meta.tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-rose-500/40 bg-rose-500/5";

  const headingColor =
    meta.tone === "success" ? "text-emerald-600" : meta.tone === "warning" ? "text-amber-600" : "text-rose-600";

  return (
    <div className={`rounded-xl border p-5 ${toneClasses}`}>
      <div className={`flex items-center gap-2 text-lg font-semibold ${headingColor}`}>
        <span aria-hidden>{meta.icon === "check" ? "✓" : meta.icon === "cross" ? "✕" : "⚠"}</span>
        <span>{meta.label}</span>
      </div>

      <p className="mt-2 text-sm text-[var(--cf-muted,#4b5563)]">{dto.message}</p>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[var(--cf-muted,#6b7280)]">Tests</dt>
          <dd className="font-medium">
            {dto.tests.passed} / {dto.tests.total}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--cf-muted,#6b7280)]">Runtime</dt>
          <dd className="font-medium">{formatRuntime(dto.performance.runtimeMs)}</dd>
        </div>
        <div>
          <dt className="text-[var(--cf-muted,#6b7280)]">Memory</dt>
          <dd className="font-medium">{formatMemory(dto.performance.memoryKb)}</dd>
        </div>
        <div>
          <dt className="text-[var(--cf-muted,#6b7280)]">Language</dt>
          <dd className="font-medium">{dto.language}</dd>
        </div>
      </dl>

      {dto.compilationError && (
        <div className="mt-3 rounded-md bg-black/5 p-3 font-mono text-xs">
          {dto.compilationError.line !== null && (
            <div className="opacity-70">
              Line {dto.compilationError.line}
              {dto.compilationError.column !== null ? `:${dto.compilationError.column}` : ""}
            </div>
          )}
          <div>{dto.compilationError.message ?? "Compilation failed."}</div>
        </div>
      )}

      <button
        type="button"
        className="mt-4 text-sm font-medium underline underline-offset-2"
        onClick={() => {
          setExpanded((v) => !v);
          onViewDetails?.();
        }}
      >
        {dto.tests.rows ? (expanded ? "Hide details" : "View available results →") : "View execution details →"}
      </button>

      {expanded && dto.tests.rows && (
        <ul className="mt-3 space-y-1 text-sm">
          {dto.tests.rows.map((row) => (
            <li key={row.position} className="flex items-center justify-between">
              <span>Test {row.position}</span>
              <span className={row.status === "PASSED" ? "text-emerald-600" : "text-rose-600"}>
                {row.visible ? row.status : "Hidden"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ExecutionResultCard;

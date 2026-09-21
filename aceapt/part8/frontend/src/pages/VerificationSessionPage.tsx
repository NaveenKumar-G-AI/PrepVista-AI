import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import { api, ApiError, type CurrentQuestionResponse, type VerificationResult } from "../api/client";
import { Timer } from "../components/Timer";
import { CalibrationArc } from "../components/CalibrationArc";

type Phase = "intro" | "question" | "submitting" | "complete";

const OBJECTIVE_COPY: Record<string, { title: string; checks: string[] }> = {
  PROVISIONAL_CHECK: { title: "Provisional check", checks: ["Solve without hints", "Handle a slightly different version"] },
  VERIFY_TRANSFER: { title: "Transfer verification", checks: ["Solve unfamiliar variations", "Apply the skill without a topic hint", "Perform under time pressure"] },
  STABILITY_CHECK: { title: "Stability check", checks: ["Repeat performance independently", "Apply the skill without a topic hint", "Perform under time pressure"] },
  MAINTENANCE_CHECK: { title: "Maintenance check", checks: ["A quick check that this skill is holding steady"] },
  DELAYED_VERIFICATION: { title: "Delayed verification", checks: ["Confirm the skill is still there after time has passed"] },
  RECOVERY_CHECK: { title: "Recovery check", checks: ["Confirm the skill is back to a stable level"] },
};

export function VerificationSessionPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [searchParams] = useSearchParams();
  const skillId = searchParams.get("skillId") || "";
  const location = useLocation() as { state?: { skillName?: string; objective?: string } };
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("intro");
  const [current, setCurrent] = useState<CurrentQuestionResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const skillName = location.state?.skillName;
  const objective = location.state?.objective || current?.objective || "PROVISIONAL_CHECK";
  const copy = OBJECTIVE_COPY[objective] ?? OBJECTIVE_COPY.PROVISIONAL_CHECK;

  const loadCurrentQuestion = useCallback(async () => {
    if (!attemptId) return;
    const q = await api.getCurrentQuestion(attemptId);
    setCurrent(q);
    setSelected(null);
    setElapsed(0);
  }, [attemptId]);

  async function begin() {
    setBusy(true);
    try {
      await loadCurrentQuestion();
      setPhase("question");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the first question.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attemptId || !selected || !current) return;
    setBusy(true);
    setPhase("submitting");
    try {
      const outcome = await api.submitAnswer(attemptId, skillId, selected, Math.max(1, elapsed));
      if (outcome.isSessionComplete) {
        const res = await api.completeVerification(attemptId, skillId);
        setResult(res);
        setPhase("complete");
      } else {
        await loadCurrentQuestion();
        setPhase("question");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit your answer.");
      setPhase("question");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    return () => {
      // If the student navigates away mid-session (back button, closing the
      // tab's route), don't leave a dangling IN_PROGRESS attempt behind -
      // mark it abandoned so it doesn't confuse a later review-queue read.
      if (attemptId && phase !== "complete") {
        api.abandonVerification(attemptId).catch(() => undefined);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <p className="text-sm text-regressed">{error}</p>
        <Link to="/" className="text-sm text-ink-soft underline mt-4 inline-block">
          Back to mastery map
        </Link>
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        {skillName && <h1 className="font-display text-2xl mb-1">{skillName}</h1>}
        <p className="text-xs uppercase tracking-wide text-ink-faint mb-6">{copy.title}</p>
        <p className="text-sm text-ink-soft mb-6">ACEAPT will now check whether you can:</p>
        <ul className="space-y-2 mb-10 text-sm text-ink">
          {copy.checks.map((c) => (
            <li key={c} className="flex items-center justify-center gap-2">
              <span className="text-verified">✓</span> {c}
            </li>
          ))}
        </ul>
        <button onClick={begin} disabled={busy} className="rounded-md bg-ink text-paper text-sm px-6 py-3 hover:bg-ink/90 disabled:opacity-60">
          {busy ? "Starting..." : "Begin verification"}
        </button>
      </div>
    );
  }

  if ((phase === "question" || phase === "submitting") && current) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className="font-mono tabular text-xs text-ink-faint">
              {current.questionIndex + 1} / {current.totalQuestions}
            </span>
            {current.skillNameVisible && skillName && <span className="text-xs text-ink-faint">{skillName}</span>}
          </div>
          {current.question.timed && <Timer expectedSeconds={current.question.expectedTimeSeconds} onTick={setElapsed} />}
        </div>

        <p className="font-display text-xl leading-snug mb-8">{current.question.prompt}</p>

        <div className="space-y-2.5">
          {current.question.choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => setSelected(choice.id)}
              disabled={phase === "submitting"}
              className={`w-full text-left rounded-md border px-4 py-3 text-sm transition-colors ${
                selected === choice.id ? "border-ink bg-ink text-paper" : "border-line bg-paper-raised text-ink hover:border-ink-faint"
              }`}
            >
              {choice.text}
            </button>
          ))}
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={submit}
            disabled={!selected || phase === "submitting"}
            className="rounded-md bg-ink text-paper text-sm px-5 py-2.5 hover:bg-ink/90 disabled:opacity-40"
          >
            {phase === "submitting" ? "Submitting..." : "Submit answer"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "complete" && result) {
    const verified = result.result === "MASTERY_VERIFIED";
    return (
      <div className="max-w-lg mx-auto text-center py-10">
        <p className="text-xs uppercase tracking-wide text-ink-faint mb-2">{verified ? "Mastery verified" : "Mastery not stable yet"}</p>
        <div className="flex justify-center my-6">
          <CalibrationArc
            label="Overall confidence"
            value={
              result.confidence === "HIGH" ? 0.9 : result.confidence === "MEDIUM" ? 0.6 : 0.3
            }
            size="lg"
            tone={verified ? "verified" : "provisional"}
            formatValue={() => result.confidence}
          />
        </div>

        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto mb-8 text-left">
          {(["conceptScore", "transferScore", "retentionScore"] as const).map((key) => (
            <div key={key}>
              <p className="text-[10px] uppercase tracking-wide text-ink-faint">{key.replace("Score", "")}</p>
              <p className="font-mono tabular text-lg">{result.dimensions[key] !== null ? Math.round((result.dimensions[key] as number) * 100) : "-"}%</p>
            </div>
          ))}
        </div>

        {verified ? (
          <p className="text-sm text-ink-soft mb-8">ACEAPT has sufficient evidence that you can independently apply this skill.</p>
        ) : (
          <div className="text-sm text-ink-soft mb-8 space-y-2">
            <p>
              Correct on {result.correctCount} of {result.totalQuestions} questions this session.
            </p>
            {result.nextRecommendedFocus && (
              <p>
                Next recommended focus: <span className="text-ink font-medium">{result.nextRecommendedFocus}</span>
              </p>
            )}
          </div>
        )}

        <button onClick={() => navigate(`/skills/${skillId}`)} className="rounded-md bg-ink text-paper text-sm px-6 py-2.5 hover:bg-ink/90">
          Continue
        </button>
      </div>
    );
  }

  return <p className="text-sm text-ink-faint">Loading...</p>;
}

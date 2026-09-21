import styles from "./LadderRungs.module.css";
import type { AssistanceLevel } from "@/lib/hint-ladder/types";

const LABELS: Record<Exclude<AssistanceLevel, "INDEPENDENT">, string> = {
  DIRECTION: "direction",
  CONCEPT: "concept",
  TARGETED: "targeted",
  SPECIFIC: "specific",
  DETAILED: "detailed",
  SOLUTION_ASSISTANCE: "solution",
};

export interface LadderRungsProps {
  progression: Array<{ level: AssistanceLevel; reached: boolean; current: boolean }>;
  resolved: boolean;
}

/**
 * The product's signature visual: literal horizontal rungs rather than a
 * generic numbered stepper. Justified here (not just decorative) because
 * the assistance levels genuinely are an ordered progression the student
 * is climbing — the rung metaphor IS the mental model, not an add-on.
 */
export function LadderRungs({ progression, resolved }: LadderRungsProps) {
  return (
    <div className={styles.rungs} role="list" aria-label="Hint assistance progression">
      {progression.map((step) => {
        const label = LABELS[step.level as keyof typeof LABELS] ?? step.level.toLowerCase();
        const showResolved = resolved && step.reached;
        return (
          <div className={styles.rungRow} role="listitem" key={step.level}>
            <div className={styles.rungTrack}>
              <div
                className={styles.rungFill}
                data-reached={step.reached}
                data-current={step.current && !resolved}
                data-resolved={showResolved}
                style={{ transform: `scaleX(${step.reached ? 1 : 0})` }}
              />
            </div>
            <span className={styles.rungLabel} data-reached={step.reached} data-current={step.current && !resolved} data-resolved={showResolved}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

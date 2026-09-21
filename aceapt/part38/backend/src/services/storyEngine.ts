import { ProfessionalStory, ProjectEvidence, RankedStory } from "../types/domain";

/**
 * Picks the best-fit story for the given project. Prefers technical/challenge
 * stories that already have a measurable result; never invents one (spec
 * section 27 — STAR engine must never fabricate numbers or impact).
 */
export function selectBestStory(stories: ProfessionalStory[], project: ProjectEvidence | null): RankedStory | null {
  if (!project) return null;
  const candidates = stories.filter((s) => s.projectId === project.id);
  if (candidates.length === 0) return null;

  const scoreOf = (s: ProfessionalStory) =>
    (s.hasMeasurableResult ? 2 : 0) + (s.category === "technical" || s.category === "challenge" ? 1 : 0);

  const story = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a))[0];

  const reasons = ["Connected to your strongest relevant project"];
  if (story.hasMeasurableResult) {
    reasons.push("Includes a measurable result");
  } else {
    reasons.push("Add a measurable result if you have one");
  }

  return { story, reasons };
}

export interface StoryAngle {
  name: "backend" | "ai" | "product";
  label: string;
  steps: string[];
}

/**
 * Communication angles for a project (spec sections 24-25). These are fixed
 * checklists of what to cover, not generated text — the student fills in
 * their own real details for each step.
 */
export function generateStoryAngles(_project: ProjectEvidence): StoryAngle[] {
  return [
    {
      name: "backend",
      label: "Backend angle",
      steps: [
        "Problem",
        "Architecture",
        "API design",
        "Database",
        "Engineering decisions",
        "Challenges",
        "Result",
        "Lessons",
      ],
    },
    {
      name: "ai",
      label: "AI angle",
      steps: ["Problem", "Data", "Model", "Architecture", "Evaluation", "Deployment", "Limitations", "Lessons"],
    },
    {
      name: "product",
      label: "Product angle",
      steps: ["Problem", "Users", "Workflow", "Impact"],
    },
  ];
}

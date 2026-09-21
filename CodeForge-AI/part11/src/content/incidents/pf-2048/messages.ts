import { StakeholderTrigger } from "@/lib/engine/types";

export const stakeholderTriggers: StakeholderTrigger[] = [
  {
    persona: "Engineering Manager",
    triggerAfterMinutes: 5,
    prompt:
      "Quick check-in on PF-2048 — what's the current impact, what's your leading hypothesis, and do we have a mitigation path yet?",
    requiresFields: ["currentImpact", "hypothesis", "mitigation", "nextAction"],
  },
];

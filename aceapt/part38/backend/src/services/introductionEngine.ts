import { Differentiator, PositioningProfile, TargetRole } from "../types/domain";

export type IntroMode = "hr" | "technical" | "recruiter" | "founder" | "career-fair" | "networking";
export type IntroSeconds = 30 | 60 | 90;

const OPENING: Record<IntroMode, (roleName: string) => string> = {
  hr: (role) => `I'm currently focused on ${role.toLowerCase()} roles.`,
  technical: (role) => `I work primarily on ${role.toLowerCase()} problems.`,
  recruiter: (role) => `I'm exploring ${role.toLowerCase()} opportunities.`,
  founder: (role) => `I build ${role.toLowerCase()} systems end to end.`,
  "career-fair": (role) => `I'm interested in ${role.toLowerCase()} roles here.`,
  networking: (role) => `I'm focused on ${role.toLowerCase()} work.`,
};

/**
 * Composes an introduction purely from fields already computed on the
 * PositioningProfile. The underlying truth (evidence, differentiator) never
 * changes between modes — only which parts are foregrounded (spec section
 * 29).
 */
export function composeIntroduction(
  profile: PositioningProfile,
  role: TargetRole,
  mode: IntroMode,
  seconds: IntroSeconds
): string {
  const evidenceCount = seconds === 30 ? 2 : seconds === 60 ? 3 : 5;
  const evidenceNames = profile.strongestEvidence.slice(0, evidenceCount).map((c) => c.name);

  const opening = OPENING[mode](role.name);
  const middle = evidenceNames.length
    ? `My strongest, evidenced experience is in ${joinNatural(evidenceNames)}.`
    : "I'm still building up demonstrated evidence in this direction.";

  const differentiator: Differentiator | undefined = profile.differentiators[0];
  const closing = differentiator && seconds !== 30 ? `What sets my background apart is ${differentiator.description.toLowerCase()}.` : "";

  return [opening, middle, closing].filter(Boolean).join(" ");
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

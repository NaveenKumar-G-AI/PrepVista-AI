import type { ActivityType, DailyPlan, DailyPlanBlock, RoadmapSkill, WeeklyPlan } from '../domain/types';

const MIN_BLOCK_MINUTES = 10;

/**
 * Builds today's plan from the highest-priority actionable skills in the
 * current roadmap. Time allocation is computed from `dailyMinutes`, not
 * hardcoded — a 15-minute day gets one focused block; a 90-minute day gets
 * review + targeted practice + transfer + verification (Phase 16, 18).
 * Short days bias toward the single highest-priority item rather than
 * spreading too thin across many blocks.
 */
export function generateDailyPlan(planDate: string, actionableSkills: RoadmapSkill[], dailyMinutes: number): DailyPlan {
  const ranked = [...actionableSkills].sort((a, b) => b.priorityScore - a.priorityScore);
  if (ranked.length === 0) {
    return {
      planDate,
      primaryAction: 'No actionable skills right now — roadmap is up to date. Check back after your next attempt.',
      blocks: [],
    };
  }

  const blocks: DailyPlanBlock[] = [];
  let remaining = dailyMinutes;

  // Allocation shape scales with available time rather than being fixed.
  const wantsReview = dailyMinutes >= 45;
  const wantsTransfer = dailyMinutes >= 40;
  const wantsVerification = dailyMinutes >= 55;

  if (wantsReview && remaining >= MIN_BLOCK_MINUTES) {
    const reviewMinutes = Math.min(Math.round(dailyMinutes * 0.15), remaining - MIN_BLOCK_MINUTES);
    if (reviewMinutes >= MIN_BLOCK_MINUTES) {
      blocks.push(makeBlock(reviewMinutes, 'REVIEW', ranked[0]));
      remaining -= reviewMinutes;
    }
  }

  const top = ranked[0];
  const targetedType: ActivityType = top.gapStatus === 'UNKNOWN' ? 'EXPLORATION' : top.gapStatus === 'CRITICAL_GAP' ? 'TARGETED_PRACTICE' : 'PRACTICE';
  const targetedMinutes = wantsTransfer || wantsVerification ? Math.round(remaining * 0.55) : remaining;
  blocks.push(makeBlock(Math.max(MIN_BLOCK_MINUTES, targetedMinutes), targetedType, top));
  remaining -= Math.max(MIN_BLOCK_MINUTES, targetedMinutes);

  if (wantsTransfer && remaining >= MIN_BLOCK_MINUTES) {
    const transferSkill = ranked[1] ?? top;
    const transferMinutes = wantsVerification ? Math.round(remaining * 0.6) : remaining;
    blocks.push(makeBlock(Math.max(MIN_BLOCK_MINUTES, transferMinutes), 'TRANSFER', transferSkill));
    remaining -= Math.max(MIN_BLOCK_MINUTES, transferMinutes);
  }

  if (wantsVerification && remaining >= MIN_BLOCK_MINUTES) {
    blocks.push(makeBlock(remaining, 'VERIFICATION', top));
    remaining = 0;
  } else if (remaining > 0 && blocks.length > 0) {
    blocks[blocks.length - 1].minutes += remaining;
  }

  const primaryAction = `${activityLabel(blocks[blocks.length >= 2 ? 1 : 0].activityType)}: ${top.skillName}`;
  return { planDate, primaryAction, blocks };
}

function makeBlock(minutes: number, activityType: ActivityType, skill: RoadmapSkill): DailyPlanBlock {
  return {
    minutes,
    activityType,
    skillId: skill.skillId,
    skillName: skill.skillName,
    label: `${activityLabel(activityType)}: ${skill.skillName}`,
  };
}

function activityLabel(t: ActivityType): string {
  const map: Record<ActivityType, string> = {
    LEARN: 'Learn',
    PRACTICE: 'Practice',
    TARGETED_PRACTICE: 'Targeted practice',
    DEBUGGING: 'Debugging practice',
    TRANSFER: 'Transfer challenge',
    REVIEW: 'Review',
    VERIFICATION: 'Verification challenge',
    TIMED_CHALLENGE: 'Timed challenge',
    INTERVIEW_CHALLENGE: 'Interview-style challenge',
    EXPLORATION: 'Exploration / assessment',
  };
  return map[t];
}

export function generateWeeklyPlan(weekStart: string, actionableSkills: RoadmapSkill[]): WeeklyPlan {
  const top = [...actionableSkills].sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 2);
  if (top.length === 0) {
    return { weekStart, objective: 'Maintain current mastery — no active gaps this week.', requiredEvidence: [] };
  }
  const objective = `Move ${top.map((s) => s.skillName).join(' and ')} toward target mastery.`;
  const requiredEvidence = top.flatMap((s) => [
    `${s.gapStatus === 'UNKNOWN' ? 'Exploration' : 'Targeted practice'} attempts on ${s.skillName}`,
    `Independent success on ${s.skillName}`,
    `Transfer of ${s.skillName} to an unfamiliar problem`,
  ]);
  return { weekStart, objective, requiredEvidence };
}

/**
 * Missed-day recovery (Phase 20): does NOT replay stale blocks as mandatory
 * backlog. It simply regenerates a fresh plan from current priorities and
 * whatever time remains — old plan rows are left as historical record, not
 * carried forward.
 */
export function recoverFromMissedDays(
  planDate: string,
  actionableSkills: RoadmapSkill[],
  dailyMinutes: number
): DailyPlan {
  return generateDailyPlan(planDate, actionableSkills, dailyMinutes);
}

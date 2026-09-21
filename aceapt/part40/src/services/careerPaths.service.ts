import { PoolClient } from 'pg';
import { CareerBranch, CareerComparisonRow, FutureReadiness, ReadinessStatus, RoleChangeClassification } from '../types/feature40.types';
import * as marketIntel from './marketIntelligence.service';
import * as feature37 from '../integrations/feature37.adapter';
import * as feature34 from '../integrations/feature34.adapter';
import { getOpenFutureGaps } from './futureGap.service';
import { getRoleEvolution } from './roleEvolution.service';

const OVERLAP_SPECIALIST = 0.6; // shares most of the same core skills -> a specialization of the same role
const OVERLAP_ADJACENT = 0.3; // shares a meaningful chunk -> adjacent role

/** Finds candidate branch roles by skill-frequency overlap with the primary
 * role's latest snapshot -- not a hardcoded "AI Engineer -> these 3 roles"
 * table (spec ??108). */
export async function computeCareerBranching(
  client: PoolClient,
  studentId: string,
  primaryRoleId: string,
  primaryRoleTitle: string,
  period: string
): Promise<CareerBranch[]> {
  const primarySnapshots = await marketIntel.getSnapshots(client, primaryRoleId, 1);
  if (primarySnapshots.length === 0) return [];
  const primaryFreq = primarySnapshots[primarySnapshots.length - 1].skillFrequencies;
  const primarySkills = new Set(Object.keys(primaryFreq).filter((k) => primaryFreq[k] >= 0.15));

  const { rows: otherRoles } = await client.query(`SELECT id, title FROM roles WHERE id != $1`, [primaryRoleId]);
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  const branches: CareerBranch[] = [
    await buildBranch(client, 'PRIMARY', primaryRoleId, primaryRoleTitle, primarySkills, primarySkills, evidenceMap, period),
  ];

  for (const other of otherRoles) {
    const snapshots = await marketIntel.getSnapshots(client, other.id, 1);
    if (snapshots.length === 0) continue;
    const freq = snapshots[snapshots.length - 1].skillFrequencies;
    const otherSkills = new Set(Object.keys(freq).filter((k) => freq[k] >= 0.15));
    const overlap = jaccard(primarySkills, otherSkills);
    if (overlap < 0.15) continue; // unrelated, not worth showing

    const category = overlap >= OVERLAP_SPECIALIST ? 'SPECIALIST' : overlap >= OVERLAP_ADJACENT ? 'ADJACENT' : 'EMERGING';
    branches.push(await buildBranch(client, category, other.id, other.title, primarySkills, otherSkills, evidenceMap, period));
  }

  return branches.sort((a, b) => branchRank(a.category) - branchRank(b.category));
}

async function buildBranch(
  client: PoolClient,
  category: CareerBranch['category'],
  roleId: string,
  roleTitle: string,
  primarySkills: Set<string>,
  roleSkills: Set<string>,
  evidenceMap: Awaited<ReturnType<typeof feature37.getEvidenceMap>>,
  period: string
): Promise<CareerBranch> {
  const transferable = Array.from(roleSkills).filter((slug) => evidenceMap.has(slug));
  const gaps = Array.from(roleSkills).filter((slug) => !evidenceMap.has(slug)).slice(0, 5);
  const evolution = await getRoleEvolution(client, roleId, period);

  const { rows: nameRows } = await client.query(`SELECT slug, name FROM skills WHERE slug = ANY($1)`, [[...transferable, ...gaps]]);
  const nameBySlug = new Map<string, string>(nameRows.map((r: any) => [r.slug, r.name]));

  return {
    category, roleId, roleTitle,
    whyItFits:
      category === 'PRIMARY'
        ? 'Your current active target.'
        : `Shares ${Math.round(jaccard(primarySkills, roleSkills) * 100)}% of its core expected skills with your primary target.`,
    transferableSkills: transferable.map((s) => nameBySlug.get(s) ?? s),
    gaps: gaps.map((s) => nameBySlug.get(s) ?? s),
    requiredEvidence: gaps.slice(0, 3).map((s) => nameBySlug.get(s) ?? s),
    marketDirection: evolution?.classification ?? 'UNCERTAIN',
  };
}

function branchRank(c: CareerBranch['category']): number {
  return { PRIMARY: 0, SPECIALIST: 1, ADJACENT: 2, EMERGING: 3, EXPLORATORY: 4 }[c];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

export async function compareCareerPaths(
  client: PoolClient,
  studentId: string,
  roleIds: string[],
  period: string
): Promise<CareerComparisonRow[]> {
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  const rows: CareerComparisonRow[] = [];

  for (const roleId of roleIds) {
    const { rows: roleRows } = await client.query(`SELECT title FROM roles WHERE id = $1`, [roleId]);
    if (roleRows.length === 0) continue;
    const roleTitle = roleRows[0].title;

    const snapshots = await marketIntel.getSnapshots(client, roleId, 1);
    const freq = snapshots[snapshots.length - 1]?.skillFrequencies ?? {};
    const relevantSkills = Object.entries(freq).filter(([, v]) => v >= 0.15);
    const covered = relevantSkills.filter(([slug]) => evidenceMap.has(slug));
    const fitRatio = relevantSkills.length === 0 ? 0 : covered.length / relevantSkills.length;

    const gaps = await getOpenFutureGaps(client, studentId, roleId);
    const criticalOrHigh = gaps.filter((g) => g.severity === 'CRITICAL' || g.severity === 'HIGH').length;
    const evolution = await getRoleEvolution(client, roleId, period);

    rows.push({
      roleId, roleTitle,
      currentFit: describeFit(fitRatio),
      futureAdaptability: describeAdaptability(evolution?.classification ?? 'UNCERTAIN', covered.length),
      marketDirection: evolution?.classification ?? 'UNCERTAIN',
      aiTransformation: describeAiTransformation(evolution),
      learningEffort: criticalOrHigh >= 3 ? 'HIGH' : criticalOrHigh >= 1 ? 'MEDIUM' : 'LOW',
      evidenceRequirement: gaps.length >= 4 ? 'HIGH' : gaps.length >= 2 ? 'MEDIUM' : 'LOW',
    });
  }
  return rows;
}

function describeFit(ratio: number): string {
  if (ratio >= 0.7) return 'Strongly aligns with your validated evidence.';
  if (ratio >= 0.4) return 'Partially aligns with your validated evidence.';
  return 'Limited alignment with your validated evidence so far.';
}
function describeAdaptability(classification: RoleChangeClassification, coveredCount: number): string {
  if (classification === 'STABLE' || classification === 'DURABLE' as any) return 'Requirements have been stable -- lower near-term adaptation pressure.';
  if (classification === 'TRANSFORMING') return coveredCount >= 3 ? 'Role is transforming, but your existing coverage gives you a base to adapt from.' : 'Role is transforming and your current coverage is thin -- higher adaptation pressure.';
  if (classification === 'EVOLVING') return 'Role is evolving incrementally -- moderate, manageable adaptation pressure.';
  return 'Not enough signal yet to characterize adaptation pressure confidently.';
}
function describeAiTransformation(evolution: Awaited<ReturnType<typeof getRoleEvolution>>): string {
  if (!evolution) return 'Insufficient data.';
  const risk = evolution.aiImpact.potentialRisks.length;
  const opportunity = evolution.aiImpact.potentialOpportunities.length;
  if (risk > opportunity) return 'Current signals lean toward more AI-assistable tasks than human-critical ones for this role.';
  if (opportunity > risk) return 'Current signals show meaningful human-critical / AI-complementary skill presence for this role.';
  return 'Mixed AI-impact signal -- roughly balanced between AI-assisted and human-critical tasks.';
}

export async function computeFutureReadiness(
  client: PoolClient,
  studentId: string,
  primaryRoleId: string | null
): Promise<FutureReadiness | null> {
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  if (evidenceMap.size === 0) return null;

  const { rows: skillCatRows } = await client.query(`SELECT slug, category FROM skills`);
  const categoryBySlug = new Map<string, string>(skillCatRows.map((r: any) => [r.slug, r.category]));
  const evidenceSlugs = Array.from(evidenceMap.keys());
  const distinctCategories = new Set(evidenceSlugs.map((s) => categoryBySlug.get(s)).filter(Boolean));

  // Transferable skills: appear with meaningful frequency across >=2 roles' latest snapshots.
  const { rows: roleRows } = await client.query(`SELECT id FROM roles`);
  let transferableCount = 0;
  for (const slug of evidenceSlugs) {
    let appearsIn = 0;
    for (const role of roleRows) {
      const snaps = await marketIntel.getSnapshots(client, role.id, 1);
      if ((snaps[snaps.length - 1]?.skillFrequencies[slug] ?? 0) >= 0.15) appearsIn += 1;
    }
    if (appearsIn >= 2) transferableCount += 1;
  }
  const transferableRatio = transferableCount / evidenceSlugs.length;

  const verifiedTotal = Array.from(evidenceMap.values()).reduce((sum, e) => sum + e.verifiedCount, 0);
  const itemTotal = Array.from(evidenceMap.values()).reduce((sum, e) => sum + e.itemCount, 0);
  const avgStrength = Array.from(evidenceMap.values()).reduce((sum, e) => sum + e.strength, 0) / evidenceMap.size;

  const strongestShare = Math.max(...Array.from(evidenceMap.values()).map((e) => e.strength)) / (Array.from(evidenceMap.values()).reduce((s, e) => s + e.strength, 0) || 1);

  let marketAlignment: ReadinessStatus = 'UNKNOWN' as ReadinessStatus;
  let marketAlignmentExplanation = 'No active target role to evaluate alignment against.';
  if (primaryRoleId) {
    const gaps = await getOpenFutureGaps(client, studentId, primaryRoleId);
    const critical = gaps.filter((g) => g.severity === 'CRITICAL').length;
    marketAlignment = critical === 0 ? (gaps.length <= 2 ? 'STRONG' : 'DEVELOPING') : 'NEEDS_ATTENTION';
    marketAlignmentExplanation = `${gaps.length} open future gap(s) against your primary target, ${critical} of them critical.`;
  }

  const directions = await feature34.getAllTargetRoles(client, studentId);

  const dims = {
    transferableSkills: bucket(transferableRatio, 0.4, 0.2),
    evidenceDepth: bucket(itemTotal === 0 ? 0 : verifiedTotal / itemTotal, 0.6, 0.3) ,
    skillDiversity: bucket(distinctCategories.size / Math.max(3, distinctCategories.size), 0.6, 0.3),
    adaptability: bucket(1 - strongestShare, 0.55, 0.3),
    marketAlignment,
    roleDiversification: bucket(Math.min(directions.length, 3) / 3, 0.6, 0.3),
    emergingCapabilities: bucket(avgStrength, 0.6, 0.3),
  };

  const explanations: Record<string, string> = {
    transferableSkills: `${transferableCount} of ${evidenceSlugs.length} evidenced skills show up meaningfully across multiple roles.`,
    evidenceDepth: `${verifiedTotal} of ${itemTotal} evidence items are verified.`,
    skillDiversity: `Evidence spans ${distinctCategories.size} distinct skill categor${distinctCategories.size === 1 ? 'y' : 'ies'}.`,
    adaptability: `Your strongest single skill accounts for ${Math.round(strongestShare * 100)}% of total evidence strength -- lower is more distributed, and more adaptable.`,
    marketAlignment: marketAlignmentExplanation,
    roleDiversification: `${directions.length} active/exploratory target role(s) on file.`,
    emergingCapabilities: `Average validated evidence strength is ${Math.round(avgStrength * 100)}%.`,
  };

  const statuses = Object.values(dims);
  const needsAttentionCount = statuses.filter((s) => s === 'NEEDS_ATTENTION').length;
  const strongCount = statuses.filter((s) => s === 'STRONG').length;
  const overall: ReadinessStatus = needsAttentionCount >= 3 ? 'NEEDS_ATTENTION' : strongCount >= 4 ? 'STRONG' : 'DEVELOPING';

  return { dimensions: dims, overall, explanations };
}

function bucket(ratio: number, strongAt: number, developingAt: number): ReadinessStatus {
  if (Number.isNaN(ratio)) return 'UNKNOWN';
  if (ratio >= strongAt) return 'STRONG';
  if (ratio >= developingAt) return 'DEVELOPING';
  return 'NEEDS_ATTENTION';
}

/** Spec ??27 Skill Concentration Risk: true when a small number of skills
 * account for most of the student's total evidence strength. */
export async function hasSkillConcentrationRisk(client: PoolClient, studentId: string): Promise<{ atRisk: boolean; note: string | null }> {
  const evidenceMap = await feature37.getEvidenceMap(client, studentId);
  if (evidenceMap.size < 2) return { atRisk: false, note: null };
  const strengths = Array.from(evidenceMap.values()).map((e) => e.strength).sort((a, b) => b - a);
  const total = strengths.reduce((a, b) => a + b, 0) || 1;
  const top2Share = (strengths[0] + (strengths[1] ?? 0)) / total;
  if (top2Share >= 0.7) {
    return { atRisk: true, note: `Two skills currently account for about ${Math.round(top2Share * 100)}% of your total evidence strength.` };
  }
  return { atRisk: false, note: null };
}

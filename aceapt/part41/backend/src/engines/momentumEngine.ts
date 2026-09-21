import type { StrategyContext, Momentum } from '../types/strategy.js';
import { diffDays } from './utils.js';

const WINDOW_DAYS = 30;

/**
 * spec #15-16: CAREER MOMENTUM.
 * Compares the last WINDOW_DAYS against the WINDOW_DAYS before that across
 * concrete counts (evidence created, actions completed, positive outcomes,
 * opportunity engagement) rather than a streak counter (spec: "avoid
 * simplistic streak mechanics").
 */
export function assessMomentum(ctx: StrategyContext): Momentum {
  const now = new Date(ctx.asOf);
  const recentCutoff = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const priorCutoff = new Date(recentCutoff.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const inWindow = (dateStr: string, start: Date, end: Date) => {
    const d = new Date(dateStr);
    return d >= start && d < end;
  };

  const recentEvidence = ctx.evidence.filter((e) => inWindow(e.createdAt, recentCutoff, now)).length;
  const priorEvidence = ctx.evidence.filter((e) => inWindow(e.createdAt, priorCutoff, recentCutoff)).length;

  const recentCompleted = ctx.recentActions.filter((a) => a.completedAt && inWindow(a.completedAt, recentCutoff, now)).length;
  const priorCompleted = ctx.recentActions.filter((a) => a.completedAt && inWindow(a.completedAt, priorCutoff, recentCutoff)).length;

  const recentPositiveOutcomes = ctx.recentOutcomes.filter((o) => o.positive && inWindow(o.recordedAt, recentCutoff, now)).length;
  const priorPositiveOutcomes = ctx.recentOutcomes.filter((o) => o.positive && inWindow(o.recordedAt, priorCutoff, recentCutoff)).length;

  const recentApplications = ctx.applications.filter((a) => inWindow(a.appliedAt, recentCutoff, now)).length;
  const priorApplications = ctx.applications.filter((a) => inWindow(a.appliedAt, priorCutoff, recentCutoff)).length;

  const recentTotal = recentEvidence + recentCompleted + recentPositiveOutcomes + recentApplications;
  const priorTotal = priorEvidence + priorCompleted + priorPositiveOutcomes + priorApplications;

  if (recentTotal === 0 && priorTotal === 0) {
    return { trend: 'unknown', drivers: ['Not enough recent activity in the last 60 days to judge momentum.'] };
  }

  const drivers: string[] = [];
  if (recentEvidence > priorEvidence) drivers.push(`${recentEvidence} new piece(s) of evidence added in the last ${WINDOW_DAYS} days (vs ${priorEvidence} before).`);
  if (recentCompleted > priorCompleted) drivers.push(`${recentCompleted} action(s) completed recently (vs ${priorCompleted} before).`);
  if (recentPositiveOutcomes > priorPositiveOutcomes) drivers.push(`${recentPositiveOutcomes} positive outcome(s) recorded recently (vs ${priorPositiveOutcomes} before).`);
  if (recentApplications > priorApplications) drivers.push(`Application activity picked up (${recentApplications} vs ${priorApplications}).`);

  const declineDrivers: string[] = [];
  if (recentEvidence < priorEvidence) declineDrivers.push('Evidence creation slowed down.');
  if (recentCompleted < priorCompleted) declineDrivers.push('Fewer actions were completed than the period before.');
  if (recentApplications < priorApplications) declineDrivers.push('Application activity slowed down.');

  let trend: Momentum['trend'];
  if (recentTotal > priorTotal * 1.15) trend = 'improving';
  else if (recentTotal < priorTotal * 0.85) trend = 'declining';
  else trend = 'stable';

  const finalDrivers = trend === 'declining' ? declineDrivers : trend === 'improving' ? drivers : [...drivers, ...declineDrivers];

  return {
    trend,
    drivers: finalDrivers.length > 0 ? finalDrivers : ['Activity levels are similar to the prior period.'],
  };
}

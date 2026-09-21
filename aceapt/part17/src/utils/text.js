function humanizeSkill(skillId) {
  if (!skillId) return 'this skill';
  return String(skillId)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function humanizeTopic(skillId) {
  if (!skillId) return 'Quantitative Aptitude';
  if (skillId.includes('percentage')) return 'Percentage';
  if (skillId.includes('ratio')) return 'Ratio';
  if (skillId.includes('profit')) return 'Profit & Loss';
  if (skillId.includes('time-work')) return 'Time & Work';
  if (skillId.includes('average')) return 'Average';
  return 'Quantitative Aptitude';
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

module.exports = { humanizeSkill, humanizeTopic, clamp01, round2 };

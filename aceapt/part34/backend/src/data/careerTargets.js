/*
 * Career target catalog: required capabilities (with weight + target level)
 * plus a small intervention catalog per capability.
 *
 * This is illustrative content for the MVP demo, shaped the way real
 * ACEAPT target/capability data would be shaped, so it's a narrow swap for
 * a real data source (or a repository call into ACEAPT's own target
 * definitions) later - see ARCHITECTURE.md, "Reuse before creating".
 */

export const CAREER_TARGETS = {
  backend_developer: {
    id: 'backend_developer',
    title: 'Backend Developer',
    capabilities: [
      { capability: 'dsa', label: 'Data Structures & Algorithms', weight: 1.0, targetLevel: 75 },
      { capability: 'api_development', label: 'API Development', weight: 1.0, targetLevel: 75 },
      { capability: 'system_design', label: 'System Design', weight: 0.7, targetLevel: 65 },
      { capability: 'database_fundamentals', label: 'Database Fundamentals', weight: 0.8, targetLevel: 70 },
      { capability: 'technical_interview_communication', label: 'Technical Interview Communication', weight: 0.9, targetLevel: 75 },
    ],
  },
  data_analyst: {
    id: 'data_analyst',
    title: 'Data Analyst',
    capabilities: [
      { capability: 'database_fundamentals', label: 'Database Fundamentals (SQL)', weight: 1.0, targetLevel: 75 },
      { capability: 'statistics', label: 'Statistics', weight: 1.0, targetLevel: 70 },
      { capability: 'data_visualization', label: 'Data Visualization', weight: 0.8, targetLevel: 65 },
      { capability: 'business_communication', label: 'Business Communication', weight: 0.7, targetLevel: 65 },
      { capability: 'technical_interview_communication', label: 'Technical Interview Communication', weight: 0.6, targetLevel: 65 },
    ],
  },
  ml_engineer: {
    id: 'ml_engineer',
    title: 'ML Engineer',
    capabilities: [
      { capability: 'dsa', label: 'Data Structures & Algorithms', weight: 0.7, targetLevel: 70 },
      { capability: 'statistics', label: 'Statistics', weight: 1.0, targetLevel: 75 },
      { capability: 'ml_fundamentals', label: 'ML Fundamentals', weight: 1.0, targetLevel: 75 },
      { capability: 'system_design', label: 'System Design', weight: 0.7, targetLevel: 65 },
      { capability: 'technical_interview_communication', label: 'Technical Interview Communication', weight: 0.8, targetLevel: 75 },
    ],
  },
};

export const INTERVENTION_CATALOG = {
  dsa: ['Timed DSA practice set (mixed difficulty)', 'Peer mock problem-solving session'],
  api_development: ['Build a small REST API project', 'API design review exercise'],
  system_design: ['Guided system design case study', 'Write a one-page design doc for a real system'],
  database_fundamentals: ['Applied SQL challenge set', 'Schema design practice exercise'],
  technical_interview_communication: [
    'Opportunity-aligned technical interview simulation',
    'Structured behavioral interview practice',
    'Timed whiteboard communication drill',
  ],
  statistics: ['Applied statistics problem set', 'Case-study based statistics practice'],
  data_visualization: ['Build one dashboard from a real dataset', 'Chart critique exercise'],
  business_communication: ['Mock stakeholder readout practice', 'Written summary practice'],
  ml_fundamentals: ['Applied ML mini-project', 'Model evaluation case study'],
};

export function getTarget(targetId) {
  return CAREER_TARGETS[targetId] || null;
}

export function listTargets() {
  return Object.values(CAREER_TARGETS).map((t) => ({ id: t.id, title: t.title }));
}

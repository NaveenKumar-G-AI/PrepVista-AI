'use strict';

/**
 * Canonical capability catalog.
 *
 * ASSUMPTION: no existing ACEAPT codebase was provided in this build session,
 * so this is a minimal stand-in for whatever Capability table already exists
 * in the real platform (spec section 71: "Reuse existing... Capability...
 * Do not create duplicate student/capability/readiness models"). Replace
 * `findCapabilityByText` with a lookup against the real table and this file
 * becomes unnecessary.
 */
const CAPABILITIES = [
  { id: 'cap_python', name: 'Python', category: 'technical', aliases: ['python3', 'py'] },
  { id: 'cap_sql', name: 'SQL', category: 'technical', aliases: ['mysql', 'postgresql', 'postgres', 'structured query language'] },
  { id: 'cap_data_structures', name: 'Data Structures', category: 'technical', aliases: ['dsa', 'data structures and algorithms'] },
  { id: 'cap_algorithms', name: 'Algorithms', category: 'technical', aliases: [] },
  { id: 'cap_system_design', name: 'System Design', category: 'technical', aliases: ['systems design', 'hld', 'high level design'] },
  { id: 'cap_rest_apis', name: 'REST APIs', category: 'technical', aliases: ['apis', 'api development', 'restful apis', 'rest'] },
  { id: 'cap_git', name: 'Git', category: 'tool', aliases: ['github', 'version control'] },
  { id: 'cap_fastapi', name: 'FastAPI', category: 'tool', aliases: [] },
  { id: 'cap_power_bi', name: 'Power BI', category: 'tool', aliases: ['powerbi'] },
  { id: 'cap_communication', name: 'Communication', category: 'soft', aliases: ['verbal communication', 'written communication'] },
  { id: 'cap_java', name: 'Java', category: 'technical', aliases: [] },
  { id: 'cap_javascript', name: 'JavaScript', category: 'technical', aliases: ['js', 'node', 'nodejs'] },
  { id: 'cap_react', name: 'React', category: 'technical', aliases: ['reactjs'] },
  { id: 'cap_machine_learning', name: 'Machine Learning', category: 'technical', aliases: ['ml'] },
];

/**
 * The generic capability set a student preparing for a given target is
 * expected to build, independent of any single opportunity. This is what
 * lets Feature 33 separate TARGET GAP from OPPORTUNITY GAP (spec section 22)
 * using real membership checks instead of hardcoded text.
 */
const TARGET_CORE_CAPABILITIES = {
  target_software_developer: ['cap_python', 'cap_data_structures', 'cap_algorithms', 'cap_system_design', 'cap_sql', 'cap_git', 'cap_rest_apis'],
  target_data_analyst: ['cap_sql', 'cap_python', 'cap_power_bi', 'cap_communication'],
  target_ml_engineer: ['cap_python', 'cap_machine_learning', 'cap_data_structures', 'cap_sql'],
};

/**
 * Deliberately simple and explainable: exact/alias match first, then a
 * conservative substring fallback. No fuzzy-distance guessing - an
 * unmatched requirement is left unmapped (confidence: 'low') rather than
 * forced onto the nearest capability. See spec section 66 (AI ROLE): this
 * rule-based pass is the default; AI classification is opt-in and only
 * fills gaps this function leaves behind.
 */
function findCapabilityByText(text) {
  if (!text) return null;
  const normalized = text.trim().toLowerCase();

  for (const cap of CAPABILITIES) {
    if (cap.name.toLowerCase() === normalized) return cap;
    if (cap.aliases.some((a) => a.toLowerCase() === normalized)) return cap;
  }
  for (const cap of CAPABILITIES) {
    if (normalized.includes(cap.name.toLowerCase())) return cap;
    if (cap.aliases.some((a) => normalized.includes(a.toLowerCase()))) return cap;
  }
  return null;
}

module.exports = { CAPABILITIES, TARGET_CORE_CAPABILITIES, findCapabilityByText };

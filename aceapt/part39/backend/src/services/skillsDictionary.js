// A maintained list of recognizable skill terms + synonym normalization.
// This is intentionally a plain data file (not AI) because skill matching
// must stay deterministic and explainable (see matchingEngine.js).

const SKILLS = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift',
  'React', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Next.js',
  'HTML', 'CSS', 'Tailwind', 'REST APIs', 'GraphQL', 'gRPC', 'WebSockets',
  'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'Elasticsearch',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'Jenkins', 'GitHub Actions',
  'Git', 'Linux', 'Bash', 'Testing', 'Unit Testing', 'Test Automation', 'Selenium', 'Jest', 'Cypress',
  'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'TensorFlow', 'PyTorch', 'Scikit-learn',
  'Pandas', 'NumPy', 'Data Analysis', 'Data Visualization', 'Power BI', 'Tableau', 'Excel',
  'System Design', 'Microservices', 'Object-Oriented Design', 'Data Structures', 'Algorithms',
  'Agile', 'Scrum', 'Jira', 'Communication', 'Leadership', 'Problem Solving', 'Teamwork',
  'Android', 'iOS', 'Flutter', 'React Native', 'Figma', 'UI/UX Design', 'Product Management',
  'Networking', 'Cybersecurity', 'DevOps', 'Cloud Architecture', 'Salesforce', 'SAP', 'Blockchain',
];

// lowercase synonym -> canonical skill name
const SYNONYMS = {
  'js': 'JavaScript', 'ts': 'TypeScript', 'nodejs': 'Node.js', 'node': 'Node.js',
  'postgres': 'PostgreSQL', 'psql': 'PostgreSQL', 'mongo': 'MongoDB', 'py': 'Python',
  'react.js': 'React', 'reactjs': 'React', 'vuejs': 'Vue', 'vue.js': 'Vue',
  'rest api': 'REST APIs', 'restful api': 'REST APIs', 'restful apis': 'REST APIs', 'rest': 'REST APIs',
  'k8s': 'Kubernetes', 'ml': 'Machine Learning', 'dl': 'Deep Learning', 'cv': 'Computer Vision',
  'oop': 'Object-Oriented Design', 'ds&a': 'Data Structures', 'dsa': 'Data Structures',
  'unit tests': 'Unit Testing', 'qa': 'Testing', 'quality assurance': 'Testing',
  'ui ux': 'UI/UX Design', 'ux': 'UI/UX Design', 'ui': 'UI/UX Design',
  'sql server': 'SQL', 'mysql db': 'MySQL', 'tensor flow': 'TensorFlow',
};

function normalizeSkill(text) {
  if (!text) return null;
  const key = text.trim().toLowerCase();
  if (SYNONYMS[key]) return SYNONYMS[key];
  const exact = SKILLS.find((s) => s.toLowerCase() === key);
  if (exact) return exact;
  return null;
}

// Find every dictionary skill mentioned in a block of free text.
// Returns canonical skill names, deduplicated, in order of first appearance.
function extractSkillsFromText(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  const haystack = ` ${text.replace(/\s+/g, ' ')} `;

  const candidates = [...SKILLS, ...Object.keys(SYNONYMS)].sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // word-boundary-ish match that still tolerates punctuation like "C++" / "CI/CD"
    const pattern = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?:$|[^a-zA-Z0-9])`, 'i');
    if (pattern.test(haystack)) {
      const canonical = normalizeSkill(candidate) || candidate;
      if (!seen.has(canonical)) {
        seen.add(canonical);
        found.push(canonical);
      }
    }
  }
  return found;
}

module.exports = { SKILLS, normalizeSkill, extractSkillsFromText };

// Deterministic seed content (Step 46: "Do not use random generation").
// This is the one place the taxonomy content lives; both the SQLite
// prototype and the docs/reporting scripts read from here.
//
// Taxonomy resolution note (Step 89 "content red team"): the source brief's
// Step 9 example nests general programming sub-topics (Functions, Classes,
// Exception Handling, Async) directly under "Python." We instead model
// those as language-agnostic skills under the competency "Programming",
// and keep Python as a Technology. Otherwise "Exception Handling" would
// have to be duplicated once per language, which breaks the reusability
// principle Step 20 itself requires for Python. Technologies answer "what
// will I use"; skills answer "what can I demonstrate, in any language."

import type {
  ContentStatus,
  Importance,
  Proficiency,
  TechnologyType,
  TechnologyUsage,
} from '../domain/types.js';

export const domains = [
  { slug: 'software-technology', name: 'Software & Technology', description: 'Building, testing, and operating software systems.' },
  { slug: 'data-ai', name: 'Data & Artificial Intelligence', description: 'Extracting insight from data and building systems that learn from it.' },
] as const;

export const families = [
  { slug: 'software-development', name: 'Software Development', domain: 'software-technology', description: 'Roles centered on designing and building application software.' },
  { slug: 'cloud-infrastructure', name: 'Cloud & Infrastructure', domain: 'software-technology', description: 'Roles centered on the platforms software runs on.' },
  { slug: 'ai-machine-learning', name: 'AI & Machine Learning', domain: 'data-ai', description: 'Roles centered on building systems that learn from data.' },
  { slug: 'data-analytics', name: 'Data & Analytics', domain: 'data-ai', description: 'Roles centered on collecting, moving, and interpreting data.' },
] as const;

export const competencies = [
  { slug: 'programming', name: 'Programming', description: 'Writing correct, readable, and maintainable code to implement logic and solve problems.' },
  { slug: 'data-structures-algorithms', name: 'Data Structures & Algorithms', description: 'Selecting and applying data structures and algorithms to solve problems efficiently.' },
  { slug: 'problem-solving', name: 'Problem Solving', description: 'Breaking down ambiguous or complex problems into solvable, well-scoped steps.' },
  { slug: 'debugging', name: 'Debugging', description: 'Diagnosing and correcting defects in existing code or running systems.' },
  { slug: 'testing-quality', name: 'Testing & Quality Engineering', description: 'Verifying that software behaves correctly and continues to as it changes.' },
  { slug: 'databases', name: 'Databases', description: 'Modeling, storing, and querying data reliably and efficiently.' },
  { slug: 'api-design-integration', name: 'API Design & Integration', description: 'Designing and consuming interfaces between software components and services.' },
  { slug: 'software-architecture', name: 'Software Architecture & System Design', description: 'Structuring systems so they stay scalable, maintainable, and reliable as they grow.' },
  { slug: 'version-control-collaboration', name: 'Version Control & Collaboration', description: 'Working with others on shared code safely using version control workflows.' },
  { slug: 'engineering-communication', name: 'Engineering Communication', description: 'Explaining technical decisions and trade-offs clearly to others.' },
  { slug: 'ui-ux-implementation', name: 'UI/UX Implementation', description: 'Building interfaces that are usable, accessible, and visually correct.' },
  { slug: 'statistics-probability', name: 'Statistics & Probability', description: 'Reasoning quantitatively about data, variability, and uncertainty.' },
  { slug: 'data-analysis', name: 'Data Analysis & Manipulation', description: 'Cleaning, transforming, and exploring data to answer concrete questions.' },
  { slug: 'machine-learning', name: 'Machine Learning', description: 'Building and evaluating models that learn patterns from data.' },
  { slug: 'data-engineering', name: 'Data Engineering', description: 'Building reliable pipelines that move and transform data at scale.' },
  { slug: 'cloud-infrastructure-ops', name: 'Cloud Infrastructure & Operations', description: 'Provisioning, automating, and operating systems on cloud platforms.' },
  { slug: 'business-stakeholder-interpretation', name: 'Business & Stakeholder Interpretation', description: 'Connecting technical findings and systems to business meaning and decisions.' },
] as const;

interface SkillSeed {
  slug: string;
  name: string;
  description: string;
  competency: string;
  category: string;
  parent?: string;
}

export const skills: SkillSeed[] = [
  // Programming
  { slug: 'functions-modular-design', name: 'Functions & Modular Design', description: 'Structuring code into small, well-named, reusable functions.', competency: 'programming', category: 'FUNDAMENTALS' },
  { slug: 'object-oriented-programming', name: 'Object-Oriented Programming', description: 'Modeling problems using classes, objects, and encapsulation.', competency: 'programming', category: 'FUNDAMENTALS' },
  { slug: 'exception-handling', name: 'Exception & Error Handling', description: 'Anticipating and handling error conditions safely.', competency: 'programming', category: 'FUNDAMENTALS' },
  { slug: 'async-concurrent-programming', name: 'Asynchronous & Concurrent Programming', description: 'Writing code that handles asynchronous or concurrent execution correctly.', competency: 'programming', category: 'FUNDAMENTALS' },
  { slug: 'code-readability-style', name: 'Code Readability & Style', description: 'Writing code that others can read, review, and extend easily.', competency: 'programming', category: 'FUNDAMENTALS' },
  // Data Structures & Algorithms
  { slug: 'arrays-strings', name: 'Arrays & Strings', description: 'Manipulating arrays and strings efficiently and correctly.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  { slug: 'hashing', name: 'Hashing', description: 'Using hash-based structures for fast lookup.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  { slug: 'hashing-collision-handling', name: 'Collision Handling', description: 'Resolving hash collisions (chaining, open addressing).', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS', parent: 'hashing' },
  { slug: 'hashing-load-factor-resizing', name: 'Load Factor & Resizing', description: 'Managing load factor and resizing hash tables.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS', parent: 'hashing' },
  { slug: 'trees-graphs', name: 'Trees & Graphs', description: 'Traversing and manipulating tree and graph structures.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  { slug: 'sorting-searching', name: 'Sorting & Searching', description: 'Applying and reasoning about sorting and searching algorithms.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  { slug: 'dynamic-programming', name: 'Dynamic Programming', description: 'Solving problems by breaking them into overlapping subproblems.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  { slug: 'complexity-analysis', name: 'Complexity Analysis (Big-O)', description: 'Estimating the time and space cost of an approach.', competency: 'data-structures-algorithms', category: 'FUNDAMENTALS' },
  // Problem Solving
  { slug: 'requirement-decomposition', name: 'Requirement Decomposition', description: 'Turning a vague problem statement into concrete, solvable pieces.', competency: 'problem-solving', category: 'FUNDAMENTALS' },
  { slug: 'edge-case-reasoning', name: 'Edge Case Reasoning', description: 'Identifying and handling boundary and exceptional cases.', competency: 'problem-solving', category: 'FUNDAMENTALS' },
  { slug: 'tradeoff-analysis', name: 'Trade-off Analysis', description: 'Weighing correctness, simplicity, performance, and time against each other.', competency: 'problem-solving', category: 'FUNDAMENTALS' },
  // Debugging
  { slug: 'reading-stack-traces', name: 'Reading Stack Traces', description: 'Interpreting errors and stack traces to locate a fault.', competency: 'debugging', category: 'QUALITY' },
  { slug: 'root-cause-isolation', name: 'Root Cause Isolation', description: "Narrowing a defect down to its actual cause, not just its symptom.", competency: 'debugging', category: 'QUALITY' },
  { slug: 'debugger-logging-use', name: 'Debugger & Logging Use', description: 'Using debuggers, breakpoints, and logging to inspect runtime behavior.', competency: 'debugging', category: 'QUALITY' },
  // Testing & Quality
  { slug: 'unit-testing', name: 'Unit Testing', description: 'Writing tests that verify individual units of code in isolation.', competency: 'testing-quality', category: 'QUALITY' },
  { slug: 'unit-testing-case-design', name: 'Test Case Design', description: 'Choosing test cases that cover typical, edge, and failure paths.', competency: 'testing-quality', category: 'QUALITY', parent: 'unit-testing' },
  { slug: 'unit-testing-mocking', name: 'Mocking & Stubbing', description: 'Isolating a unit under test from its dependencies.', competency: 'testing-quality', category: 'QUALITY', parent: 'unit-testing' },
  { slug: 'integration-testing', name: 'Integration Testing', description: 'Verifying that multiple components work correctly together.', competency: 'testing-quality', category: 'QUALITY' },
  { slug: 'test-automation', name: 'Test Automation', description: 'Automating repeatable test execution as part of a workflow.', competency: 'testing-quality', category: 'QUALITY' },
  { slug: 'exploratory-manual-testing', name: 'Exploratory & Manual Testing', description: 'Actively probing a system for defects without a fixed script.', competency: 'testing-quality', category: 'QUALITY' },
  // Databases
  { slug: 'relational-modeling', name: 'Relational Modeling', description: 'Designing normalized relational schemas.', competency: 'databases', category: 'DATA' },
  { slug: 'sql-querying', name: 'SQL Querying', description: 'Writing correct and efficient SQL queries.', competency: 'databases', category: 'DATA' },
  { slug: 'indexing-query-performance', name: 'Indexing & Query Performance', description: 'Using indexes and query plans to keep queries fast.', competency: 'databases', category: 'DATA' },
  { slug: 'nosql-data-modeling', name: 'NoSQL Data Modeling', description: 'Modeling data for non-relational stores such as document databases.', competency: 'databases', category: 'DATA' },
  // API Design & Integration
  { slug: 'rest-api-design', name: 'REST API Design', description: 'Designing clear, consistent REST APIs.', competency: 'api-design-integration', category: 'FUNDAMENTALS' },
  { slug: 'auth-basics', name: 'Authentication & Authorization Basics', description: 'Applying baseline authentication and authorization patterns.', competency: 'api-design-integration', category: 'FUNDAMENTALS' },
  { slug: 'api-documentation', name: 'API Documentation', description: 'Documenting an API so other developers can use it correctly.', competency: 'api-design-integration', category: 'COMMUNICATION' },
  { slug: 'third-party-integration', name: 'Third-Party Integration', description: 'Integrating reliably with external services and APIs.', competency: 'api-design-integration', category: 'FUNDAMENTALS' },
  // Software Architecture
  { slug: 'component-service-decomposition', name: 'Component/Service Decomposition', description: 'Splitting a system into cohesive, loosely coupled parts.', competency: 'software-architecture', category: 'FUNDAMENTALS' },
  { slug: 'scalability-fundamentals', name: 'Scalability Fundamentals', description: 'Designing systems that can handle growing load.', competency: 'software-architecture', category: 'FUNDAMENTALS' },
  { slug: 'design-patterns', name: 'Design Patterns', description: 'Recognizing and applying common, well-understood design patterns.', competency: 'software-architecture', category: 'FUNDAMENTALS' },
  { slug: 'secure-coding-basics', name: 'Secure Coding Basics', description: 'Applying baseline secure-coding practices to avoid common vulnerabilities.', competency: 'software-architecture', category: 'QUALITY' },
  // Version Control & Collaboration
  { slug: 'git-fundamentals', name: 'Git Fundamentals', description: 'Using version control to track and share changes safely.', competency: 'version-control-collaboration', category: 'COLLABORATION' },
  { slug: 'branching-code-review', name: 'Branching & Code Review', description: "Working with branches and reviewing others' code constructively.", competency: 'version-control-collaboration', category: 'COLLABORATION' },
  // Engineering Communication
  { slug: 'technical-writing', name: 'Technical Writing', description: 'Writing clear technical documentation and explanations.', competency: 'engineering-communication', category: 'COMMUNICATION' },
  { slug: 'presenting-technical-work', name: 'Presenting Technical Work', description: 'Explaining technical work and decisions to a range of audiences.', competency: 'engineering-communication', category: 'COMMUNICATION' },
  // UI/UX Implementation
  { slug: 'component-based-ui', name: 'Component-Based UI Development', description: 'Building interfaces from reusable, composable components.', competency: 'ui-ux-implementation', category: 'PRODUCT' },
  { slug: 'responsive-layout', name: 'Responsive Layout', description: 'Building layouts that work well across screen sizes.', competency: 'ui-ux-implementation', category: 'PRODUCT' },
  { slug: 'accessibility-basics', name: 'Accessibility Basics', description: 'Building interfaces usable with assistive technology and a keyboard.', competency: 'ui-ux-implementation', category: 'PRODUCT' },
  { slug: 'frontend-state-management', name: 'Frontend State Management', description: 'Managing UI state predictably as an interface grows.', competency: 'ui-ux-implementation', category: 'PRODUCT' },
  // Statistics & Probability
  { slug: 'descriptive-statistics', name: 'Descriptive Statistics', description: 'Summarizing data with measures of central tendency and spread.', competency: 'statistics-probability', category: 'DATA' },
  { slug: 'probability-fundamentals', name: 'Probability Fundamentals', description: 'Reasoning about likelihood and random variables.', competency: 'statistics-probability', category: 'DATA' },
  { slug: 'hypothesis-testing', name: 'Hypothesis Testing', description: 'Using statistical tests to evaluate claims about data.', competency: 'statistics-probability', category: 'DATA' },
  { slug: 'statistical-inference', name: 'Statistical Inference', description: 'Drawing conclusions about a population from a sample.', competency: 'statistics-probability', category: 'DATA' },
  // Data Analysis
  { slug: 'data-cleaning', name: 'Data Cleaning', description: 'Identifying and correcting errors, gaps, and inconsistencies in data.', competency: 'data-analysis', category: 'DATA' },
  { slug: 'exploratory-data-analysis', name: 'Exploratory Data Analysis', description: 'Exploring a dataset to find patterns before formal modeling.', competency: 'data-analysis', category: 'DATA' },
  { slug: 'data-manipulation', name: 'Data Manipulation', description: 'Transforming and reshaping data with code or SQL.', competency: 'data-analysis', category: 'DATA' },
  { slug: 'data-visualization', name: 'Data Visualization', description: 'Representing data visually so patterns are easy to see.', competency: 'data-analysis', category: 'DATA' },
  // Machine Learning
  { slug: 'supervised-learning', name: 'Supervised Learning', description: 'Training models from labeled examples.', competency: 'machine-learning', category: 'DATA' },
  { slug: 'unsupervised-learning', name: 'Unsupervised Learning', description: 'Finding structure in data without labels.', competency: 'machine-learning', category: 'DATA' },
  { slug: 'feature-engineering', name: 'Feature Engineering', description: 'Constructing informative inputs for a model.', competency: 'machine-learning', category: 'DATA' },
  { slug: 'model-evaluation', name: 'Model Evaluation', description: 'Measuring how well a model performs and where it fails.', competency: 'machine-learning', category: 'DATA' },
  // Data Engineering
  { slug: 'etl-elt-pipeline-design', name: 'ETL/ELT Pipeline Design', description: 'Designing pipelines that extract, transform, and load data reliably.', competency: 'data-engineering', category: 'INFRASTRUCTURE' },
  { slug: 'workflow-orchestration', name: 'Workflow Orchestration', description: 'Scheduling and coordinating multi-step data workflows.', competency: 'data-engineering', category: 'INFRASTRUCTURE' },
  { slug: 'data-quality-validation', name: 'Data Quality & Validation', description: 'Checking that data entering a pipeline meets expected rules.', competency: 'data-engineering', category: 'INFRASTRUCTURE' },
  { slug: 'batch-streaming-processing', name: 'Batch vs. Streaming Processing', description: 'Choosing and implementing batch or streaming processing approaches.', competency: 'data-engineering', category: 'INFRASTRUCTURE' },
  // Cloud Infrastructure & Ops
  { slug: 'infrastructure-as-code', name: 'Infrastructure as Code', description: 'Defining infrastructure declaratively and reproducibly.', competency: 'cloud-infrastructure-ops', category: 'INFRASTRUCTURE' },
  { slug: 'ci-cd-pipelines', name: 'CI/CD Pipelines', description: 'Automating build, test, and release steps.', competency: 'cloud-infrastructure-ops', category: 'INFRASTRUCTURE' },
  { slug: 'monitoring-incident-response', name: 'Monitoring & Incident Response', description: 'Detecting, diagnosing, and responding to production issues.', competency: 'cloud-infrastructure-ops', category: 'INFRASTRUCTURE' },
  { slug: 'compute-networking-fundamentals', name: 'Compute & Networking Fundamentals', description: 'Understanding compute, storage, and networking basics on a cloud platform.', competency: 'cloud-infrastructure-ops', category: 'INFRASTRUCTURE' },
  // Business & Stakeholder Interpretation
  { slug: 'requirements-gathering', name: 'Requirements Gathering', description: 'Understanding what a stakeholder actually needs, not just what they ask for.', competency: 'business-stakeholder-interpretation', category: 'COMMUNICATION' },
  { slug: 'translating-data-to-insight', name: 'Translating Data to Insight', description: 'Turning analysis into a clear, actionable takeaway.', competency: 'business-stakeholder-interpretation', category: 'COMMUNICATION' },
  { slug: 'stakeholder-communication', name: 'Stakeholder Communication', description: 'Communicating findings and recommendations to non-technical audiences.', competency: 'business-stakeholder-interpretation', category: 'COMMUNICATION' },
];

interface TechnologySeed {
  slug: string;
  name: string;
  type: TechnologyType;
  description: string;
}

export const technologies: TechnologySeed[] = [
  { slug: 'python', name: 'Python', type: 'LANGUAGE', description: 'General-purpose language widely used across backend, data, and ML work.' },
  { slug: 'javascript', name: 'JavaScript', type: 'LANGUAGE', description: 'The language of the web browser, also common on the server.' },
  { slug: 'typescript', name: 'TypeScript', type: 'LANGUAGE', description: 'A typed superset of JavaScript.' },
  { slug: 'java', name: 'Java', type: 'LANGUAGE', description: 'Statically typed, widely used in enterprise backend systems.' },
  { slug: 'sql', name: 'SQL', type: 'LANGUAGE', description: 'The standard language for querying relational databases.' },
  { slug: 'r-lang', name: 'R', type: 'LANGUAGE', description: 'A language built for statistical computing.' },
  { slug: 'html-css', name: 'HTML & CSS', type: 'LANGUAGE', description: 'The markup and styling languages of the web.' },
  { slug: 'react', name: 'React', type: 'FRAMEWORK', description: 'A component-based library for building user interfaces.' },
  { slug: 'nodejs', name: 'Node.js', type: 'PLATFORM', description: 'A JavaScript runtime for building servers and tools.' },
  { slug: 'django', name: 'Django', type: 'FRAMEWORK', description: 'A batteries-included Python web framework.' },
  { slug: 'spring-boot', name: 'Spring Boot', type: 'FRAMEWORK', description: 'A widely used Java framework for building backend services.' },
  { slug: 'postgresql', name: 'PostgreSQL', type: 'DATABASE', description: 'A widely used open-source relational database.' },
  { slug: 'mongodb', name: 'MongoDB', type: 'DATABASE', description: 'A widely used document-oriented database.' },
  { slug: 'git', name: 'Git', type: 'TOOL', description: 'The standard distributed version control system.' },
  { slug: 'docker', name: 'Docker', type: 'TOOL', description: 'A tool for packaging applications into containers.' },
  { slug: 'kubernetes', name: 'Kubernetes', type: 'PLATFORM', description: 'A platform for orchestrating containers at scale.' },
  { slug: 'aws', name: 'AWS', type: 'PLATFORM', description: 'A widely used public cloud platform.' },
  { slug: 'pandas', name: 'Pandas', type: 'LIBRARY', description: 'A Python library for tabular data manipulation.' },
  { slug: 'numpy', name: 'NumPy', type: 'LIBRARY', description: 'A Python library for numerical computing.' },
  { slug: 'scikit-learn', name: 'scikit-learn', type: 'LIBRARY', description: 'A Python library of classical machine learning algorithms.' },
  { slug: 'tensorflow', name: 'TensorFlow', type: 'FRAMEWORK', description: 'A framework for building and training deep learning models.' },
  { slug: 'airflow', name: 'Apache Airflow', type: 'TOOL', description: 'A tool for authoring and scheduling data workflows.' },
  { slug: 'spark', name: 'Apache Spark', type: 'FRAMEWORK', description: 'A framework for large-scale data processing.' },
  { slug: 'tableau', name: 'Tableau', type: 'TOOL', description: 'A widely used data visualization and BI tool.' },
  { slug: 'jupyter', name: 'Jupyter Notebook', type: 'TOOL', description: 'An interactive notebook environment for exploratory work.' },
];

interface RoleCompetencySeed {
  competency: string;
  importance: Importance;
  proficiency: Proficiency;
}
interface RoleSkillSeed {
  skill: string;
  importance: Importance;
  proficiency: Proficiency;
}
interface RoleTechnologySeed {
  technology: string;
  usage: TechnologyUsage;
}

export interface RoleSeed {
  slug: string;
  family: string;
  name: string;
  shortDescription: string;
  longDescription: string;
  status: ContentStatus;
  /** Only used for the versioning demonstration on data-analyst — see below. */
  competenciesV1Only?: string[];
  competencies: RoleCompetencySeed[];
  skills: RoleSkillSeed[];
  technologies: RoleTechnologySeed[];
}

// Expected proficiency is capped at STRONG across this catalog: these are
// entry-level targets for students, not senior/staff bars (ADVANCED is
// intentionally left unused in the seed — a defensible, noted choice).
export const roles: RoleSeed[] = [
  {
    slug: 'software-engineer',
    family: 'software-development',
    name: 'Software Engineer',
    shortDescription: 'Designs, builds, and maintains software across the stack.',
    longDescription: 'A generalist engineering role focused on turning requirements into working, tested software — writing code, fixing defects, and collaborating with a team, without being tied to one layer of the stack.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'problem-solving', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-structures-algorithms', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'debugging', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'testing-quality', importance: 'CORE', proficiency: 'DEVELOPING' },
      { competency: 'databases', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'api-design-integration', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'software-architecture', importance: 'IMPORTANT', proficiency: 'FOUNDATION' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
      { competency: 'engineering-communication', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'functions-modular-design', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'arrays-strings', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'sorting-searching', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'debugger-logging-use', importance: 'CORE', proficiency: 'DEVELOPING' },
      { skill: 'unit-testing', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'git-fundamentals', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'java', usage: 'COMMON' },
      { technology: 'javascript', usage: 'COMMON' },
      { technology: 'git', usage: 'COMMON' },
      { technology: 'sql', usage: 'SUPPORTING' },
      { technology: 'typescript', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'backend-engineer',
    family: 'software-development',
    name: 'Backend Engineer',
    shortDescription: 'Builds the servers, APIs, and data layer behind an application.',
    longDescription: 'Focuses on the server side of an application: modeling data, exposing it through reliable APIs, and keeping the backend correct and reasonably fast as usage grows.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'databases', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'api-design-integration', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-structures-algorithms', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'software-architecture', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'cloud-infrastructure-ops', importance: 'IMPORTANT', proficiency: 'FOUNDATION' },
      { competency: 'debugging', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'relational-modeling', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'sql-querying', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'rest-api-design', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'exception-handling', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'indexing-query-performance', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'unit-testing', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'java', usage: 'COMMON' },
      { technology: 'typescript', usage: 'COMMON' },
      { technology: 'postgresql', usage: 'COMMON' },
      { technology: 'sql', usage: 'COMMON' },
      { technology: 'docker', usage: 'SUPPORTING' },
      { technology: 'mongodb', usage: 'SUPPORTING' },
      { technology: 'aws', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'frontend-engineer',
    family: 'software-development',
    name: 'Frontend Engineer',
    shortDescription: 'Builds the interface a user actually sees and interacts with.',
    longDescription: 'Turns designs and requirements into interfaces that are correct, responsive, and usable — working mainly in the browser and consuming backend APIs rather than building them.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'ui-ux-implementation', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'problem-solving', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'api-design-integration', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'debugging', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'data-structures-algorithms', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'component-based-ui', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'responsive-layout', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'accessibility-basics', importance: 'CORE', proficiency: 'DEVELOPING' },
      { skill: 'frontend-state-management', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'rest-api-design', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'git-fundamentals', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'javascript', usage: 'COMMON' },
      { technology: 'typescript', usage: 'COMMON' },
      { technology: 'react', usage: 'COMMON' },
      { technology: 'html-css', usage: 'COMMON' },
      { technology: 'nodejs', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'full-stack-engineer',
    family: 'software-development',
    name: 'Full Stack Engineer',
    shortDescription: 'Works across both the interface and the server that powers it.',
    longDescription: 'Moves between frontend and backend work on the same product — building an interface, the API behind it, and the data it reads and writes.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'api-design-integration', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'databases', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'ui-ux-implementation', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-structures-algorithms', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'software-architecture', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'debugging', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
      { competency: 'cloud-infrastructure-ops', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'component-based-ui', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'rest-api-design', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'sql-querying', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'relational-modeling', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'unit-testing', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'git-fundamentals', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'javascript', usage: 'COMMON' },
      { technology: 'typescript', usage: 'COMMON' },
      { technology: 'react', usage: 'COMMON' },
      { technology: 'nodejs', usage: 'COMMON' },
      { technology: 'sql', usage: 'COMMON' },
      { technology: 'postgresql', usage: 'COMMON' },
      { technology: 'python', usage: 'SUPPORTING' },
      { technology: 'docker', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'ai-ml-engineer',
    family: 'ai-machine-learning',
    name: 'AI / ML Engineer',
    shortDescription: 'Builds and ships systems powered by machine learning models.',
    longDescription: 'Takes models from a working prototype to something usable in a real application — training, evaluating, and integrating machine learning components into software.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'machine-learning', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-structures-algorithms', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'statistics-probability', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-analysis', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'software-architecture', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'databases', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'cloud-infrastructure-ops', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'debugging', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'supervised-learning', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'feature-engineering', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'model-evaluation', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'statistical-inference', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'data-manipulation', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'exception-handling', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'scikit-learn', usage: 'COMMON' },
      { technology: 'tensorflow', usage: 'COMMON' },
      { technology: 'sql', usage: 'SUPPORTING' },
      { technology: 'docker', usage: 'SUPPORTING' },
      { technology: 'aws', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'data-scientist',
    family: 'data-analytics',
    name: 'Data Scientist',
    shortDescription: 'Uses statistics and modeling to answer open-ended questions from data.',
    longDescription: 'Explores data to find patterns, tests hypotheses rigorously, and builds models — with the goal of producing an insight or recommendation, not necessarily shipping production code.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'statistics-probability', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-analysis', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'machine-learning', importance: 'CORE', proficiency: 'DEVELOPING' },
      { competency: 'business-stakeholder-interpretation', importance: 'IMPORTANT', proficiency: 'COMPETENT' },
      { competency: 'programming', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'databases', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'data-engineering', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'engineering-communication', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'descriptive-statistics', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'hypothesis-testing', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'exploratory-data-analysis', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'data-visualization', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'supervised-learning', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'model-evaluation', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'r-lang', usage: 'COMMON' },
      { technology: 'sql', usage: 'COMMON' },
      { technology: 'pandas', usage: 'COMMON' },
      { technology: 'jupyter', usage: 'COMMON' },
      { technology: 'scikit-learn', usage: 'SUPPORTING' },
      { technology: 'tableau', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'data-analyst',
    family: 'data-analytics',
    name: 'Data Analyst',
    shortDescription: 'Turns raw data into reports and answers business questions.',
    longDescription: 'Works closely with SQL and dashboards to answer concrete business questions — less focused on building predictive models, more on describing what has happened and why.',
    status: 'ACTIVE',
    // Demonstrates versioning: v1 is the original definition; v2 (current)
    // adds Machine Learning as a supporting awareness-level competency.
    competenciesV1Only: ['data-analysis', 'statistics-probability', 'business-stakeholder-interpretation', 'databases', 'engineering-communication', 'programming'],
    competencies: [
      { competency: 'data-analysis', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'statistics-probability', importance: 'CORE', proficiency: 'DEVELOPING' },
      { competency: 'business-stakeholder-interpretation', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'databases', importance: 'IMPORTANT', proficiency: 'COMPETENT' },
      { competency: 'engineering-communication', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'programming', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'machine-learning', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
    ],
    skills: [
      { skill: 'data-cleaning', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'sql-querying', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'exploratory-data-analysis', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'data-visualization', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'stakeholder-communication', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'sql', usage: 'COMMON' },
      { technology: 'tableau', usage: 'COMMON' },
      { technology: 'python', usage: 'SUPPORTING' },
      { technology: 'pandas', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'data-engineer',
    family: 'data-analytics',
    name: 'Data Engineer',
    shortDescription: 'Builds the pipelines that move and prepare data reliably.',
    longDescription: 'Builds and operates the infrastructure that gets data from where it is produced to where analysts, scientists, and applications can use it — with a focus on reliability at scale.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'data-engineering', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'databases', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'data-structures-algorithms', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'software-architecture', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'cloud-infrastructure-ops', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'data-analysis', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
    ],
    skills: [
      { skill: 'etl-elt-pipeline-design', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'workflow-orchestration', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'data-quality-validation', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'sql-querying', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'batch-streaming-processing', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'relational-modeling', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'sql', usage: 'COMMON' },
      { technology: 'spark', usage: 'COMMON' },
      { technology: 'airflow', usage: 'COMMON' },
      { technology: 'aws', usage: 'SUPPORTING' },
      { technology: 'postgresql', usage: 'SUPPORTING' },
      { technology: 'docker', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'qa-sdet',
    family: 'software-development',
    name: 'QA / SDET',
    shortDescription: 'Builds confidence that software works, and automates that check.',
    longDescription: 'Focuses on finding what is broken before a user does — through manual exploration and, increasingly, by writing automated tests and tooling that make quality checks repeatable.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'testing-quality', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'debugging', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'problem-solving', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'programming', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'api-design-integration', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'data-structures-algorithms', importance: 'IMPORTANT', proficiency: 'FOUNDATION' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
      { competency: 'cloud-infrastructure-ops', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
    ],
    skills: [
      { skill: 'test-automation', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'unit-testing', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'integration-testing', importance: 'CORE', proficiency: 'DEVELOPING' },
      { skill: 'exploratory-manual-testing', importance: 'IMPORTANT', proficiency: 'COMPETENT' },
      { skill: 'reading-stack-traces', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'rest-api-design', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'python', usage: 'COMMON' },
      { technology: 'java', usage: 'COMMON' },
      { technology: 'git', usage: 'COMMON' },
      { technology: 'sql', usage: 'SUPPORTING' },
      { technology: 'docker', usage: 'SUPPORTING' },
    ],
  },
  {
    slug: 'devops-cloud-engineer',
    family: 'cloud-infrastructure',
    name: 'DevOps / Cloud Engineer',
    shortDescription: 'Builds and operates the platform other engineers ship on top of.',
    longDescription: 'Automates how software gets built, deployed, and kept running — provisioning infrastructure, building deployment pipelines, and responding when something in production breaks.',
    status: 'ACTIVE',
    competencies: [
      { competency: 'cloud-infrastructure-ops', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'programming', importance: 'CORE', proficiency: 'DEVELOPING' },
      { competency: 'software-architecture', importance: 'CORE', proficiency: 'DEVELOPING' },
      { competency: 'databases', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'testing-quality', importance: 'IMPORTANT', proficiency: 'FOUNDATION' },
      { competency: 'debugging', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { competency: 'data-structures-algorithms', importance: 'SUPPORTING', proficiency: 'FOUNDATION' },
      { competency: 'version-control-collaboration', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [
      { skill: 'infrastructure-as-code', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'ci-cd-pipelines', importance: 'CORE', proficiency: 'COMPETENT' },
      { skill: 'monitoring-incident-response', importance: 'CORE', proficiency: 'DEVELOPING' },
      { skill: 'compute-networking-fundamentals', importance: 'IMPORTANT', proficiency: 'DEVELOPING' },
      { skill: 'git-fundamentals', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
      { skill: 'debugger-logging-use', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    technologies: [
      { technology: 'docker', usage: 'COMMON' },
      { technology: 'kubernetes', usage: 'COMMON' },
      { technology: 'aws', usage: 'COMMON' },
      { technology: 'git', usage: 'COMMON' },
      { technology: 'python', usage: 'SUPPORTING' },
      { technology: 'sql', usage: 'SUPPORTING' },
    ],
  },
  // Deprecated fixture role: proves deprecated roles are excluded from
  // listings/new-selection but remain resolvable for historical records
  // (Step 6), and are excluded from the ACTIVE-role count in the report.
  {
    slug: 'mobile-engineer-legacy',
    family: 'software-development',
    name: 'Mobile Engineer (Legacy)',
    shortDescription: 'Deprecated fixture role — retained only to prove historical resolution.',
    longDescription: 'This role definition has been deprecated in favor of folding mobile work into the Software Engineer and Frontend Engineer roles. It is kept resolvable so that any historical student context pointing at it can still be displayed accurately.',
    status: 'DEPRECATED',
    competencies: [
      { competency: 'programming', importance: 'CORE', proficiency: 'COMPETENT' },
      { competency: 'debugging', importance: 'SUPPORTING', proficiency: 'DEVELOPING' },
    ],
    skills: [],
    technologies: [],
  },
];

export const skillPrerequisites: Array<{ skill: string; prerequisite: string }> = [
  { skill: 'object-oriented-programming', prerequisite: 'functions-modular-design' },
  { skill: 'exception-handling', prerequisite: 'functions-modular-design' },
  { skill: 'hashing', prerequisite: 'arrays-strings' },
  { skill: 'trees-graphs', prerequisite: 'hashing' },
  { skill: 'sorting-searching', prerequisite: 'arrays-strings' },
  { skill: 'dynamic-programming', prerequisite: 'sorting-searching' },
  { skill: 'dynamic-programming', prerequisite: 'complexity-analysis' },
  { skill: 'branching-code-review', prerequisite: 'git-fundamentals' },
  { skill: 'probability-fundamentals', prerequisite: 'descriptive-statistics' },
  { skill: 'hypothesis-testing', prerequisite: 'probability-fundamentals' },
  { skill: 'statistical-inference', prerequisite: 'hypothesis-testing' },
  { skill: 'supervised-learning', prerequisite: 'statistical-inference' },
  { skill: 'exploratory-data-analysis', prerequisite: 'data-cleaning' },
  { skill: 'data-manipulation', prerequisite: 'exploratory-data-analysis' },
  { skill: 'indexing-query-performance', prerequisite: 'sql-querying' },
  { skill: 'third-party-integration', prerequisite: 'rest-api-design' },
  { skill: 'integration-testing', prerequisite: 'unit-testing' },
];

// Minimal fixtures for tenant-isolation and RBAC tests / demo data.
export const institutions = [
  { slug: 'demo-institute-of-technology', name: 'Demo Institute of Technology' },
  { slug: 'northbridge-college', name: 'Northbridge College' },
] as const;

export const students = [
  { id: 'student-demo-1', institution: 'demo-institute-of-technology', displayName: 'Demo Student One' },
  { id: 'student-demo-2', institution: 'demo-institute-of-technology', displayName: 'Demo Student Two' },
  { id: 'student-demo-3', institution: 'northbridge-college', displayName: 'Demo Student Three' },
] as const;

export const roleVariants = [
  {
    baseRole: 'ai-ml-engineer',
    institution: 'demo-institute-of-technology',
    name: 'AI/ML Engineer — Campus Track',
    description: 'Institution-specific adaptation; extension point only, not exposed via any admin UI in this build.',
    status: 'DRAFT' as ContentStatus,
  },
];

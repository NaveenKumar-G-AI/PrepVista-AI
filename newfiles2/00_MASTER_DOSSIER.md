# PrepVista — Feature #02: Role-Specific Interview Simulation
## MASTER INTELLIGENCE DOSSIER (build-ready knowledge base)

> **Purpose.** The complete knowledge base to build Feature #02 at full capacity. Not code — the
> thesis, the universal role data model, deep per-role-family interview intelligence, the simulation
> architecture (which reuses the Feature #01 engine), the skill-gap → role-readiness model, the
> role×company composition, the maximized role roster, and the moat. Feed this + the master prompt
> (`MASTER_PROMPT_FULL.md`) + the roster (`02_ROLE_ROSTER.md`) to Claude Code.
>
> **Sourcing & freshness note.** Role skill-stacks and round shapes are compiled from current (2024–26)
> interview-prep sources and candidate reports across every family. The *round shape and competency
> mix per role are stable*; the *exact tools/skills churn fast* (React 19 & TypeScript-as-baseline,
> Terraform/ArgoCD/GitOps, UVM, RAG/LLM-evals, "AI product sense" as its own PM round). So every role
> is stored as **versioned, editable data** with a `skill_confidence` + `last_verified` stamp and a
> refresh loop. Skills are config, never hardcoded.

---

## PART 0 — THE THESIS (why the role axis is a game-changer, and non-replaceable)

### 0.1 The two axes of interview preparation
- **Feature #01 (company axis):** "Prepare for *TCS* / *Amazon* / *Zoho*." Faithful to a company's
  selection *process* (rounds, platform, gates, track prediction).
- **Feature #02 (role axis):** "Prepare to be a *Backend Developer* / *Data Scientist* / *VLSI Engineer*
  / *Product Manager*." Faithful to a *job role's* real interview: its skill stack, its round structure,
  its rubric, its difficulty — regardless of company.

A student needs both. They target *a role* (what they want to do) *at companies* (who's hiring). The two
compose into the ultimate prep: **role × company** (Part 6). No competitor offers this 2-D depth.

### 0.2 What makes the role axis a game-changer
1. **It covers who others ignore.** Every "mock interview" tool covers SWE and maybe Data Science.
   Almost none seriously cover **ECE (embedded/VLSI), EEE (power/control), Mechanical (design/CAD),
   Civil (structural/site), Chemical, Biomedical**, or the **business/product/design/finance** roles —
   yet those students are half of every engineering campus. Covering *all* departments' roles is both a
   moat and a market that competitors have left on the table.
2. **Roles differ structurally, not cosmetically.** A Data Science loop (SQL → stats → ML → product-sense
   → behavioral) is a *different interview* from an SWE loop (DSA → system design → behavioral), which is
   different from a DevOps loop (scenario troubleshooting → tools → Linux/IaC), a VLSI loop (digital +
   Verilog/STA + verification), a Mechanical loop (SOM/thermo/CAD + design), or a PM loop (product sense
   → execution/metrics → AI-product-sense → behavioral). One generic chat cannot fake all of these.
3. **The skill stack is deep, current, and weighted per role.** Frontend now filters on TypeScript and
   Playwright testing (testing eliminates more candidates than CSS); DS is 90%+ SQL, 85%+ ML, 80%+
   Python with product-sense and A/B testing; DevOps is scenario-first (CrashLoopBackOff, rollbacks) over
   definitions; PM added an *"AI Product Sense"* round in 2026; roles across the board now expect AI
   literacy (LLM basics, hallucinations, RAG, evals, responsible AI). Encoding each role's real, weighted,
   current topic map is a sustained research asset — cycle-perishable and hard to copy.

### 0.3 The moat (why replication fails)
1. **Role-taxonomy breadth.** 120+ roles across *all* departments + business/product/design/finance,
   each with a structured skill stack — not a tag, a *map*. (Part 8.)
2. **Per-role skill-stack fidelity.** Weighted, current, sub-topic-level topic maps per role, refreshed
   each cycle. (Part 2.)
3. **Role-appropriate round structures + rubrics.** Each role family has its own round sequence and its
   own "what strong looks like" rubric. (Part 2 & 4.)
4. **Skill-gap → role-readiness model.** Convert performance into "you're 72% ready for Backend
   Developer; weak on system design + caching" with a targeted plan. (Part 5.)
5. **Role × Company composition.** The 2-D matrix (Part 6) — unique to owning both axes.
6. **Reuse of a tested engine.** Both features run on PrepVista's 15 tested modules + scoring + the
   Feature #01 simulators; a newcomer starts from zero on both axes at once.

---

## PART 1 — THE UNIVERSAL ROLE BLUEPRINT SCHEMA

The heart of the feature: describe *any* role as data so the simulation engine is generic and the roster
scales to hundreds without new code. Every role = one `role_blueprint`.

```jsonc
role_blueprint = {
  "role_id": "backend_developer",
  "display_name": "Backend Developer",
  "aliases": ["Backend Engineer","Server-side Developer","API Developer"],
  "role_family": "software_engineering",   // see families in Part 2
  "departments": ["cse","aids","aiml","ece"],   // branches whose students are eligible (link to departments.json)
  "company_types": ["service","product","general"],  // who hires (link to companies.json types)
  "seniority_levels": ["fresher","junior"],          // campus focus = fresher; scalable upward
  "one_liner": "Builds server-side logic, APIs, and the data layer behind applications.",
  "day_in_life": "Design and ship APIs, model data, handle auth/caching/scaling, debug production issues.",
  "skill_confidence": 0.9, "last_verified": "2026-05",

  // --- The weighted skill stack (the core asset) ---
  "skill_stack": {
    "core": [                                 // must-know, heavily tested
      {"skill":"Data structures & algorithms","weight":5,"subtopics":["arrays","hashmaps","trees","graphs","DP","complexity"]},
      {"skill":"A backend language","weight":5,"subtopics":["Java","Python","Node.js","Go"]},
      {"skill":"REST API design","weight":5,"subtopics":["verbs","status codes","versioning","idempotency","pagination"]},
      {"skill":"Databases & SQL","weight":5,"subtopics":["joins","indexing","transactions/ACID","normalization","query optimization"]},
      {"skill":"System design (backend)","weight":4,"subtopics":["scaling","load balancing","caching","message queues","consistency"]},
      {"skill":"Operating systems & concurrency","weight":3,"subtopics":["processes/threads","locks","deadlock","memory"]}
    ],
    "tools": [                                // frameworks/tools expected
      {"skill":"Git","weight":3},{"skill":"Docker basics","weight":2},
      {"skill":"A backend framework","weight":3,"subtopics":["Spring","Django","Express"]},
      {"skill":"Caching (Redis)","weight":2},{"skill":"Message queues (Kafka)","weight":2}
    ],
    "emerging": [                             // current-cycle differentiators
      {"skill":"AI literacy","weight":2,"subtopics":["LLM basics","RAG","when-to-use-AI","API integration"]},
      {"skill":"Microservices","weight":2},{"skill":"GraphQL","weight":1}
    ]
  },

  // --- The round structure (ordered; each round_type maps to a simulator; SHARED with Feature #01) ---
  "round_structure": [
    {"order":1,"round_type":"coding_test","label":"Coding / DSA","competencies":["technical_depth","problem_solving"],
     "focus":["data structures","algorithms"],"difficulty":"medium","minutes":45},
    {"order":2,"round_type":"technical_interview","label":"Backend Technical","competencies":["technical_depth"],
     "focus":["APIs","databases","OS"],"difficulty":"medium","minutes":45},
    {"order":3,"round_type":"system_design","label":"Design (LLD/scaled)","competencies":["technical_depth","problem_solving"],
     "focus":["API design","data model","caching","scaling"],"difficulty":"medium","minutes":45,"seniority_min":"junior"},
    {"order":4,"round_type":"resume_based","label":"Project Deep-Dive","competencies":["project_ownership","communication"],"minutes":20},
    {"order":5,"round_type":"hr_interview","label":"HR / Behavioral","competencies":["behavioral","communication"],"minutes":20}
  ],

  // --- Role-specific evaluation rubric (competency weights for THIS role) ---
  "evaluation_rubric": {
    "technical_depth":0.35,"problem_solving":0.25,"project_ownership":0.15,
    "communication":0.15,"behavioral":0.10
  },
  "difficulty_calibration": "medium",
  "common_mistakes": [
    "Jumping to endpoints before addressing data modeling / tenant isolation.",
    "Can't reason about indexing or query cost.",
    "Treats system design as a component list, not a connected system."
  ],
  "readiness_model": { /* see Part 5 */ }
}
```

### 1.1 Reuse of the Feature #01 `round_type` vocabulary (do NOT invent a new one)
`round_type` is the **same fixed set** as Feature #01 so both features share simulators:
`coding_test`, `advanced_coding`, `technical_mcq`, `aptitude_test`, `system_design`,
`technical_interview`, `managerial_interview`, `hr_interview`, `behavioral_survey`, `case_study`,
`group_discussion`, plus role-flavored uses of `resume_based` (project deep-dive) and — for
non-code roles — `case_study` (product/consulting), `voice_assessment` (comms-heavy roles), etc.
A role's `focus[]` + `skill_stack` skin the simulator to the role.

### 1.2 Mapping to what PrepVista already owns
- `coding_test`/`advanced_coding`/`system_design` → the Feature #01 net-new simulators (judge, design rubric).
- `technical_interview` → `q_technical_domain` (branch-routed banks) skinned by the role's `focus[]` + skill stack.
- `aptitude_test`/`technical_mcq` → `q_aptitude_reasoning` + `q_technical_domain` banks + parametric generators.
- `resume_based` (project deep-dive) → `q_resume_based`. `case_study` → `q_case_study`/`q_creative_estimation`.
- `hr_interview`/`managerial_interview` → the HR-family + situational/stress/case modules.
- `group_discussion` → `q_group_discussion`. `behavioral_survey` → `q_situational_star` + `q_hr_behavioral`.
- **Net-new for Feature #02 (small):** the **role skill-stack model + weighting**, the **role-readiness /
  skill-gap resolver** (Part 5), and **role-specific rubrics** — most simulators already exist.

---

## PART 2 — ROLE-FAMILY INTELLIGENCE (the researched knowledge)

> Each family below gives the **skill stack** (weighted), the **round structure**, the **rubric
> emphasis**, **common mistakes**, and **current-cycle shifts**. This is what fills `role_blueprint`s.
> Store numbers as editable config with `skill_confidence` + `last_verified`.

### 2.1 Software Engineering (SWE, backend, frontend, full-stack, mobile) — dept: cse/aids/aiml/ece
- **Universal core:** DSA (arrays, hashmaps, trees, graphs, DP, complexity), a primary language, OOP,
  Git, testing, debugging, CS fundamentals (OS, DBMS/SQL, CN). Seniority split is sharp: **freshers →
  fundamentals + DSA; senior → system design, scalability, CI/CD, security.**
- **Frontend specifics:** JS fundamentals (event loop — "predict the output order," closures, prototype
  chain), **React** (hooks, virtual DOM, reconciliation/Fiber, Server Components, React 19: Actions/
  useActionState/useOptimistic/use hook/Compiler), **TypeScript (now a baseline filter — roughly 3:1 over
  JS-only postings)**, performance (Core Web Vitals/LCP, bundle size, lazy loading, code splitting),
  **testing (React Testing Library / Playwright — testing questions eliminate more candidates than CSS)**,
  CSS (box model, fl ex/grid, CSS-in-JS), accessibility, cross-browser. **Full-stack system design** =
  frontend + API + data model + auth + deploy as one connected system (e.g., "design real-time
  collaborative editing" — leads with concurrency/CRDT/OT; "multi-tenant SaaS — tenant isolation first").
- **Backend specifics:** REST vs GraphQL, auth (JWT/OAuth/sessions), caching (Redis, cache invalidation),
  microservices vs monolith, message queues, DB design/indexing/transactions/ACID, query optimization,
  multi-tenant isolation, rate limiting, idempotency. Backend questions are "harder to fake" than frontend.
- **Mobile specifics:** Android (Kotlin/Java, lifecycle, Jetpack) or iOS (Swift/SwiftUI) or cross-platform
  (Flutter/React Native), local storage, push, performance, app lifecycle, offline sync.
- **Rounds:** (fresher) OA/coding → 1–2 technical (DSA + CS core / stack) → project deep-dive → HR;
  (product/senior) + system design + more DSA. **Rubric:** technical_depth 0.35, problem_solving 0.25,
  project_ownership 0.15, communication 0.15, behavioral 0.10.
- **Current shifts:** TypeScript baseline; Playwright over Cypress/Enzyme; RSC/App Router; AI literacy
  (LLM basics, when-to-use-AI) creeping in; "uses React vs understands React" is the filter.

### 2.2 Data & AI (data scientist, data analyst, data engineer, ML engineer, AI/GenAI engineer, NLP, CV, MLOps, BI) — dept: aids/aiml/cse/ece
- **DS core (5 areas):** **statistics & probability** (distributions, hypothesis testing, p-value, Type
  I/II, confidence intervals, Bayes), **machine learning** (linear/logistic regression + assumptions,
  trees/RF/XGBoost, SVM, clustering, PCA/t-SNE, regularization L1/L2, gradient descent, bias-variance,
  overfitting, feature engineering/selection, model evaluation ROC/AUC/precision-recall), **coding
  (Python: pandas/NumPy/regex; SQL: joins, aggregations, window functions — SQL asked in 90%+ of DS
  interviews)**, **product sense / metrics / A/B testing**, **behavioral**. Model monitoring/drift
  (KL divergence, PSI, chi-squared) for production roles.
- **Role divergence within the family (critical — different interviews):**
  - **Data Analyst** → SQL-heavy + data wrangling + dashboards (Tableau/Power BI) + business/metrics;
    light ML. **Product Analyst** → SQL + product case studies + metrics anomalies + A/B testing + a PM 1:1.
  - **ML Engineer** → algorithms + coding + pipelines + deployment/MLOps (coding-heavy, fewer business Qs).
  - **Data Engineer** → SQL + Python + ETL/ELT + data warehousing + Spark/big-data + orchestration
    (Airflow) + streaming (Kafka) + data modeling (infrastructure, not modeling-theory).
  - **AI/GenAI Engineer** → LLMs, prompting, **RAG, vector DBs, evals, hallucination handling**, model
    integration, plus SWE fundamentals.
- **Rounds:** recruiter → **coding screen (Python/SQL, pass/fail filter)** → SQL round → ML/modeling round
  → product/case round → behavioral → sometimes a take-home. **Rubric** (DS): technical_depth 0.30,
  problem_solving 0.25 (incl. stats/ML reasoning), communication 0.20 (explain to non-technical),
  behavioral 0.10, plus product/business sense 0.15.
- **Current shifts:** LLMs/MLOps/responsible AI expected; "specialist" data-analyst postings rising; the
  same loop tests SQL+stats+ML+product+behavioral — candidates who prep only two of five fail.

### 2.3 Infrastructure (DevOps, Cloud, SRE, Platform Engineer) — dept: cse/aids/ece/cyber
- **Core:** CI/CD (Jenkins, GitHub Actions, GitLab CI, **ArgoCD/GitOps**), **containers (Docker)**,
  **orchestration (Kubernetes** — pods, deployments, services, liveness/readiness probes, HPA,
  ConfigMaps/Secrets, StatefulSets, sidecars), **IaC (Terraform** — state, locking; **Ansible)**, **cloud
  (AWS/Azure/GCP** — compute, storage, VPC, IAM, load balancing, autoscaling), **monitoring/observability
  (Prometheus, Grafana, ELK, Datadog** — metrics/logs/traces), **scripting (Bash/Python/YAML)**,
  **Linux/sysadmin**, networking/security (DNS, SSL/TLS, firewalls, IAM), Git branching.
- **SRE adds:** SLI/SLO/**error budgets**, blameless postmortems, toil reduction, incident management,
  capacity planning, **chaos engineering**, reliability-vs-velocity trade-offs.
- **Platform Engineer adds:** internal developer platforms, self-service infra, Backstage-style portals.
- **Interview flavor: scenario-first** ("your pod is in CrashLoopBackOff — steps?"; "safe rollback?";
  "pipeline failed — debug"). Tests *how you troubleshoot under pressure*, not definitions.
- **Rounds:** technical (tools + scenarios) → Linux/scripting → sometimes a system/reliability design →
  behavioral. **Rubric:** technical_depth 0.35, problem_solving 0.30 (troubleshooting), communication 0.20,
  behavioral 0.15.
- **Current shifts:** GitOps, platform engineering, DevSecOps (shift-left security), AI-assisted monitoring.

### 2.4 Quality & Security (QA/SDET, Security Analyst, Security Engineer, SOC, Pen-tester) — dept: cse/cyber/ece
- **QA/SDET core:** manual testing, test-case/scenario design, SDLC & STLC, defect lifecycle, black/white-box,
  **automation (Selenium, Cypress, Playwright)**, API testing (Postman/REST-assured), bug tracking (JIRA),
  performance testing basics, SQL basics, CI integration; SDET adds coding/DSA-lite + framework design.
- **Security core:** CIA triad, **OWASP Top 10**, network security, **cryptography basics**, threat
  analysis, vulnerability assessment, Linux security, SIEM, incident response, firewalls/IDS-IPS; **Pen-
  tester** adds Burp Suite/Nmap/Metasploit, exploitation basics, reconnaissance, reporting; **SOC** adds
  alert triage, log analysis, malware basics.
- **Rounds:** technical (testing/security concepts + scenarios) → coding/tools → behavioral. **Rubric:**
  technical_depth 0.35, problem_solving 0.25, communication 0.20, behavioral 0.20 (judgment matters).

### 2.5 Electronics / ECE (embedded, VLSI design/verification/physical-design, firmware, RF, DSP, hardware) — dept: ece/eee/cse
- **Digital electronics core:** logic gates, Boolean algebra, **K-maps (SOP/POS)**, flip-flops, MUX/DEMUX,
  counters, combinational vs sequential, number systems.
- **Embedded core:** microcontroller vs microprocessor, **Embedded C** (volatile, pointers, segmentation
  fault, stack overflow, memory leaks), **RTOS** (tasks, scheduling, semaphores, mutex, priority
  inversion), **interrupts/ISR/latency**, **peripherals (GPIO, UART, SPI, I2C)**, watchdog timer, memory
  (ROM/RAM/flash), DMA, bit manipulation; automotive (ECU, CAN, UDS, bootloader, ARM TrustZone, fail-safe).
- **VLSI core:** **Verilog/VHDL (HDL)**, MOSFET/CMOS, Moore's law, pipelining; **Design (RTL)**;
  **Verification** (UVM, constrained-random, functional coverage, formal, testbench); **Physical Design**
  (floorplanning, placement, **CTS**, routing, **STA** — setup/hold, slack, clock skew; **power** — clock
  gating, multi-Vt, power gating, DVS; **IR drop, electromigration**, sign-off).
- **Rounds:** aptitude/technical MCQ → core domain technical (digital + subject depth + HDL for VLSI) →
  project/HR. **Rubric:** technical_depth 0.45, problem_solving 0.20, project_ownership 0.15,
  communication 0.10, behavioral 0.10. (Core roles are domain-fundamentals heavy.)
- **Note:** most competitors ignore ECE roles entirely — big differentiator.

### 2.6 Electrical / EEE (electrical design, power systems, control systems, instrumentation, power electronics) — dept: eee/ece
- **Core:** circuit theory (Ohm/Kirchhoff, network theorems), **electrical machines** (DC/induction/
  synchronous, transformers), **power systems** (generation/transmission/distribution, load flow, fault
  analysis, protection & switchgear, stability), **control systems** (transfer functions, PID, stability/
  root-locus/Bode, state-space), **power electronics** (rectifiers, inverters, choppers, SMPS),
  **instrumentation** (sensors/transducers, measurement, calibration), **PLC/SCADA/automation**, electrical
  safety, AutoCAD Electrical, renewable-energy basics.
- **Rounds:** aptitude/technical → domain technical → HR. **Rubric** same core-heavy profile as 2.5.

### 2.7 Mechanical (design, production, quality, maintenance, manufacturing, thermal/HVAC, automotive, mechatronics) — dept: mech
- **Core:** engineering drawing + **GD&T**, **CAD (AutoCAD/SolidWorks/CATIA/Creo)**, **strength of
  materials**, **thermodynamics**, **fluid mechanics**, **heat transfer**, **theory of machines/machine
  design**, manufacturing processes (casting/welding/machining/forming), **material science**, IC engines,
  **FEA/CAE basics**, engineering mechanics; production/quality add **Lean/Six Sigma, SPC, 7 QC tools,
  FMEA, metrology**; maintenance adds preventive/predictive, hydraulics/pneumatics, RCA.
- **Rounds:** aptitude/technical → domain technical (design/thermal/manufacturing per role) → HR. **Rubric**
  core-heavy (technical_depth 0.45).
- **Note:** mechanical is a huge campus population almost entirely unserved by mock-interview tools.

### 2.8 Civil (civil, structural, site, project, geotechnical, transportation, environmental, BIM) — dept: civil
- **Core:** **structural analysis**, **RCC & steel design (IS codes)**, **concrete technology**,
  **geotechnical/soil mechanics**, **surveying**, **fluid mechanics/hydraulics**, transportation
  engineering, environmental engineering, **estimation & costing/quantity surveying**, construction
  materials & methods, **AutoCAD / STAAD.Pro / ETABS**, project management (scheduling/Primavera/MS Project),
  **BIM (Revit)**; site adds execution, quality/safety, billing, reading drawings.
- **Rounds:** aptitude/technical → domain technical → HR. **Rubric** core-heavy.

### 2.9 Business & Product (product manager, product analyst, business analyst, consultant, operations analyst, program/project manager, strategy/growth analyst) — dept: any (+ MBA/commerce)
- **Product Manager — 3 pillars + a new one:** **product sense** (design/improve a product; define
  metrics; user empathy; consulting-style casing), **execution/analytical** (metrics, funnels, and the
  now-dominant **conflicting-metric trade-off**; prioritization; RICE), **leadership/behavioral**, and in
  2026 a distinct **AI Product Sense** round (should-we-even-use-a-model; rules-vs-ML-vs-LLM; hallucination/
  eval/cost/latency/RAG trade-offs; sometimes live prototype). AI literacy expected (LLM basics,
  hallucinations, prompt engineering, RAG, eval metrics, responsible AI).
- **Product Analyst:** recruiter → **SQL + product case studies** (feature changes, metric anomalies,
  measuring success) + A/B testing + a **1:1 with a PM** + behavioral. Analytical rigor × product sense.
- **Business Analyst:** requirement gathering, use cases/user stories, process mapping, SQL basics,
  stakeholder mgmt, gap analysis, wireframing, Agile; case + behavioral.
- **Consultant:** **case interviews** (market sizing/guesstimates, profitability, market entry),
  structured frameworks, hypothesis-driven thinking, GD, behavioral. **Operations Analyst:** process
  analysis, Excel/SQL, Lean/Six Sigma, RCA, case.
- **Rounds:** case/product-sense → analytical/SQL → behavioral/cross-functional. **Rubric:** problem_solving
  0.30, communication 0.25, situational_judgment 0.15, behavioral 0.15, technical/analytical 0.15.

### 2.10 Design, Finance-tech, Sales-Engineering, and other roles
- **UX/UI & Product Designer:** portfolio review, design exercise/whiteboard challenge, design critique,
  user-research + interaction/visual fundamentals, behavioral. (Rubric: creative_thinking + communication heavy.)
- **Quant / Risk / Financial Analyst (finance-tech):** probability & statistics, mental math, DSA (for
  quant-dev), brainteasers/puzzles, market/finance basics, case; behavioral. (Rubric: problem_solving +
  aptitude heavy.)
- **Sales / Solution / Pre-sales Engineer:** product knowledge + technical fundamentals + **communication/
  demo + situational selling** + case + behavioral. (Rubric: communication + situational_judgment heavy.)
- **Technical Writer, DevRel, Supply-chain/Operations, HR/People Analytics, Data-entry/Support:** each has
  a distinct light stack (writing/comms, ops/Excel/SQL, support/troubleshooting) — modeled via the same
  schema with role-appropriate `focus[]` and rubric.

---

## PART 3 — SIMULATION ARCHITECTURE (reuses the Feature #01 engine)

Feature #02 is a **second blueprint interpreter over the same engine**. It does NOT need a new runtime.

### 3.1 Role Session Orchestrator (role mode)
- Loads a `role_blueprint` + `StudentProfile` + chosen seniority → builds an ordered round plan from
  `round_structure` → for each round, instantiates the matching simulator (the SAME simulators Feature
  #01 uses) → **skins each simulator with the role's `focus[]` + `skill_stack`** so questions target the
  role's real topics → collects results → runs the **Skill-Gap / Role-Readiness Resolver** (Part 5) →
  persists a `RoleSessionRecord` (extends `SessionRecord`) → renders the role report.
- Unlike company mode, role mode is **not gate-eliminating by default** (it's practice for a role, not a
  company's cut) — though a "realistic mode" toggle can enable role-typical gates.

### 3.2 Shared with Feature #01 (reuse verbatim)
- The `round_type` vocabulary and every simulator (coding judge, system-design rubric, technical/HR/
  behavioral/case via the 15 modules, aptitude/pseudocode generators).
- `scoring.py` + `scoring_config.json` (per-round → 7 pillars + PRI), `difficulty_config.json`,
  `integrity_config.json`, `llm_config.json`, `feedback_config.json`.
- `platform_skins.json` is optional here (role mode is platform-agnostic; use the generic skin unless
  combined with a company — see Part 6).

### 3.3 Net-new for Feature #02 (small, well-scoped)
- The `role_blueprint` model + loader/validator; the **role roster data** (Part 8).
- The **skill-stack weighting → question selection** logic (drive `q_technical_domain` topic choice and
  difficulty from the role's weighted `skill_stack`).
- The **Skill-Gap / Role-Readiness Resolver** (Part 5).
- **Role-specific rubrics** (per-role competency weights override the default pillar weights for the verdict).

---

## PART 4 — ROUND-APPROPRIATE SIMULATION PER ROLE FAMILY (skinning, not new code)

The engine picks each role's `round_structure`; the role's `focus[]` + `skill_stack` steer the existing
simulators. Illustrative per-family compositions (all reuse existing simulators):

| Family | Round sequence (reused simulators) |
|---|---|
| Software Eng | coding_test → technical_interview(APIs/DB/OS) → system_design(≥junior) → resume_based → hr_interview |
| Frontend | coding_test(JS/DOM) → technical_interview(React/TS/perf/testing) → system_design(full-stack) → resume_based → hr_interview |
| Data Science | coding_test(Python/SQL) → technical_interview(stats+ML) → case_study(product/A-B) → resume_based → hr_interview |
| Data Engineer | coding_test(SQL/Python) → technical_interview(ETL/warehouse/Spark) → system_design(data pipeline) → resume_based → hr_interview |
| DevOps/SRE | technical_interview(scenario: K8s/CI-CD/IaC) → technical_interview(Linux/scripting) → system_design(reliability) → hr_interview |
| Security | technical_interview(OWASP/network/crypto scenarios) → coding_test/tools → hr_interview |
| ECE/Embedded | aptitude_test → technical_mcq(digital) → technical_interview(embedded C/RTOS/peripherals) → resume_based → hr_interview |
| VLSI | technical_mcq(digital) → technical_interview(Verilog/STA/verification/PD) → resume_based → hr_interview |
| Mechanical | aptitude_test → technical_interview(SOM/thermo/CAD/design) → resume_based → hr_interview |
| Civil | aptitude_test → technical_interview(structural/geotech/estimation/IS-codes) → resume_based → hr_interview |
| Product Manager | case_study(product sense) → case_study(execution/metrics) → case_study(AI product sense) → hr_interview |
| Product Analyst | coding_test(SQL) → case_study(product/metrics/A-B) → hr_interview(+PM 1:1) |
| Consultant | case_study(market sizing/profitability) → group_discussion → hr_interview |
| UX Designer | resume_based(portfolio) → case_study(design exercise) → hr_interview |

> The table is data (derived from each `role_blueprint.round_structure`); no bespoke code per role.

---

## PART 5 — SKILL-GAP → ROLE-READINESS MODEL (the payoff)

Convert performance into a **role-readiness verdict + a targeted skill plan**.

- **Per-skill coverage:** map each answered question to the `skill_stack` skill(s) it exercises; compute a
  0–100 mastery per skill from difficulty-weighted scores (reuse `scoring.py` weights).
- **Role-Readiness Index (RRI):** weighted roll-up of skill masteries using the skill `weight`s →
  0–100 "ready for <role>". Map to the existing tiers (Platinum→Developing) via `scoring_config`.
- **Gap analysis:** list the highest-`weight` skills with lowest mastery → the "fix these first" plan
  (e.g., "Backend Developer 72% ready — weakest high-weight skills: system design (scaling/caching),
  SQL indexing, concurrency; do these 3 drills next").
- **Competency profile:** the role's `evaluation_rubric` weights the 7 pillars for the verdict, so the
  same session scores *differently* for a Data Analyst vs an ML Engineer (SQL/communication vs ML/coding).
- **Output contract:** `rri`, `tier`, `per_skill_mastery[]`, `top_gaps[]` (skill + concrete action),
  `strength_skills[]`, `competency_breakdown`, `recommended_drills[]` (reuse practice blueprints).

---

## PART 6 — ROLE × COMPANY COMPOSITION (the unique 2-D moat)

Because PrepVista owns **both** axes, it can compose them: **"prepare for a <role> at <company>."**
- The **company_blueprint** (Feature #01) supplies the *process* (rounds, platform, gates, track).
- The **role_blueprint** (Feature #02) supplies the *content focus* (skill stack, topic depth, rubric).
- Composition rule: run the company's `round_structure`, but where a round is technical/coding/interview,
  **skin it with the role's `focus[]` + `skill_stack`** and grade with the role's rubric — then apply the
  company's gate/track logic. Result: "You sat an *Amazon* loop *as a Backend Developer* — cleared coding,
  Bar Raiser borderline; role-readiness for Backend 74%; company track: Leaning-hire."
- This 2-D matrix (≈150 companies × ≈120 roles) is a combinatorial product surface no single-axis
  competitor can match, and it's *free* once both blueprint types exist (data × data).

---

## PART 7 — CONTENT STRATEGY (fresh, correct, role-true)

- **Technical questions** come from `q_technical_domain` branch banks + LLM generation **steered by the
  role's weighted `skill_stack`** (topic + subtopic + difficulty), validated + dedup'd (cosine ≥0.85).
- **Coding** from the company/role-tagged problem bank + validated LLM variants (hidden-test checked).
- **Aptitude/pseudocode** from parametric generators (correct keys, no repetition).
- **Interview/case/HR** from the 15 tested modules, skinned to the role.
- **Skill freshness:** each role's `skill_stack` carries `skill_confidence` + `last_verified`; a refresh
  loop (search + human review) keeps stacks current (e.g., add "React 19", "RAG", "GitOps" as they rise).
- **Grounding, not fine-tuning:** un-fine-tuned Groq steered by blueprint + banks + rubrics; static
  fallback so a session never breaks (per `llm_config.json`).

---

## PART 8 — THE ROLE ROSTER: MAXIMIZE BREADTH (see `02_ROLE_ROSTER.md`)

120+ roles across **all departments** + business/product/design/finance, each mapped to a role family,
eligible departments, hiring company types, a weighted skill stack, and a round structure. Tiered like
Feature #01:
- **Tier A — Full-fidelity:** the highest-demand roles (SWE/backend/frontend/full-stack, DS/DA/DE/MLE,
  DevOps/Cloud, embedded/VLSI, mechanical/civil/electrical core, PM/BA/consultant) — hand-verified stacks.
- **Tier B — Template-mapped:** the long tail (specialized + emerging roles) inheriting a family template.
- **Tier C — Generic family:** any role in `roles.json` (58 seeded) or requested runs its family template
  so there's never a "role not covered" dead-end; a "Request full modeling" button records demand.

**Family templates** (a role inherits until hand-verified): software_engineering, data_ai, infrastructure,
quality_security, electronics_ece, electrical_eee, mechanical, civil, chemical_process, business_product,
design, finance_tech, sales_engineering, writing_devrel, operations_support. Each template supplies a
default round structure + rubric + core skill list (Part 2).

---

## PART 9 — INTEGRATION WITH EXISTING ENGINE + FEATURE #01

- **Reuses everything Feature #01 builds** (simulators, orchestrator patterns, timer/negative-marking not
  needed by default, scoring, integrity, LLM config, report pipeline) + the 15 modules + `roles.json`,
  `departments.json`, `categories.json`, `competencies.json`, `scoring_config.json`.
- **`roles.json` is the seed** for `role_blueprint`s: it already has 58 roles with 20+ skills, branches,
  company_types, key_competencies, emphasized_categories — upgrade each into a full `role_blueprint`
  (weighted skill_stack + round_structure + rubric + readiness_model).
- **New data:** `role_blueprints/*.json`, `role_family_templates.json`. **New services:** role session
  orchestrator, skill-stack→question selector, skill-gap/role-readiness resolver, role-rubric applier.
- **Composition service** (Part 6) bridges Features #01 and #02.

---

## PART 10 — WHY COMPETITORS FAIL TO REPLICATE

1. **Breadth wall:** 120+ roles across *all* departments (incl. the ignored core + business roles), each
   with a real weighted skill stack — a sustained taxonomy + research asset.
2. **Fidelity wall:** current, sub-topic-level, weighted stacks refreshed each cycle (TypeScript baseline,
   Playwright, UVM, RAG, AI-product-sense) — cycle-perishable to copy.
3. **Structure wall:** each role's own round sequence + rubric; a generic single-flow chat can't fake a
   DS loop vs an SWE loop vs a VLSI loop vs a PM loop.
4. **Readiness wall:** skill-gap → role-readiness verdict needs the weighted stack + calibrated mapping.
5. **2-D wall:** role × company composition is only possible if you own *both* axes with this depth.
6. **Engine wall:** both features ride a tested 15-module engine + shared simulators; a newcomer must
   build the substrate for both axes before matching either.

---

## PART 11 — BUILD SEQUENCE FOR CLAUDE CODE

1. **Schema + seed data:** implement `role_blueprint` model + loader/validator; upgrade the 58 roles in
   `roles.json` into full `role_blueprint`s (weighted skill_stack + round_structure + rubric); add
   `role_family_templates.json`.
2. **Role Session Orchestrator (role mode)** reusing the Feature #01 engine + the 15 modules.
3. **Skill-stack → question selector:** drive `q_technical_domain` topic + difficulty from the weighted stack.
4. **Skill-Gap / Role-Readiness Resolver** (RRI + gaps + role rubric).
5. **Role report:** extend `feedback_config` with per-skill mastery, RRI + tier, top gaps, recommended drills.
6. **Role × Company composition service** (bridge to Feature #01).
7. **Frontend:** role picker (by department → family → role, with skill-stack preview + readiness), the
   role-readiness result view, and the "Request full modeling" button.
8. **Roster expansion:** Tier-B/C family-template mapping so any role has a working simulation (zero-code add).

---

## PART 12 — OPEN ITEMS / VERIFY-BEFORE-SEASON
- **Skill stacks churn fast** — the `skill_confidence` + `last_verified` stamps + refresh loop are part of
  the product; prioritize refreshing high-demand roles each cycle.
- **Non-code role rubrics** (design/consulting/PM) are more subjective — lean on rubric-based LLM grading
  with clear checklists; calibrate with exemplars like the existing modules do.
- **Role definitions vary by company** — the same title can mean different things; store aliases + a
  `focus[]` that a company skin (Part 6) can further narrow.

---
*End of dossier. Companion files: `MASTER_PROMPT_FULL.md` (build prompt) and `02_ROLE_ROSTER.md` (the roster).*

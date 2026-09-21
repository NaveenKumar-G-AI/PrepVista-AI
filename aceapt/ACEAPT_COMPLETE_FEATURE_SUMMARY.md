# ACEAPT Complete Codebase Feature Summary

## Purpose

This document is the consolidated feature catalog for the complete codebase in `C:\aceapt`. It explains what every numbered module does, what a user or stakeholder can see demonstrated, the important supporting capabilities behind it, and where the implementation is intentionally limited, mocked, or adapter-based.

The catalog is based on a repository-wide static audit of the authored application code, UI code, APIs, engines, schemas, migrations, seed data, configuration, tests, and project documentation. The audit read 2,484 authored text/source files containing 234,014 physical lines, including 2,308 code/schema files and 274 test files. Dependency lockfiles, generated build metadata, archives, and binary assets were excluded because they do not define product behavior. Existing `.env` values were not copied into this document.

The repository contains 51 numbered feature modules. Present modules are Features 1–48, 50, 51, 53, 56, and 57. There is no source directory for Features 49, 52, 54, or 55, so this document does not invent capabilities for those missing modules.

## Executive feature catalog

| # | Feature headline | What it demonstrates and why it matters |
|---:|---|---|
| 1 | AI Onboarding | Builds a validated student context—goals, timeline, confidence, constraints, and preferences—then hands a structured profile to later intelligence engines. It demonstrates that personalization starts before the first assessment. |
| 2 | Adaptive Aptitude Diagnostic | Selects questions adaptively, captures answer/time/confidence evidence, estimates capabilities, detects root causes, and produces a diagnostic report. It establishes an evidence-based baseline instead of relying on self-report. |
| 3 | Adaptive Skill Intelligence | Converts attempts and self-perception into a skill map with strength, gap, speed, confidence, trust, and priority signals. It shows what the learner can actually do and where perception differs from evidence. |
| 4 | Personalized Mastery Path | Turns capability gaps and prerequisite relationships into a prioritized, time-aware learning path and daily mission. It demonstrates an explainable route from current ability to mastery. |
| 5 | Adaptive Practice & Dynamic Challenge | Runs personalized practice sessions with dynamic selection, difficulty adaptation, hints, retries, error classification, mastery updates, and safe question generation. It shows that practice changes in response to performance. |
| 6 | Intelligent Assessment, Exam Simulation & Readiness | Generates blueprint-controlled assessments, runs server-authoritative timed attempts, scores behavior and performance, and produces multi-dimensional readiness reports. It demonstrates exam-grade measurement rather than a simple quiz. |
| 7 | Readiness Coaching & Action Center | Combines readiness gaps, priorities, goals, milestones, and action execution into one next-best-action experience. It turns diagnosis into an immediately usable coaching plan. |
| 8 | Mastery Verification, Retention & Transfer | Verifies mastery across concept, execution, transfer, retention, timed performance, and consistency; schedules reviews and records evidence history. It distinguishes temporary correctness from durable capability. |
| 9 | Real-World Performance Simulation | Runs mixed-topic, hidden-label simulations with timer, navigation, negative marking, decision tracking, endurance analysis, failure cascades, and recovery insights. It shows how knowledge behaves under realistic pressure. |
| 10 | Mastery & Readiness Forecasting | Models trajectory, velocity, momentum, volatility, regression, false mastery, risks, bottlenecks, and target-readiness forecasts. It demonstrates not only where the learner is, but where current behavior is likely to lead. |
| 11 | Learning Behavior, Motivation & Consistency Intelligence | Derives persistence, consistency, recovery, friction, assistance dependency, confidence calibration, plan adherence, workload, and temporal behavior from events. It shows how learning behavior affects outcomes without making unsupported psychological claims. |
| 12 | Personalized Intervention & Learning Transformation | Detects learning problems, ranks interventions, executes them, measures immediate/retention/transfer outcomes, and learns which intervention types work for each student. It demonstrates a closed improvement loop. |
| 13 | Continuous Readiness & Exam-Condition Performance | Maintains readiness as a changing evidence-backed state across simulations, dimensions, confidence, history, gaps, and postmortems. It shows that readiness can improve, regress, and be re-evaluated continuously. |
| 14 | Adaptive Mastery & Skill Transfer Intelligence | Builds an evidence-backed mastery map, runs targeted mastery checks, identifies prerequisite root causes, and separates stable, robust, transfer, retention, and insufficient-evidence states. It prevents one score from being mistaken for mastery. |
| 15 | Personalized Learning Journey Orchestrator | Converts mastery evidence and dependencies into journey states, root blockers, prioritized activities, time-boxed daily plans, stages, progress, and replanning. It makes the broader learning journey visible and actionable. |
| 16 | Adaptive Learning Intervention & Recovery | Diagnoses why a learner is stuck, deconstructs errors, selects progressive hints or alternate explanations, runs recovery sessions, and measures intervention effectiveness. It demonstrates targeted repair rather than repeating the same lesson. |
| 17 | Adaptive Question Intelligence & Generation | Controls question purpose, difficulty, selection, anti-repetition, distractors, generation, validation, explanations, branching arcs, transfer checks, and personalized sets. It demonstrates that every question has a diagnostic or learning purpose. |
| 18 | Intelligent Solution Reasoning & Multi-Path Coach | Localizes the first reasoning break, separates consequential errors, offers multiple representations and guided repair, supports follow-up questions, and verifies transfer. It demonstrates coaching around how the learner reasoned, not only whether the final answer was wrong. |
| 19 | Retention, Forgetting & Knowledge Reinstatement | Measures evidence strength and diversity, detects decay, propagates prerequisite risk, schedules recall, and escalates a reactivation ladder until capability is re-verified. It demonstrates active protection against forgetting. |
| 20 | Adaptive Real-World Aptitude Simulation & Pressure Intelligence | Runs timed baseline and pressure drills, classifies decisions, analyzes segment-level performance, and shows before/after improvement. It demonstrates how pressure changes strategy, timing, and accuracy. |
| 21 | Diagnosis + Next-Best-Action Engine | Aggregates upstream signals, clusters errors, traces root causes, ranks candidate actions, remembers intervention response, and explains one best next move. It turns a complex student state into a defensible decision. |
| 22 | Pathfinder | Resolves a target state, calculates gaps and bottlenecks, prioritizes work, creates an evidence-gated path, and replans without discarding completed progress. It demonstrates an adaptive route to a concrete goal. |
| 23 | Adaptive Readiness & Real-World Performance Certification | Gates readiness across mastery, transfer, retention, timed performance, and simulation evidence, identifies blockers, launches the next proof, and emits a Pathfinder handoff. It demonstrates evidence-based readiness certification. |
| 24 | RECALL | Detects at-risk knowledge, prioritizes memory checks, runs staged recovery and delayed verification, recognizes recurring weakness, and shares evidence with PATHFINDER and PROOF. It demonstrates that retained knowledge is actively maintained. |
| 25 | TRANSFER | Tests a familiar method in novel contexts, diagnoses concept/method/calculation gaps, generates a micro-bridge, retests across contexts, and updates a transfer profile. It demonstrates whether learning generalizes beyond rehearsed examples. |
| 26 | ADAPT | Diagnoses current capability, scores candidate actions, recommends one next action or a time-boxed plan, executes it, updates evidence, and immediately replans. It demonstrates a full evidence-to-action-to-adaptation loop. |
| 27 | FORECAST | Produces readiness state, target gaps, trajectory, confidence, risks, scenarios, historical snapshots, cohort aggregation, and an ADAPT handoff. It demonstrates likely outcomes and what would change them. |
| 28 | PROOF | Aggregates evidence, ages stale readiness, detects failure signatures, selects targeted verification, analyzes simulations, and records before/after proof history. It demonstrates that claims are backed by current, relevant evidence. |
| 29 | ALIGN | Compares capability DNA with target requirements, calculates fit/readiness/confidence, classifies and prioritizes gaps, shortlists targets, and simulates what-if improvements. It demonstrates whether a target fits and what must change to reach it. |
| 30 | PATH | Converts an aligned target into milestones, gap and bottleneck work, risk-aware path modes, readiness projections, next actions, failure recovery, and target switching. It demonstrates a live execution route from target to readiness. |
| 31 | Readiness Simulator | Runs target-specific multi-stage scenarios, records server-timed attempts, evaluates failure points, updates evidence/readiness/PATH, compares attempts, and shows historical trends. It demonstrates readiness through realistic work samples. |
| 32 | Readiness Radar | Maps role requirements to current capability, accepts new assessment evidence, calculates trend/confidence gaps, and ranks priority actions. It gives a concise role-specific view of what is ready, weak, or unknown. |
| 33 | Opportunity-to-Action Engine | Ingests opportunities, extracts requirements, checks deadlines/eligibility/duplicates, matches capabilities, recommends whether to act, builds plans, tracks applications, and learns from outcomes. It converts opportunity discovery into execution. |
| 34 | Career Trajectory & Future Scenario Intelligence | Models current career movement, target trajectories, alternative scenarios, recommendations, and plan implications. It demonstrates how present choices may alter the learner’s career direction. |
| 35 | Career Conversion & Failure-Recovery Intelligence | Records application stages and evidence, analyzes the conversion funnel, identifies bottlenecks and repeated mistakes, creates recovery plans, and tracks reassessment. It turns rejection and stalled conversion into structured learning. |
| 36 | Career Execution Intelligence | Compiles goals into prioritized actions, adapts to available time, runs work sessions, captures evidence/blockers, tracks momentum and plan health, and conducts weekly review. It bridges strategy and daily execution. |
| 37 | Career Readiness Proof Engine | Separates career claims from proof, classifies and ages evidence, calculates capability/opportunity readiness, identifies proof gaps, and recommends the next proof. It makes employability evidence visible and auditable. |
| 38 | Personal Career Positioning | Selects relevant strengths and projects, identifies differentiators and positioning gaps, checks narrative consistency, and generates a role-specific introduction and “why you fit” story. It turns evidence into credible professional positioning. |
| 39 | Intelligent Opportunity & Application Strategy | Parses job descriptions, checks opportunity safety, matches skills and career direction, prioritizes applications, creates claim-safe content, manages follow-ups, and reports insights. It improves both application choice and execution quality. |
| 40 | Career Horizon | Tracks skill and market trends, models role evolution, forecasts future gaps, explores paths and scenarios, creates market briefs, and hands actions to execution systems. It helps the user prepare for where the market is moving. |
| 41 | Adaptive Career Strategy Engine | Builds a career command center with constraint-aware bottlenecks, next-best moves, health, momentum, drift detection, strategy versions, decisions, experiments, reviews, and feedback. It keeps the overall career strategy coherent as evidence changes. |
| 42 | Advanced Aptitude Diagnostic | Runs a secure adaptive diagnostic with timing and evidence-quality intelligence, hierarchical capability estimation, uncertainty, consistency/fatigue detection, bottlenecks, stopping rules, reassessment, and explanations. It provides the most rigorous full diagnostic implementation in the repository. |
| 43 | Adaptive Diagnostic Engine | Uses information value and five adaptive modes—explore, investigate, verify, challenge, and transfer—to decide what evidence to collect next and when to stop. It demonstrates efficient, deterministic assessment tailored to the learner’s unresolved questions. |
| 44 | Goal-Based Learning Engine | Resolves natural-language goals, checks feasibility, calculates target gaps and priority, generates evidence-based milestones, tracks progress/health/history, and hands work to learning/planning/readiness systems. It organizes learning around outcomes rather than content lists. |
| 45 | Aptitude Skill Graph | Maintains a versioned global skill graph and evidence-driven personal graph with typed relationships, validation, root causes, priority signals, cohort views, and admin publishing. It provides the structural intelligence shared by diagnostics and learning engines. |
| 46 | Socratic Teaching Mode | Runs purpose-tagged questioning, classifies responses, escalates hints/explanations, tests misconceptions, targets partial understanding, requires teach-back, and verifies independently in a novel context. It demonstrates teaching through guided reasoning. |
| 47 | Guided Solving Engine | Breaks problems into validated steps, localizes the first error, distinguishes cascading errors, controls help levels and fading, supports retry/skip/explanation/reveal/reconstruction, and verifies learning. It demonstrates assistance without immediately giving away the solution. |
| 48 | Hint Intelligence Engine | Chooses the minimum sufficient hint, supports eight progressive levels, changes strategy after failed hints, prevents answer leakage, respects assessment mode, and records outcomes and analytics. It demonstrates intelligent help rather than generic hints. |
| 50 | Speed Training Engine | Builds personal speed baselines, separates speed from accuracy, detects ten bottleneck types, adapts time pressure safely, enforces accuracy guardrails, and supports pacing and decision training. It improves speed without rewarding rushing. |
| 51 | Accuracy Training Engine | Profiles accuracy stability and recurring error patterns, selects precision interventions, runs ten training modes, and provides deterministic self-correction and error-spotting exercises. It improves reliability, not just average score. |
| 53 | Question Quality Engine | Validates schema, answers, solutions, math, skill alignment, difficulty, similarity, clarity, distractors, fairness, and accessibility; manages review, versioning, publication, suspension, and reports. It protects every assessment and training engine from bad content. |
| 56 | Formula Intelligence Engine | Models canonical formulas, derived forms and relationships; diagnoses recognition/recall/selection/mapping/application errors; detects confusion; and adapts eight types of formula training. It develops usable formula competence rather than rote memorization. |
| 57 | Personal Shortcut Library | Stores, validates, discovers, recommends, trains, and measures personal solving shortcuts, with trust, applicability, regression, ownership, and tenant controls. It turns successful personal methods into a reusable, evidence-backed asset. |

## Detailed feature analysis

### 1. AI Onboarding (`part1`)

The onboarding module provides a welcome-to-summary wizard that collects a learner’s goal, target, date, available time, confidence, and learning context. Its flow can adapt the next step to prior answers; server validation normalizes inputs and derives values such as days available instead of trusting client calculations. Completion produces a structured onboarding summary and a handoff contract for the diagnostic module. It also records onboarding events and supports a diagnostic-introduction transition.

Supporting implementation includes Next.js routes, reusable form primitives, a Prisma/SQLite data model, anonymous session-cookie identity, middleware, validation, deterministic summary generation, an optional AI summary layer, and a deterministic fallback. The current identity mechanism is anonymous rather than production account authentication; analytics are stored but there is no analytics administration screen.

Primary evidence: [`part1/src/lib/onboarding`](part1/src/lib/onboarding), [`part1/src/components/onboarding`](part1/src/components/onboarding), [`part1/src/app/api/onboarding`](part1/src/app/api/onboarding), and [`part1/README.md`](part1/README.md).

### 2. Adaptive Aptitude Diagnostic Engine (`part2`)

This module creates and resumes diagnostic sessions, chooses the next question from coverage, uncertainty, difficulty, and evidence needs, scores responses on the server, captures response time and selected confidence, and stops when the evidence objective is satisfied. It builds capability states, separates insufficient evidence from weakness, detects possible prerequisite/root-cause relationships, and creates a result report with strengths, gaps, priorities, and an explanation narrative.

The question system includes seeded skills/questions and a structural quality validator. API writes are idempotent, answer keys remain server-side, analytics events are emitted, and AI interpretation through Groq is optional with a deterministic fallback. The shipped bank is intentionally limited and authentication is a cookie-based stand-in.

Primary evidence: [`part2/src/lib/domain`](part2/src/lib/domain), [`part2/src/app/api/diagnostic`](part2/src/app/api/diagnostic), [`part2/src/components/diagnostic`](part2/src/components/diagnostic), and [`part2/README.md`](part2/README.md).

### 3. Adaptive Skill Intelligence Engine (`part3`)

Feature 3 turns raw attempts and onboarding self-perception into an evidence-weighted skill profile. It models skill taxonomy and relationships, calculates capability and confidence, distinguishes foundation/application/transfer gaps, identifies speed-only issues, caps conclusions when evidence is sparse or contradictory, and computes high-leverage priorities. A perception engine highlights where self-belief and demonstrated performance disagree, while a trust layer prevents thin evidence from appearing precise.

The UI presents a skill map, skill detail, confidence gauge, and recommended focus. The narrative layer may rephrase already-computed findings but does not own the capability decision. Persistence is JSON-based and auth is a demo header seam.

Primary evidence: [`part3/src/engine`](part3/src/engine), [`part3/src/domain`](part3/src/domain), [`part3/web/src/components`](part3/web/src/components), and [`part3/README.md`](part3/README.md).

### 4. Personalized Mastery Path & Learning Intelligence (`part4`)

This engine consumes capability evidence and a prerequisite graph to generate a personalized mastery path. It calculates gaps, downstream impact, bottlenecks, priority, difficulty, and the next best action; plans against available time; detects when the learner is stuck; and selects repair or intervention actions. Every recommendation has an explainability payload so the UI can show both “why this” and “why not another skill.”

The learner experience includes a mastery path, node detail, today’s mission, and action execution. Service and repository boundaries support event recording, in-memory or Postgres persistence, dev evidence ingestion, and later replacement of the Feature 3 adapter. The implementation is a reference vertical slice rather than a fully integrated platform instance.

Primary evidence: [`part4/src/domain`](part4/src/domain), [`part4/src/services`](part4/src/services), [`part4/web/components`](part4/web/components), and [`part4/TRUTH_TABLE.md`](part4/TRUTH_TABLE.md).

### 5. Adaptive Practice & Dynamic Challenge (`part5`)

Feature 5 plans and runs personalized practice sessions. The selection engine uses skill state, session purpose, difficulty, recent exposure, and anti-memorization rules. During a session it captures confidence, classifies errors, provides progressive hints and explanations, chooses retry behavior, adapts difficulty, and updates mastery evidence. The summary explains adaptations and performance rather than reporting only a score.

Question generation supports deterministic templates and an optional Anthropic provider. Generated content passes a quality gate before use, with verified template fallback when AI is unavailable. The module includes JWT/role middleware, audit and analytics services, repositories, seeded questions/skills, an administrative surface, and a de-identified dashboard aggregate. Its content depth is deliberately concentrated in a small set of percentage-related skills.

Primary evidence: [`part5/backend/src/engines`](part5/backend/src/engines), [`part5/backend/src/generation`](part5/backend/src/generation), [`part5/backend/src/services/practiceOrchestrator.ts`](part5/backend/src/services/practiceOrchestrator.ts), and [`part5/frontend/src/components`](part5/frontend/src/components).

### 6. Intelligent Assessment, Exam Simulation & Readiness (`part6`)

Feature 6 builds assessments from controlled blueprints, selects exposure-aware healthy questions, starts a server-authoritative timed session, supports answer/skip/navigation behavior, and scores correctness without trusting the client. It analyzes time investment, section use, skill errors, difficulty performance, answer changes, skip strategy, consistency across attempts, and nine readiness dimensions. The final report converts risks into a concrete practice request for Feature 5 and stores assessment/readiness history.

Its architecture separates blueprint, selection, quality, generation, session, timer, scoring, analysis, reporting, recommendation, and history services. Rate limiting, auth seams, error handling, migrations, seeds, history UI, readiness gauge, question runner, and result views support the core engine. Question calibration and auth are prototype-grade, and the Feature 5 completion integration is simulated.

Primary evidence: [`part6/backend/src/services`](part6/backend/src/services), [`part6/backend/src/config`](part6/backend/src/config), [`part6/frontend/src/pages`](part6/frontend/src/pages), and [`part6/README.md`](part6/README.md).

### 7. Intelligent Readiness Coaching & Action Center (`part7`)

The Action Center combines assessment readiness, practice state, goals, and milestone evidence to rank problems and present the most useful next action. It executes or completes actions, recalculates the priority after new evidence, tracks readiness gaps, maintains milestones, and tells a progress story that connects completed work to readiness change.

The module exposes orchestration, problem/priority, intervention/explanation, action-execution, goals/milestones, and readiness/progress services. The frontend includes the Action Center, Priority Board, Readiness Gap panel, Milestones panel, and Progress Story. Feature 5 and 6 dependencies are represented by clients that can be replaced by real platform services.

Primary evidence: [`part7/src/services`](part7/src/services), [`part7/src/components`](part7/src/components), [`part7/src/routes/feature7.routes.ts`](part7/src/routes/feature7.routes.ts), and [`part7/README.md`](part7/README.md).

### 8. Intelligent Mastery Verification, Retention & Transfer (`part8`)

Feature 8 maintains mastery as a multi-dimensional evidence state: concept, execution, transfer, retention, timed performance, and consistency. It ingests practice/assessment evidence, computes dimension scores, starts objective-specific verification sessions, selects and varies questions, scores answers server-side, changes mastery state, schedules reviews, detects retention risk, and records a complete before/after history and explanation trail.

The student UI provides login, mastery map, skill details, evidence, state tracks, calibration, verification sessions, and a review queue. The backend includes JWT and service-key security, Postgres repositories, row-level security, transition effects, an outbox/signal bus, and adapters for downstream learning/readiness features. AI is limited to content variation or explanation and has a deterministic fallback.

Primary evidence: [`part8/backend/src/services`](part8/backend/src/services), [`part8/backend/src/repositories`](part8/backend/src/repositories), [`part8/frontend/src/pages`](part8/frontend/src/pages), and [`part8/README.md`](part8/README.md).

### 9. Real-World Performance Simulation (`part9`)

This module runs mixed-topic simulations whose topic labels can be hidden and whose difficulty order is blueprint-controlled. A server timer owns the deadline; users can answer, skip, return, and navigate while question events are recorded. Scoring supports negative marking and feeds decision-quality, time-management, error-pattern, consistency, endurance, performance-curve, recovery, and failure-cascade analyzers.

The report presents seven performance dimensions, secondary insights, readiness impact, and a next-action signal, with history across simulations. Integration adapters represent Features 3–8. The included bank is small and hand-authored, and several behavior classifications are transparent heuristics rather than calibrated models.

Primary evidence: [`part9/backend/src/services`](part9/backend/src/services), [`part9/backend/src/analytics`](part9/backend/src/analytics), [`part9/frontend/src/components`](part9/frontend/src/components), and [`part9/README.md`](part9/README.md).

### 10. Intelligent Mastery & Readiness Forecasting (`part10`)

Feature 10 forecasts readiness from capability evidence and target thresholds. It calculates learning velocity, trajectory, momentum, volatility, confidence, intervention effectiveness, and target readiness; detects regression and false mastery; ranks risks and bottlenecks; and produces a future range rather than false point precision. A repository stores forecast snapshots so the dashboard can show movement over time.

AI is permitted to explain a deterministic forecast input but not change the forecast. The implementation includes target and integration adapters, a demo end-to-end path, and a readiness dashboard. Production authentication, calibrated thresholds, and real upstream services remain integration tasks.

Primary evidence: [`part10/src/engines`](part10/src/engines), [`part10/src/ai`](part10/src/ai), [`part10/src/api/routes.ts`](part10/src/api/routes.ts), and [`part10/README.md`](part10/README.md).

### 11. Learning Behavior, Motivation & Consistency Intelligence (`part11`)

Feature 11 analyzes learning events to derive evidence-backed behavior signals: session consistency, persistence, recovery after failure, abandonment, assistance dependency, challenge engagement, confidence calibration, friction, plan adherence, workload mismatch, and temporal patterns. It builds an eight-dimension behavior profile, stores historical snapshots, accepts learner-provided context, and emits confidence-filtered adaptive signals for planners.

The explanation layer cites supporting behavior rather than assigning personality labels. A sample planner shows how a plan-change explanation can consume the profile. Storage and auth are replaceable interfaces with in-memory/demo implementations; cross-student friction logic exists, but there is no institutional dashboard.

Primary evidence: [`part11/backend/src/domain/signals`](part11/backend/src/domain/signals), [`part11/backend/src/domain/profileBuilder.ts`](part11/backend/src/domain/profileBuilder.ts), [`part11/frontend/src/components`](part11/frontend/src/components), and [`part11/README.md`](part11/README.md).

### 12. Personalized Intervention & Learning Transformation (`part12`)

The intervention pipeline detects five categories of learning problem, generates candidate interventions, ranks them using problem fit, student fit, context, historical response, cost, and cognitive load, and assembles an explainable decision. It supports eight intervention contracts and the full start/complete/abandon lifecycle. Outcome logic compares before and immediate evidence, then adds delayed retention and transfer checks.

The module builds a personal intervention-response profile and detects non-response, saturation, and cold start. The UI presents the recommended intervention, why it was selected, an intervention runner, before/after summary, history, and profile. Cross-feature recalculation and signals are adapter stubs; persistence is an in-memory reference store.

Primary evidence: [`part12/backend/src/engine`](part12/backend/src/engine), [`part12/backend/src/domain/interventionCatalog.ts`](part12/backend/src/domain/interventionCatalog.ts), [`part12/frontend/src/components`](part12/frontend/src/components), and [`part12/README.md`](part12/README.md).

### 13. Continuous Readiness & Exam-Condition Performance (`part13`)

Feature 13 treats readiness as a continuously updated, event-sourced profile. It generates and runs simulations, processes attempt events, scores dimensions within a simulation, analyzes patterns across simulations, calculates confidence, detects readiness gaps, and creates postmortems and intervention handoffs. Twelve readiness dimensions and explicit state gates prevent one strong test from silently overriding weak or insufficient evidence elsewhere.

The UI includes readiness instruments, gap list, journey chart, simulation runner, results, postmortem, and history. Postgres persistence uses student context and row-level security. Feature 8/9/10/12 connections are typed clients but use mock implementations in this standalone module.

Primary evidence: [`part13/server/src/engines`](part13/server/src/engines), [`part13/server/src/simulation`](part13/server/src/simulation), [`part13/web/src/pages`](part13/web/src/pages), and [`part13/README.md`](part13/README.md).

### 14. Adaptive Mastery & Skill Transfer Intelligence (`part14`)

This engine builds a mastery map from evidence across correctness, independence, difficulty, novelty, timing, consistency, and delay. It separates developing, stable, robust, transfer-gap, retention-gap, and insufficient-evidence conditions; identifies prerequisite root causes; creates targeted mastery-check blueprints; processes new answers; and recomputes the state with an evidence-backed explanation.

The frontend provides a mastery map, evidence strip, “What do I know?” overview, skill detail, and mastery-check flow. Data is stored in a JSON repository for the standalone build, while contracts define the intended connections to intervention and readiness features.

Primary evidence: [`part14/backend/src/engine`](part14/backend/src/engine), [`part14/frontend/src/components`](part14/frontend/src/components), and [`part14/README.md`](part14/README.md).

### 15. Personalized Learning Journey Orchestrator (`part15`)

Feature 15 is a self-contained journey planner. It traverses skill prerequisites and downstream dependencies, finds true root blockers, classifies skills as blocked/ready/needs review/mastered, calculates need, impact, urgency, and dependency bonuses, and chooses foundation, repair, targeted practice, introduction, transfer, or retention activity types. A greedy time-budget planner always preserves the top priority while fitting additional work into the learner’s available minutes.

It also calculates journey stage and target progress, changes mode under deadline pressure, explains why an activity was chosen or deferred, and diffs old/new paths after evidence changes. The UI exposes Today, Journey Map, Progress, skill detail, constraints, and replanning. All external endpoints and mastery evidence are mocked in this prototype.

Primary evidence: [`part15/feature15_journey_orchestrator.jsx`](part15/feature15_journey_orchestrator.jsx).

### 16. Adaptive Learning Intervention & Recovery (`part16`)

Feature 16 diagnoses conceptual, interpretation, strategy, calculation, and related root causes, then deconstructs the first meaningful error rather than treating all downstream mistakes equally. It can select an intervention, offer five progressive hint levels, explain the idea in eight representation styles, generate targeted variants, and run a recovery sequence from clarification through contrast, guided practice, independent retry, and verification.

The system tracks six Profit & Loss micro-skills, builds a student intervention profile, measures before/after effectiveness, and emits idempotent recovery events. The frontend includes live practice, error deconstruction, hints, alternate explanations, a stuck menu, intervention history, and a recovery-session view. Persistence is JSON and Features 10–15 are represented by local clients.

Primary evidence: [`part16/server/src/engine`](part16/server/src/engine), [`part16/client/src/components`](part16/client/src/components), and [`part16/README.md`](part16/README.md).

### 17. Adaptive Question Intelligence & Assessment Generation (`part17`)

Feature 17 determines why a question is needed, selects the appropriate difficulty and evidence target, avoids unhelpful repetition, detects the diagnostic purpose of wrong options, and orchestrates success or struggle branches. It supports transfer and retention questions, personalized short sets, misconception-tagged distractors, “why this question” explanations, and different sequences for students with different evidence.

Generation uses a validated template path by default and an Anthropic path when configured; invalid generation falls back safely. The hand-authored bank and engine logic are real, while mastery, intervention, journey, behavior, trajectory, and readiness inputs are explicit stubs. Persistence is flat JSON.

Primary evidence: [`part17/src/engines`](part17/src/engines), [`part17/src/services/questionOrchestrator.js`](part17/src/services/questionOrchestrator.js), [`part17/src/integrations`](part17/src/integrations), and [`part17/README.md`](part17/README.md).

### 18. Intelligent Solution Reasoning & Multi-Path Coach (`part18`)

This prototype captures the chosen answer, response time, and confidence, validates the underlying percentage calculation deterministically, maps wrong choices to conceptual/strategy/execution branches, and marks the first error separately from consequential later steps. It can explain with a formula, plain language, or worked example; answer a grounded follow-up through AI with fallback copy; guide the learner step by step; show alternate methods; and finish with an independent transfer question.

Event emissions currently log to the console and the displayed mastery/transfer improvement is illustrative. Question content and downstream Feature 10/14/15/16 updates are mocked, so this is a complete interaction prototype rather than a persisted platform integration.

Primary evidence: [`part18/feature18-reasoning-coach.jsx`](part18/feature18-reasoning-coach.jsx) and [`part18/INTEGRATION-NOTES.md`](part18/INTEGRATION-NOTES.md).

### 19. Retention, Forgetting & Knowledge Reinstatement (`part19`)

Feature 19 evaluates the amount, recency, variety, and contextual diversity of evidence; produces qualitative retention strength bands; detects corroborated decay; considers pressure-related degradation; and soft-propagates risk through a concept dependency graph. It schedules recall work and runs a reversible reactivation ladder from retrieval prompt through hints, micro-lessons, contrastive explanation, repair, and verification.

AI may author recall or explanation text but never decide the retention state. The dashboard shows knowledge health, today’s memory check, and retention state. Repositories are in memory, with a Prisma schema supplied for production; personalized decay curves are not yet learned.

Primary evidence: [`part19/src/engine`](part19/src/engine), [`part19/src/services/RetentionService.ts`](part19/src/services/RetentionService.ts), [`part19/frontend`](part19/frontend), and [`part19/README.md`](part19/README.md).

### 20. Adaptive Real-World Aptitude Simulation & Pressure Intelligence (`part20`)

Feature 20 runs a baseline test and a targeted pressure drill through a guarded state machine. Server-side timing and scoring classify completion versus expiry, while a decision classifier and analytics engine analyze question handling, time allocation, difficulty response, pressure changes, and segment-level performance. A drill selector chooses the repair experience, and the UI visualizes processing, report dimensions, segment curves, and before/after improvement.

AI is restricted to narrative phrasing with deterministic fallback. The seeded question bank and demo student are reference data, and adaptive difficulty is intentionally not part of this slice.

Primary evidence: [`part20/backend/src/engine`](part20/backend/src/engine), [`part20/backend/src/routes`](part20/backend/src/routes), [`part20/frontend/src/components`](part20/frontend/src/components), and [`part20/README.md`](part20/README.md).

### 21. Diagnosis + Next-Best-Action Engine (`part21`)

Feature 21 combines upstream readiness, behavior, mastery, retention, transfer, and simulation signals into one student state. It classifies diagnosis categories, clusters related errors, traces prerequisite root causes, creates candidate actions from a catalog, scores the expected value and cost of each option, and returns one next-best action with evidence and alternatives. Intervention memory lets prior response affect later choices.

The orchestrator remains deterministic; optional AI improves explanation wording only. This module does not rerun the upstream assessment or learning engines—it consumes their contracts—and its adapters and data are mock/reference implementations.

Primary evidence: [`part21/src/diagnosisEngine.ts`](part21/src/diagnosisEngine.ts), [`part21/src/rootCauseGraph.ts`](part21/src/rootCauseGraph.ts), [`part21/src/actionScoring.ts`](part21/src/actionScoring.ts), [`part21/src/orchestrator.ts`](part21/src/orchestrator.ts), and [`part21/README.md`](part21/README.md).

### 22. Pathfinder (`part22`)

Pathfinder compares current capability with a target state, computes gaps, identifies the highest-leverage bottleneck, assigns evidence and confidence, scores priority, and generates an ordered path. Replanning is gated by evidence strength and preserves completed nodes, so a small signal cannot repeatedly rewrite the learner’s plan. Deadline, impact, feasibility, dependency, and effort all influence the path.

The demo UI makes the route, bottleneck, and explanations visible. The service stores paths in memory, and real mastery/retention/transfer/readiness services are adapter seams rather than active integrations.

Primary evidence: [`part22/pathfinderService.ts`](part22/pathfinderService.ts), [`part22/pathEngine.ts`](part22/pathEngine.ts), [`part22/bottleneckEngine.ts`](part22/bottleneckEngine.ts), [`part22/priorityEngine.ts`](part22/priorityEngine.ts), and [`part22/README.md`](part22/README.md).

### 23. Adaptive Readiness & Real-World Performance Certification (`part23`)

Feature 23 evaluates five readiness gates—mastery, transfer, retention, timed performance, and simulation—using recency-weighted scores, minimum evidence, variability, and confidence. It classifies overall readiness, identifies and ranks blockers, explains the evidence shortfall, selects the next best proof, and produces a structured Pathfinder signal. A real six-question timed proof can update the evidence and readiness state.

The interface includes gate details, trends, resilience views, readiness history, proof intro/runner/result screens, and local persistence. Only the timed gate has a complete interactive proof flow; the other proof types and outbound Pathfinder delivery are represented rather than integrated.

Primary evidence: [`part23/aceapt-proof.jsx`](part23/aceapt-proof.jsx).

### 24. RECALL (`part24`)

RECALL classifies knowledge as stable, recently learned, at risk, recovering, or not learned by combining delayed evidence, retention trends, recurrence, and sufficiency. A priority engine chooses the memory task, and the recovery engine moves through retrieval, hints, repair, immediate verification, and a delayed check. Recurring recover-then-relapse patterns trigger stronger intervention instead of endlessly repeating the same prompt.

The dashboard and recovery flow include a retention trace and a demo time jump for delayed verification. APIs expose Pathfinder signals and PROOF evidence contracts. Auth, background scheduling, and broad question content remain prototype seams.

Primary evidence: [`part24/backend/src/engine`](part24/backend/src/engine), [`part24/backend/src/services/recallService.ts`](part24/backend/src/services/recallService.ts), [`part24/frontend/src/pages`](part24/frontend/src/pages), and [`part24/README.md`](part24/README.md).

### 25. TRANSFER (`part25`)

Feature 25 starts from a familiar question, then generates or selects a novel-context question and checks concept recognition, method selection, and numerical execution separately. A deterministic classifier distinguishes concept, method, and calculation failure. The coach creates a focused micro-bridge, runs guided application, and retests in another context before updating the transfer profile.

Generated novel questions and bridges use schema-validated AI with deterministic fallbacks. Evidence and profile state persist in browser storage, while mastery/retention values, institutional views, and Pathfinder/PROOF delivery are simulated. Multi-concept transfer and fully longitudinal leveling are out of scope.

Primary evidence: [`part25/aceapt-transfer.jsx`](part25/aceapt-transfer.jsx) and [`part25/ACEAPT-TRANSFER-README.md`](part25/ACEAPT-TRANSFER-README.md).

### 26. ADAPT (`part26`)

ADAPT assembles a per-topic capability state, diagnoses the active bottleneck, generates candidate actions, scores priority, and returns either one next action or a multi-step plan fitted to the learner’s available minutes. Starting an action produces the relevant content; completion grades answers, applies an evidence update, recalculates capability, and immediately replans. Skips are logged but do not pretend to be evidence.

The frontend shows capability snapshot, evidence readout, next best action, adaptive plan, action player, time selector, and adaptation history. The store and item bank are deliberately small, auth is a header seam, and AI only rewrites explanation copy.

Primary evidence: [`part26/backend/src/engine`](part26/backend/src/engine), [`part26/backend/src/routes`](part26/backend/src/routes), [`part26/frontend/src/components`](part26/frontend/src/components), and [`part26/README.md`](part26/README.md).

### 27. FORECAST (`part27`)

FORECAST builds a capability model and evidence-confidence profile, compares it with a target, identifies practice-versus-assessment gaps, calculates trajectory and momentum, runs a readiness state machine, ranks risks, and produces a forecast range. Scenario analysis answers “what if” questions, while snapshot history and freshness-aware caching make change visible over time.

The API exposes readiness, forecast, trajectory, risks, history, scenarios, force-recalculation, a “fix my readiness” ADAPT handoff, and cohort forecasts. The UI provides readiness cards/profile, trajectory chart, forecast screen, and why panel. Real database, auth, event bus, and upstream evidence connections are clean interfaces with in-memory fixtures.

Primary evidence: [`part27/src/engines`](part27/src/engines), [`part27/src/services`](part27/src/services), [`part27/frontend`](part27/frontend), and [`part27/README.md`](part27/README.md).

### 28. PROOF (`part28`)

PROOF aggregates evidence by source and quality, applies readiness aging, identifies failure signatures, analyzes performance simulations, and selects the smallest targeted verification needed to resolve uncertainty. The verification engine records the result as new proof, recomputes readiness, and preserves a history suitable for before/after comparison.

The dashboard visualizes readiness, evidence stack and breakdown, pre-simulation context, verification runner/results, and proof history. Postgres and in-memory repositories are both represented; the production path includes row-level security and concurrency-safe writes. ADAPT/FORECAST and explanation providers are ports so proof decisions stay deterministic.

Primary evidence: [`part28/backend/src/domain`](part28/backend/src/domain), [`part28/backend/src/services/proofService.ts`](part28/backend/src/services/proofService.ts), [`part28/frontend/src/components`](part28/frontend/src/components), and [`part28/TRUTH_TABLE.md`](part28/TRUTH_TABLE.md).

### 29. ALIGN (`part29`)

ALIGN converts student evidence into capability DNA, evaluates a target’s requirements, calculates fit, readiness, and confidence separately, classifies gaps, prioritizes the gaps with the largest target impact, and assigns an alignment state. It can shortlist targets, show alignment history, surface insufficient-evidence conditions, and simulate how a proposed capability improvement changes fit.

The student UI includes dashboard, target cards/detail, capability match table, gap flow, priority list, what-if simulator, and explanation panels; a TPO overview contract is also present. Evidence, FORECAST, ADAPT, and PROOF are adapter seams, while the backend provides target profiles, repositories, signed dev auth, and an outbox.

Primary evidence: [`part29/backend/src/engine`](part29/backend/src/engine), [`part29/backend/src/services/alignmentService.ts`](part29/backend/src/services/alignmentService.ts), [`part29/frontend/src/components/align`](part29/frontend/src/components/align), and [`part29/README.md`](part29/README.md).

### 30. PATH (`part30`)

PATH translates an aligned target into a route. It models capability gaps, bottlenecks, milestones and their evidence, path modes, readiness, risks, projections, and next actions. Failure analysis can move a learner into recovery mode, while target switching regenerates the route without conflating evidence from different targets.

The dashboard presents target, focus, milestone route, readiness instruments, risk, secondary insights, and explicit empty/recovery states. A Postgres/RLS backend, event outbox, and explanation adapter support the engine. ALIGN, ADAPT, FORECAST, and PROOF are typed clients using standalone mocks until integrated.

Primary evidence: [`part30/backend/src/engine`](part30/backend/src/engine), [`part30/backend/src/integrations`](part30/backend/src/integrations), [`part30/frontend/src/components`](part30/frontend/src/components), and [`part30/README.md`](part30/README.md).

### 31. Readiness Simulator (`part31`)

Feature 31 runs target-specific, multi-stage real-world scenarios. It generates a blueprint, creates a server-timed attempt, validates each response, tracks stage progress, evaluates performance and failure points, converts results into evidence, recalculates readiness and forecast, and updates the learner’s PATH. Attempt comparison and trend history show whether repeated performance is improving.

The UI includes simulation catalog, scenario runner, timer, stage progress, failure-point timeline, readiness dial/matrix, next action, attempt comparison, and history trend. The repository is a local reference store with an explicit production swap-in seam; one demo student and limited free-response evaluation keep the scope prototype-sized.

Primary evidence: [`part31/src/lib/engines`](part31/src/lib/engines), [`part31/src/app/api`](part31/src/app/api), [`part31/src/components`](part31/src/components), and [`part31/README.md`](part31/README.md).

### 32. Readiness Radar (`part32`)

Readiness Radar maps a selected role to its required capabilities, merges assessment attempts into a capability state, evaluates confidence and trend, identifies role-specific gaps, and ranks priority actions. Learners can log new evidence, change the target role, complete or skip recommendations, and immediately see a refreshed radar and event history.

The UI provides role selection, capability-gap overview, assessment logging, and priority actions. A JSON repository and trusted student header are standalone substitutes for production persistence and authentication; explanation text is deterministic unless a future LLM adapter is connected.

Primary evidence: [`part32/backend/src/services`](part32/backend/src/services), [`part32/backend/src/routes/readinessRadar.ts`](part32/backend/src/routes/readinessRadar.ts), [`part32/frontend/src/components`](part32/frontend/src/components), and [`part32/README.md`](part32/README.md).

### 33. Opportunity-to-Action Engine (`part33`)

Feature 33 ingests manually entered opportunities, normalizes them, extracts requirements, recognizes duplicates, and applies deadline, eligibility, capability-match, and gap logic. It generates an apply/prepare/skip-style recommendation, builds the minimum-effective action plan, maintains a prioritized opportunity queue, and advances applications through a guarded state machine.

Outcome recording feeds a learning engine that detects strengths and bottlenecks across attempts. APIs expose opportunity detail, analysis, plans, application state, outcomes, history, and patterns. PATH, ADAPT, FORECAST, PROOF, and simulation connections are stubs, and storage is in memory in this reference build.

Primary evidence: [`part33/src/engines`](part33/src/engines), [`part33/src/services`](part33/src/services), [`part33/src/routes`](part33/src/routes), and [`part33/README.md`](part33/README.md).

### 34. Career Trajectory & Future Scenario Intelligence (`part34`)

Feature 34 models current career position against target roles, derives trajectory trends, builds future scenarios, and recommends the move or plan most likely to improve the trajectory. It exposes a career-movement view, timeline, scenario explorer, and plan view so the user can compare plausible paths instead of seeing one deterministic prediction.

The core trend, scenario, and recommendation calculations are deterministic; AI may produce narrative wording. Data and auth are standalone placeholders, so market feeds and upstream career evidence must be connected for production use.

Primary evidence: [`part34/backend/src/engine`](part34/backend/src/engine), [`part34/backend/src/routes/career.js`](part34/backend/src/routes/career.js), [`part34/frontend/src/components`](part34/frontend/src/components), and [`part34/ARCHITECTURE.md`](part34/ARCHITECTURE.md).

### 35. Career Conversion & Failure-Recovery Intelligence (`part35`)

This module records opportunity outcomes, the furthest application stage reached, supporting evidence, feedback, and known versus unknown facts. A conversion-funnel engine calculates stage rates and the active bottleneck; AI-assisted outcome analysis stays evidence bounded; recovery logic recommends one primary and at most two supporting actions. Recovery plans move from recommended to started to completed and can be reassessed.

The module also detects repeated uncorrected mistakes and builds a career-journey timeline. The frontend covers outcome entry/detail, funnel, recovery, and journey. Success-pattern and institutional dashboards are future work, and Feature 33/34 inputs are not integrated in this standalone implementation.

Primary evidence: [`part35/src/lib/engines`](part35/src/lib/engines), [`part35/src/app/api/career`](part35/src/app/api/career), [`part35/src/app/career`](part35/src/app/career), and [`part35/README.md`](part35/README.md).

### 36. Career Execution Intelligence (`part36`)

Feature 36 converts a career goal, capability gaps, and opportunities into executable actions. It compiles and prioritizes work, builds a plan and today view, adjusts recommendations to time available and time budgets, runs action sessions, records evidence, supports defer/block/complete transitions, and recalculates what should happen next. Momentum, plan health, blockers, commitments, weekly review, and an execution graph expose whether effort is producing movement.

The full-stack Next.js app includes registration/login, goal onboarding, today, plan, session, result, blocked-state, changed-plan, health, graph, opportunity, time-budget, and review screens. SQLite repositories and local capability/opportunity stand-ins make the module runnable; commitments are captured but are not yet included in automatic deadline-collision planning.

Primary evidence: [`part36/src/lib/services`](part36/src/lib/services), [`part36/src/app/api/career/execution`](part36/src/app/api/career/execution), [`part36/src/app`](part36/src/app), and [`part36/README.md`](part36/README.md).

### 37. Career Readiness Proof Engine (`part37`)

Feature 37 distinguishes claimed capabilities from demonstrated evidence. It classifies proof by strength and relevance, ages stale evidence, aggregates capability evidence, calculates readiness for a target or opportunity, creates preparation signals, and recommends the next proof needed to close a gap. This prevents profile claims, course completion, and real-world proof from being treated as equivalent.

The interface includes readiness hero, capability map, evidence ladder and detail, gap panel, next-proof card, opportunity readiness, and a journey timeline. The backend uses Drizzle/Postgres contracts, security middleware, and evidence-ingestion services; Features 33–36 are integration adapters in the standalone build.

Primary evidence: [`part37/backend/src/engine`](part37/backend/src/engine), [`part37/backend/src/services`](part37/backend/src/services), [`part37/frontend/src/components`](part37/frontend/src/components), and [`part37/README.md`](part37/README.md).

### 38. Personal Career Positioning Engine (`part38`)

Feature 38 selects the evidence most relevant to a role, ranks projects, identifies differentiators, checks consistency across the positioning narrative, detects six classes of positioning gap, and assembles a concise professional position, introduction, “why you fit” explanation, and best-project proof. The result is role-specific and evidence-backed rather than a generic branding paragraph.

The positioning engine and sub-engines are pure functions behind data-source and result-store interfaces, with caching and invalidation seams. The UI presents professional position, best project, fit reasoning, and gaps. Upstream evidence, auth, and persistence use in-memory/reference implementations.

Primary evidence: [`part38/backend/src/services`](part38/backend/src/services), [`part38/backend/src/types/integrationPorts.ts`](part38/backend/src/types/integrationPorts.ts), [`part38/frontend/src/components`](part38/frontend/src/components), and [`part38/README.md`](part38/README.md).

### 39. Intelligent Opportunity & Application Strategy (`part39`)

Feature 39 accepts manual or URL-based opportunity input, parses a job description, normalizes skill language, checks suspicious fee/financial/guarantee signals, measures capability and career-direction match, and ranks each opportunity as apply now, verify first, or lower priority. It generates claim-safe application material, manages an application workspace, schedules follow-ups, and reports application insights.

The frontend includes opportunities, opportunity detail, applications, application workspace, follow-ups, dashboard, and insights. AI parsing/content is optional and guarded by fallbacks and a safety checker. Rule-based extraction, token-based alignment, demo-header auth, and in-memory rate limiting are explicit limitations.

Primary evidence: [`part39/backend/src/services`](part39/backend/src/services), [`part39/backend/src/routes`](part39/backend/src/routes), [`part39/frontend/src/pages`](part39/frontend/src/pages), and [`part39/README.md`](part39/README.md).

### 40. Career Horizon—Future Career & Market Evolution Intelligence (`part40`)

Career Horizon analyzes role and skill trend data, assigns evidence confidence, models role evolution, identifies future capability gaps, recommends possible career paths, and simulates scenarios. Market briefs explain what is changing and why, while experiments and an action engine turn strategic uncertainty into small tests and executable work.

The backend includes Postgres row-level security, a durable outbox, content sanitization, confidence logic, market/brief/path/scenario/gap/experiment routes, and adapters for Features 34 and 36–39. The UI presents market, gaps, and path sections with explicit data states. AI writes narrative only; classifications and decisions remain deterministic.

Primary evidence: [`part40/src/services`](part40/src/services), [`part40/src/routes`](part40/src/routes), [`part40/frontend/src/components/CareerHorizon`](part40/frontend/src/components/CareerHorizon), and [`part40/README.md`](part40/README.md).

### 41. Adaptive Career Strategy Engine (`part41`)

Feature 41 creates a career command center by building a complete context, deriving strategy signals, checking constraints, detecting the current bottleneck, ranking the next best move, and evaluating strategy health and momentum. Guard engines detect drift, low-value work, and decisions that contradict the current strategy. Strategy versions, confirmation gates, timelines, reviews, actions, experiments, outcomes, recommendation feedback, and decision records make the strategy auditable and revisable.

The deterministic pipeline owns diagnosis and ranking; an optional Anthropic layer generates bounded narratives with schema and guarantee-language checks. The module supplies in-memory and Postgres repositories, an event bus, student isolation, validation, rate limiting, and a full command-center component set. Upstream Features 34–40 and real auth/database deployment are integration seams; advanced strategy simulation and hybrid/Plan-B generation are not built.

Primary evidence: [`part41/backend/src/engines`](part41/backend/src/engines), [`part41/backend/src/services`](part41/backend/src/services), [`part41/frontend/src/components`](part41/frontend/src/components), and [`part41/docs/COMPLETION_REPORT.md`](part41/docs/COMPLETION_REPORT.md).

### 42. Advanced Aptitude Diagnostic Engine (`part42`)

Feature 42 manages the complete diagnostic lifecycle—start, pause, resume, complete, abandon, and expire—and selects questions using coverage, uncertainty, difficulty fit, exposure, and question quality. It interprets fast/slow × correct/wrong response patterns, discounts hint-assisted or implausible evidence, estimates capabilities hierarchically with explicit uncertainty, detects confidence miscalibration, inconsistency, difficulty boundaries, bottlenecks, fatigue, and stopping conditions, and creates ranked next steps.

It also tracks question exposure, supports baseline-versus-reassessment comparison, supplies a conclusion/evidence/confidence explanation trace, and uses AI only to rephrase a final deterministic conclusion. The backend uses Fastify, Postgres, forced row-level security, security-definer writes, idempotency, and concurrency-safe session transitions. The result UI includes aptitude starting point, capability skyline, performance patterns, strengths/opportunities, next step, and why explanation. Real question-bank, mistake-intelligence, and prerequisite-graph systems remain ports.

Primary evidence: [`part42/src/engine`](part42/src/engine), [`part42/src/api`](part42/src/api), [`part42/frontend/components`](part42/frontend/components), and [`part42/TRUTH_TABLE.md`](part42/TRUTH_TABLE.md).

### 43. Adaptive Diagnostic Engine (`part43`)

Feature 43 uses an information-value candidate pipeline to decide what question will reduce uncertainty most. Its five adaptive modes are: explore an unmeasured skill, investigate an unresolved weak/speed/rushing/calibration signal, verify contradictory evidence, challenge an established upper boundary, and test transfer after familiar performance becomes strong. Coverage guardrails prevent the engine from over-focusing on one domain.

The engine updates capability and uncertainty after each response, tracks evidence quality and exposure, emits explainable signals, applies objective-aware stopping criteria, and creates final insights. Seeded repositories and deterministic ordering make tests reproducible. The frontend provides adaptive question, progress, and result components. Persistence/auth are reference implementations and the module does not duplicate a separate mistake-intelligence system.

Primary evidence: [`part43/src/engine`](part43/src/engine), [`part43/src/engine/AdaptiveDiagnosticEngine.ts`](part43/src/engine/AdaptiveDiagnosticEngine.ts), [`part43/frontend`](part43/frontend), and [`part43/README.md`](part43/README.md).

### 44. Goal-Based Learning Engine (`part44`)

Feature 44 accepts a structured or natural-language goal, resolves the target, checks feasibility, compares required versus current capabilities, ranks gaps, generates outcome-based milestones, and continuously evaluates progress and goal health from evidence. It stores snapshots and history events, supports pause/resume/recalculation, distinguishes student-marked completion from system-verified completion, and explicitly handles goals that are already achieved or too open-ended to forecast.

AI is limited to non-authoritative extraction and explanation; deterministic fallback always allows goal creation. The UI includes goal creation, dashboard, gap map, health badge, and milestones. Postgres migrations and repositories include row-level security. Learning, planner, and readiness handoffs are structured payloads awaiting real consumers, while current capability comes from a mock client.

Primary evidence: [`part44/src/engines`](part44/src/engines), [`part44/src/services`](part44/src/services), [`part44/frontend/src/components`](part44/frontend/src/components), and [`part44/README.md`](part44/README.md).

### 45. Aptitude Skill Graph (`part45`)

Feature 45 maintains two linked structures: a global, versioned graph of skills and typed relationships, and a personal graph of each student’s evidence-backed skill state. It validates cycles, duplicates, orphans, invalid references, and hierarchy; traverses prerequisites with bounded breadth-first search; identifies root-cause relationships; and scores high-leverage priorities from goal relevance, weakness, evidence strength, and graph structure. Unknown is stored as unknown, never silently converted to weak.

The graph lifecycle supports draft, review, validation, publication, archive, and simplified rollback. Admins can create/edit relationships and publish validated versions; student views include map, category drill-down, filters, relationship explanations, detail panels, and a mobile path. Event handlers materialize assessment evidence, cohort services aggregate tenant-scoped distributions, and caching/indexes support read performance. External evidence, mastery, retention, goals, and AI suggestions are adapters.

Primary evidence: [`part45/service/src/services`](part45/service/src/services), [`part45/service/src/events`](part45/service/src/events), [`part45/web/src/components`](part45/web/src/components), and [`part45/README.md`](part45/README.md).

### 46. Socratic Teaching Mode (`part46`)

Feature 46 starts with an explicit learning objective and uses purpose-tagged questions to classify each response and decide the next teaching move. It targets partial understanding without restarting, escalates through hint/explain/simplify/direct-explanation paths, tests misconceptions with a contradiction experiment, and controls the session through a deterministic state machine. Embedded teach-back, final teach-back, independent verification, and novel transfer verification require the learner to articulate and reuse the idea.

AI may generate bounded teaching language after policy decides the move; output validation and deterministic fallback protect the flow. Ownership checks, optimistic concurrency, analytics, completion summaries, and repository state support the API and web experience. Skill graph, diagnostics, goals, hint intelligence, mastery, learning path, and daily mission are interface-ready mocks.

Primary evidence: [`part46/src/domain`](part46/src/domain), [`part46/src/api`](part46/src/api), [`part46/public/app.js`](part46/public/app.js), and [`part46/README.md`](part46/README.md).

### 47. Guided Solving Engine (`part47`)

Feature 47 decomposes a problem into validated steps and records the learner’s state at each step. It supports numeric, algebraic, multiple-choice, unit, and structured-field validation; identifies the first substantive error; marks later mistakes as cascading rather than independent diagnoses; and calculates session outcomes from correctness, help, retry, and independence. Assistance classification and fading reduce support as performance stabilizes.

The session API supports start, current step, submit, retry, skip, guidance, explanation, show next step, full-solution reveal, reconstruction, completion, verification, feedback, summary, and abandonment. The UI provides a guided workspace, problem and step panels, answer inputs, feedback, help bar, solution path, full solution, and verification. Four curated problems exercise different validation types; persistence is JSON, auth is an explicit seam, and AI explanations have validated fallbacks.

Primary evidence: [`part47/backend/src/domain/engine`](part47/backend/src/domain/engine), [`part47/backend/src/services/guidedSolvingService.ts`](part47/backend/src/services/guidedSolvingService.ts), [`part47/frontend/src/components`](part47/frontend/src/components), and [`part47/README.md`](part47/README.md).

### 48. Hint Intelligence Engine (`part48`)

Feature 48 decides whether help should be offered and what the minimum sufficient hint should be. Its taxonomy supports eight progressive levels, current-step and dependency awareness, mistake-aware selection, de-escalation when prerequisite state improves, and escalation that changes strategy after a hint fails rather than merely adding more words. Validation blocks answer leakage and performs deterministic math/formula checks.

Assessment-mode restrictions are enforced at the API, while ownership, tenant checks, idempotency, stale-state handling, analytics, and outcome metrics support safe operation. AI generation is optional and deterministic hint content is the default fallback. Personal hint preference storage exists but does not yet alter style; real Feature 42/45/46/47/49 integrations remain stubs.

Primary evidence: [`part48/src/policy`](part48/src/policy), [`part48/src/generation/hintGenerator.ts`](part48/src/generation/hintGenerator.ts), [`part48/src/validation/hintValidator.ts`](part48/src/validation/hintValidator.ts), and [`part48/README.md`](part48/README.md).

### 49. Not present in the repository

There is no `part49` directory. Several other modules define a Feature 49 integration port—usually for novelty or related evidence—but no Feature 49 implementation is available in this codebase. No feature claim is made for it.

### 50. Speed Training Engine (`part50`)

Feature 50 computes an evidence-gated personal speed baseline by skill, difficulty, and novelty while separating independent from hint-assisted work. Its speed/accuracy frontier distinguishes fast-accurate, fast-inaccurate, slow-accurate, slow-inaccurate, and on-pace performance. Ten bottleneck detectors identify patterns such as rushing, hesitation, strategy delay, calculation delay, and guided-solving stage delay.

Training modes include fluency, recognition, strategy, calculation, and balanced work. A policy engine ramps time pressure gradually, applies accuracy guardrails and mastery gates, reduces pressure under collapse/fatigue, and supports pacing/placement simulations and decision training. Dashboards show meters, bottlenecks, history, summaries, targets, and feedback. Integration providers for difficulty, goals, graph, guided solving, hints, novelty, mastery, and readiness default safely to unknown until wired.

Primary evidence: [`part50/backend/src/core`](part50/backend/src/core), [`part50/backend/src/services`](part50/backend/src/services), [`part50/frontend/src/components`](part50/frontend/src/components), and [`part50/IMPLEMENTATION_REPORT.md`](part50/IMPLEMENTATION_REPORT.md).

### 51. Accuracy Training Engine (`part51`)

Feature 51 builds an accuracy profile and stability view from attempt history, classifies error patterns as isolated, recurring, clustered, resolved, or regressed, and maps each error type to a deterministic intervention. The policy engine selects among ten precision-training modes, including foundation, interpretation, strategy, formula, calculation, verification, novel, pressure, self-correction, and mixed precision.

Self-correction includes reasonableness checks, first-error spotting, and correction-category choice, all graded deterministically. The dashboard presents calibration, recurring patterns, training sessions, error spotting, and self-correction. Postgres roles, row-level security, repositories, a session state machine, analytics, and an outbox protect and distribute accuracy signals. Features 42–50, mastery, and retention are integration ports rather than verified live connections.

Primary evidence: [`part51/src/domain`](part51/src/domain), [`part51/src/policy`](part51/src/policy), [`part51/src/services`](part51/src/services), [`part51/frontend/components`](part51/frontend/components), and [`part51/POST_IMPLEMENTATION_REPORT.md`](part51/POST_IMPLEMENTATION_REPORT.md).

### 52. Not present in the repository

There is no `part52` directory. Other features reference Feature 52 through extension ports, but there is no implementation to summarize.

### 53. Question Quality Engine (`part53`)

Feature 53 protects question consumers through a staged validation pipeline covering schema, answer, solution, independent math recomputation, skill alignment, difficulty, similarity, clarity, distractor quality, fairness, and accessibility. Its math solver supports percentages, ratios, simple interest, averages, probability, and custom expressions without `eval()`. Pool analytics detect answer-position and diversity issues.

The lifecycle supports draft/review/approval/publication/suspension, immutable versions, triaged quality reports, reviewer overrides with reasons, and mode-specific eligibility. RBAC, tenant isolation, content sanitization, prompt-injection separation, telemetry, and AI-validation fallback support safe administration. Database, real skill graph, and semantic similarity are replaceable ports; multimodal validation is not built.

Primary evidence: [`part53/src/validators`](part53/src/validators), [`part53/src/services`](part53/src/services), [`part53/src/security`](part53/src/security), and [`part53/README.md`](part53/README.md).

### 54. Not present in the repository

There is no `part54` directory. Feature 56 and other modules mention Feature 54 as a future integration, but no code is present here.

### 55. Not present in the repository

There is no `part55` directory. References to Feature 55 are contracts only; no implementation is available in this codebase.

### 56. Formula Intelligence Engine (`part56`)

Feature 56 maintains canonical formulas, variables, conditions, non-applicability rules, versions, inverse/derived forms, and typed relationships/confusion pairs. Derived forms are numerically checked against the canonical form. It tracks per-student competency across recognition, recall, selection, variable mapping, application, verification, transfer, and retention, with minimum evidence before assigning a strong or needs-attention label.

The error classifier reports the first formula-specific failure rather than every symptom, the confusion detector derives recurring mix-ups from attempts, and the bottleneck/policy engines choose the next activity along the eight-stage progression. Guidance fades as independence grows, and assessment-mode locks and role-gated routes prevent inappropriate coaching. The seed covers three formula families; real auth, dimensional-unit validation, question authoring, tenant isolation, mastery handoff, and retention scheduling remain integration work.

Primary evidence: [`part56/src/registry`](part56/src/registry), [`part56/src/training`](part56/src/training), [`part56/src/errors`](part56/src/errors), [`part56/src/confusion`](part56/src/confusion), and [`part56/README.md`](part56/README.md).

### 57. Personal Shortcut Library (`part57`)

Feature 57 lets a student create and own shortcuts, record examples and applicability conditions, validate the method, and organize a personal library. A discovery service can infer shortcut candidates from successful patterns; recommendation logic chooses a relevant shortcut for a question context; applicability and trust prevent unverified or inappropriate shortcuts from being promoted; and performance/regression services measure whether the shortcut remains accurate and useful.

Training sessions reuse stored examples and track shortcut usage, success, confidence, and student state. The UI includes add form, discovery banner, library rows/detail, identity and mode switching, recommendation playground, and training center. APIs cover shortcuts, discoveries, recommendations, usage, training, and admin work. JWT authentication, tenant/ownership scoping, Zod validation, prompt-injection separation, and repositories support the feature. Autonomous discovery, multimodal input, and cohort tooling remain future work.

Primary evidence: [`part57/backend/src/services`](part57/backend/src/services), [`part57/backend/src/api/routes`](part57/backend/src/api/routes), [`part57/frontend/src/components`](part57/frontend/src/components), and [`part57/README.md`](part57/README.md).

## Cross-cutting platform capabilities

These capabilities appear across many numbered modules and are part of the product even though they are not separate `partN` directories.

| Platform capability | Codebase-wide behavior |
|---|---|
| Deterministic decision core | Capability estimates, grading, state transitions, priority, readiness, risk, bottlenecks, stopping rules, and safety gates are generally implemented as explicit functions. AI is not allowed to silently decide correctness or mastery. |
| Bounded AI with fallback | Anthropic or Groq adapters generate explanations, summaries, teaching language, or content variants. Missing keys, timeouts, malformed output, or failed validation fall back to deterministic templates so core flows remain usable. |
| Evidence, confidence, and uncertainty | Engines track evidence count, recency, novelty, independence, difficulty, consistency, and confidence. Sparse data is represented as unknown/insufficient evidence rather than a zero score. |
| Explainability | “Why this?”, evidence traces, confidence notes, alternatives, blockers, and reason strings accompany recommendations throughout diagnostic, learning, readiness, and career modules. |
| Closed-loop adaptation | Many modules implement the same safe pattern: observe evidence → diagnose → choose an action → execute → measure outcome → update state → replan. |
| Event and outbox architecture | Event buses, analytics records, signal types, and durable or in-memory outboxes decouple engines from downstream consumers and preserve a history of important transitions. |
| Repository abstraction | Most modules isolate persistence behind repository/data-source interfaces, allowing an in-memory or JSON demo store to be replaced by SQLite/Postgres without changing core engine logic. |
| Authentication and authorization seams | Implementations range from dev headers and anonymous sessions to JWT, role checks, ownership enforcement, tenant isolation, and Postgres RLS. Each module’s detailed section identifies whether security is production-grade or a stand-in. |
| Server-authoritative assessment behavior | Mature diagnostic/simulation modules keep answer keys, scoring, timing, expiry, idempotency, and state transitions on the server instead of trusting browser values. |
| Input/content validation | Zod schemas, domain validators, output contracts, sanitization, answer-leak checks, question-quality gates, and safe math evaluators guard user input and generated content. |
| Anti-memorization and novelty | Question exposure, variation, familiar-versus-novel contexts, transfer tests, and independence discounts prevent repeated exposure from masquerading as capability. |
| History and before/after evidence | Snapshots, timelines, attempt comparison, forecast history, mastery history, proof history, intervention outcome, and journey events make change visible rather than replacing the prior state. |
| Responsive and accessible presentation | Components commonly include semantic labels, focus states, non-color status text, reduced-motion handling, mobile layouts, loading/error/empty states, and calm evidence-led visuals. Coverage varies by standalone module and is not equivalent to a full device or screen-reader audit. |
| Testing and demo fixtures | The repository contains 274 test files plus seed data, demo scenarios, smoke scripts, and walkthroughs covering engine boundaries, state transitions, security, idempotency, concurrency, fallbacks, and representative learner archetypes. Test claims in README files were recorded as repository claims unless independently executed for this document. |
| Configuration and secret hygiene | `.env.example` files expose expected configuration while most modules operate in a safe reduced mode when external keys or URLs are blank. Actual `.env` values are intentionally not reproduced here. |

## Implementation reality and integration status

The codebase is a collection of independently runnable/reference feature modules rather than one already unified deployment. That distinction matters when presenting the product:

- Features 1–14 and 16–57 frequently implement complete internal engines and user experiences, but many cross-feature calls use adapters, fixtures, or event contracts instead of live service-to-service integration.
- Features 15, 18, 23, and 25 are primarily self-contained React prototypes. Their deterministic interaction logic is demonstrable, but several persistence and downstream-update panels are simulated.
- Persistence varies by feature: in-memory maps, JSON files, browser storage, SQLite, Prisma schemas, Drizzle, and direct Postgres repositories all appear. A production product would consolidate these behind a shared data platform.
- Authentication varies from anonymous cookies or trusted development headers to JWT/role/tenant checks and database row-level security. Development auth seams must be replaced before production deployment.
- AI success paths are often present but depend on blank external credentials. The code is intentionally designed so deterministic behavior and fallback copy continue without those credentials.
- Several READMEs describe the feature as standalone because no prior repository was available when that part was authored. In the current workspace the parts coexist, but coexistence does not itself mean their adapters are wired together.

## Audit coverage by module

The counts below show the physical text/source lines read during the audit. “Files” includes authored code, tests, schemas, styles, and documentation. “Code/schema” includes TypeScript, TSX, JavaScript, JSX, MJS, Python, SQL, and Prisma. “Tests” is a subset of code/schema files, not an additional count.

| Module | Files | Code/schema | Test files | Physical lines | Test lines |
|---|---:|---:|---:|---:|---:|
| part1 | 35 | 32 | 3 | 4,089 | 266 |
| part2 | 48 | 46 | 6 | 6,051 | 534 |
| part3 | 37 | 34 | 7 | 2,921 | 463 |
| part4 | 50 | 48 | 11 | 4,936 | 1,069 |
| part5 | 81 | 77 | 9 | 7,084 | 972 |
| part6 | 62 | 58 | 2 | 6,888 | 220 |
| part7 | 36 | 32 | 0 | 3,433 | 0 |
| part8 | 83 | 79 | 4 | 6,793 | 529 |
| part9 | 65 | 61 | 8 | 4,861 | 564 |
| part10 | 33 | 32 | 4 | 3,446 | 384 |
| part11 | 58 | 54 | 7 | 3,923 | 526 |
| part12 | 45 | 41 | 5 | 3,351 | 276 |
| part13 | 65 | 62 | 8 | 7,446 | 777 |
| part14 | 39 | 35 | 1 | 4,041 | 195 |
| part15 | 1 | 1 | 0 | 776 | 0 |
| part16 | 59 | 56 | 2 | 4,839 | 221 |
| part17 | 30 | 26 | 1 | 3,030 | 205 |
| part18 | 2 | 1 | 0 | 1,380 | 0 |
| part19 | 26 | 24 | 0 | 3,111 | 0 |
| part20 | 49 | 46 | 6 | 4,592 | 538 |
| part21 | 18 | 17 | 0 | 3,820 | 0 |
| part22 | 12 | 11 | 0 | 1,995 | 0 |
| part23 | 1 | 1 | 0 | 1,059 | 0 |
| part24 | 34 | 31 | 4 | 3,453 | 501 |
| part25 | 2 | 1 | 0 | 1,694 | 0 |
| part26 | 47 | 44 | 5 | 4,018 | 437 |
| part27 | 50 | 47 | 9 | 4,886 | 706 |
| part28 | 49 | 46 | 9 | 5,008 | 961 |
| part29 | 73 | 68 | 10 | 6,164 | 719 |
| part30 | 69 | 66 | 14 | 6,010 | 829 |
| part31 | 58 | 56 | 0 | 4,342 | 0 |
| part32 | 33 | 30 | 3 | 2,696 | 288 |
| part33 | 40 | 37 | 1 | 3,101 | 115 |
| part34 | 25 | 19 | 0 | 2,989 | 0 |
| part35 | 54 | 52 | 1 | 4,313 | 214 |
| part36 | 79 | 76 | 0 | 6,430 | 0 |
| part37 | 52 | 48 | 4 | 4,368 | 320 |
| part38 | 35 | 32 | 2 | 2,344 | 131 |
| part39 | 44 | 41 | 1 | 4,501 | 114 |
| part40 | 70 | 67 | 8 | 5,315 | 483 |
| part41 | 54 | 49 | 5 | 5,648 | 334 |
| part42 | 62 | 59 | 9 | 6,260 | 1,299 |
| part43 | 42 | 39 | 12 | 4,088 | 813 |
| part44 | 68 | 63 | 14 | 6,625 | 1,230 |
| part45 | 75 | 70 | 7 | 5,228 | 534 |
| part46 | 32 | 29 | 6 | 4,052 | 547 |
| part47 | 100 | 83 | 13 | 7,190 | 770 |
| part48 | 21 | 19 | 6 | 3,576 | 425 |
| part50 | 57 | 52 | 9 | 5,654 | 832 |
| part51 | 63 | 59 | 9 | 5,724 | 723 |
| part53 | 53 | 51 | 13 | 5,367 | 1,196 |
| part56 | 29 | 27 | 7 | 3,154 | 654 |
| part57 | 79 | 73 | 9 | 5,951 | 694 |
| **Total** | **2,484** | **2,308** | **274** | **234,014** | **23,608** |

## Recommended end-to-end demonstration narrative

The strongest complete product story is not to demo every module independently. Demonstrate the closed loop:

1. Onboard a learner and capture the target, time, and constraints (Feature 1).
2. Establish a capability baseline with adaptive diagnostic evidence (Features 2, 42, or 43).
3. Show skill intelligence, root causes, and the graph behind them (Features 3 and 45).
4. Turn the diagnosis into a goal, path, and daily next action (Features 44, 4/15, and 26).
5. Demonstrate adaptive practice, guided solving, hints, Socratic teaching, formula/speed/accuracy training, or a targeted intervention depending on the diagnosed bottleneck (Features 5, 12, 16, 46–48, 50–51, and 56–57).
6. Verify mastery, transfer, retention, and realistic pressure performance (Features 8, 19, 24–25, 6, 9, 20, 23, 28, and 31).
7. Show before-versus-after evidence, readiness, forecast, and replanning (Features 10, 13, 27, and 32).
8. Connect improved capability to a career target, opportunity, application, proof, positioning, execution, horizon, and strategy (Features 29–41).

This sequence demonstrates ACEAPT’s defining capability: it does not stop at content, testing, or recommendation. It maintains an explainable evidence loop from personal goal to diagnosis, learning action, verified capability, readiness, and real-world career execution.

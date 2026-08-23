# 06 — BUSINESS, PRODUCT & DESIGN ROLES — Question-Template Library
Families: business_product, design · Depts: any (+ mba/commerce/bba/design)

> Case- and communication-heavy (rubric problem_solving + communication weighted). AI literacy is now
> expected across product roles.

---

## Product Manager
Family business_product · Depts any (+ mba) · Hires product/general · Seniority fresher→ (APM)
Owns product direction; 3 pillars — product sense, execution, leadership — plus AI product sense.

### TECH STACK / KNOWLEDGE
- **Core (5):** **product sense** (user empathy, problem identification, design/improve a product, prioritization) · **execution/analytical** (metrics — DAU/MAU/retention/funnel/conversion/LTV; the **conflicting-metric trade-off**; A/B testing; prioritization frameworks — RICE/MoSCoW) · **product strategy** (market, competition, positioning, GTM) · **leadership/behavioral** (influence without authority, stakeholder mgmt, conflict) · **AI literacy** (LLM basics, hallucinations, prompt engineering, RAG, eval metrics, responsible AI, rules-vs-ML-vs-LLM)
- **Core (3):** basic technical fluency (APIs, databases, system concepts) · data/SQL basics · UX fundamentals
- **Tools (3):** analytics (Amplitude/Mixpanel/GA) · SQL basics · roadmapping (Jira/Productboard) · Figma basics
- **Emerging (2):** **AI product sense** (should-we-use-a-model; eval/cost/latency trade-offs; live prototyping) · growth · experimentation platforms

### ROUND STRUCTURE
1. Product sense — 45–60 min · 2. Execution/analytical (metrics + A/B) — 45–60 min · 3. AI product sense (frontier teams) — 45 min · 4. Strategy — 45 min · 5. Behavioral/leadership — 30–45 min

### ASKABLE QUESTIONS (by topic)
- **Product sense:** `[E]` what's a product you love and why; improve <a common product>. `[M]` **design a product/feature for <user segment>** (clarify → user → pain → solutions → prioritize → metrics → risks); "design X for the blind / for kids / for India"; favorite product + the one decision that made it work. `[H]` design a new product line; enter a new market; 0→1 with heavy ambiguity.
- **Execution/analytical:** `[E]` what metric would you track for <feature>. `[M]` **"metric X is up but metric Y is down — what do you do"** (conflicting-metric trade-off); "engagement up, revenue flat — diagnose"; define success metrics + guardrails; prioritize a backlog (RICE). `[H]` funnel drop diagnosis; north-star selection; measure a hard-to-measure feature; goal-setting.
- **Product strategy:** `[M]` "you're CPO of <company> facing <competitor> — what do you do"; build vs buy vs partner; positioning. `[H]` respond to a disruptive entrant; platform strategy; pricing.
- **AI product sense:** `[M]` **"should this feature use AI at all — rules vs classic ML vs LLM?"**; design an AI feature (where the model adds value vs risk); how would you handle hallucinations for a user-facing feature. `[H]` "double <AI product> engagement with 3 engineers"; eval/cost/latency/RAG trade-offs; ship-it-now despite model errors; a stakeholder wants to "add AI" to a fine feature — handle it.
- **Behavioral:** influence without authority; disagreement with engineering/design; a launch that failed; prioritization under pressure; why product / why this company.

### COMMON FOLLOW-UPS
Who's the user; what's the metric; how do you know it worked; what's the trade-off; what would you cut; how does the model fail and what then; what's your thesis.

### STRONG vs WEAK
**Strong:** structures ambiguity, defines metrics, reasons trade-offs (quality/cost/speed), pushes back on premises, answers AI questions in numbers + scars (hallucination rate, eval, the incident and the fix). **Weak:** recites frameworks, no metric/trade-off reasoning, "AI-washed" (adjectives not numbers), can't handle ambiguity.

### RED FLAGS
Framework-dumping without judgment; every problem "a prompt away"; no metrics; can't say when NOT to use AI.

---

## Product Analyst
Family business_product/data_ai · Depts aids/cse/mba · Hires product/analytics/general · Seniority fresher→
Data-informed product decisions; SQL + product sense. (See also `02_data_and_ai.md` for the SQL-heavy view.)

### FOCUS + ASKABLE QUESTIONS
- **Stack:** SQL (heavy) · product metrics · A/B testing · data viz (Tableau/Power BI) · product sense · Excel · stats basics.
- **Rounds:** SQL technical → product/metrics case → A/B + PM 1:1 → behavioral.
- **SQL:** (see Data Analyst bank — `[M]/[H]` joins, windows, funnels, retention, cohorts).
- **Product/metrics:** `[M]` define success for <feature>; "comments/user down while users grow MoM — worry?"; measure launch impact; guardrail vs primary metrics. `[H]` conflicting metrics; anomaly root-cause; north-star.
- **A/B:** `[M]` design an experiment (hypothesis/metric/sample/duration); is it significant; p-value pitfalls. `[H]` novelty/network effects; ship/no-ship.
- **Strong vs weak:** strong SQL + product judgment + clear recommendations. Weak = SQL-only or opinion-only. Red flag: weak SQL; no experimentation; can't turn data into a decision.

---

## Business Analyst
Family business_product · Depts any (+ mba/commerce) · Hires service/analytics/general · Seniority fresher→
Bridges business needs and technical solutions.

### TECH STACK / KNOWLEDGE
- **Core (5):** **requirement gathering & analysis** (elicitation, stakeholder interviews, functional vs non-functional) · **documentation** (BRD/FRD/SRS, **use cases, user stories, acceptance criteria**) · **process modeling** (flowcharts, BPMN, as-is/to-be, gap analysis) · **SQL & data analysis** basics · **Agile/Scrum** (backlog, sprints, roles)
- **Core (3):** wireframing/prototyping (Balsamiq/Figma) · Excel · stakeholder management
- **Tools (3):** JIRA/Confluence · SQL · Excel · Visio/Lucidchart
- **Emerging (2):** analytics/BI basics · low-code · AI literacy

### ROUND STRUCTURE
1. Case / requirement scenario — 45 min · 2. Analytical (SQL/Excel/process) — 30 min · 3. Behavioral/stakeholder — 30 min

### ASKABLE QUESTIONS (by topic)
- **Requirements:** `[E]` functional vs non-functional; what is a use case/user story. `[M]` how do you gather requirements from stakeholders; write a user story + acceptance criteria for <feature>; handle conflicting requirements; MoSCoW prioritization. `[H]` elicit requirements for an ambiguous project; manage scope creep.
- **Process/gap:** `[M]` map an as-is process and propose to-be; gap analysis; draw a flow for <business process>. `[H]` recommend a process improvement with trade-offs.
- **Analytical:** `[M]` SQL basics to pull data; Excel analysis; interpret a metric. `[H]` build a small analysis to support a decision.
- **Behavioral:** stakeholder conflict; a project where requirements changed; communicating with technical + business teams.

### COMMON FOLLOW-UPS
How do you resolve conflicting needs; how do you prioritize; how do you validate the requirement; how do you communicate to devs vs execs.

### STRONG vs WEAK
**Strong:** structured elicitation, clear documentation, connects business to tech, manages stakeholders. **Weak:** vague requirements, no prioritization, poor documentation.

### RED FLAGS
Can't write a clear user story; no stakeholder-management sense; jumps to solutions before requirements.

---

## Consultant (Management / Technology / Analytics)
Family business_product · Depts any (+ mba/commerce) · Hires service/analytics/general · Seniority fresher→
Solves client problems across domains; case-driven.

### TECH STACK / KNOWLEDGE
- **Core (5):** **case-solving frameworks** (profitability, market entry, market sizing, M&A, pricing; issue trees, MECE) · **market sizing / guesstimates** (top-down & bottom-up) · **business acumen** (P&L, margins, unit economics, revenue = price × volume) · **structured communication** (top-down, hypothesis-led, storyboarding) · **analytical thinking** (data interpretation, Excel)
- **Core (3):** GD/teamwork · presentation · industry awareness
- **Tools (3):** Excel · PowerPoint · basic analytics
- **Emerging (2):** digital/AI transformation awareness · data-driven consulting

### ROUND STRUCTURE
1. Case interview (problem-solving) — 45 min · 2. Guesstimate + business math — 30 min · 3. Group discussion — 20 min · 4. Behavioral/fit — 30 min

### ASKABLE QUESTIONS (by topic)
- **Case:** `[M]` "our client's profits are declining — why and what do you do" (profitability: revenue − cost tree); "should our client enter <market>"; "a retailer's sales are down"; structure with issue trees + MECE. `[H]` M&A rationale; pricing strategy; declining-market turnaround; new-product go/no-go.
- **Market sizing/guesstimate:** `[E]` "how many <items> are sold in <city> per day" (structure assumptions). `[M]` market size for <product> in India; number of <X> — top-down vs bottom-up; sanity-check the estimate. `[H]` a multi-step estimation with layered assumptions.
- **Business math:** `[M]` break-even; margin/markup; ROI; payback. `[H]` unit economics of a business model.
- **GD/behavioral:** contribute to a group case; why consulting; a leadership example; handling ambiguity.

### COMMON FOLLOW-UPS
What's your structure; what are your assumptions; sanity-check that number; what's your recommendation + why; what data would you want.

### STRONG vs WEAK
**Strong:** MECE structure, hypothesis-led, states + sanity-checks assumptions, clear recommendation, calm under probing. **Weak:** unstructured, no framework, wild un-sanity-checked numbers, no recommendation.

### RED FLAGS
No structure; math errors without noticing; can't state assumptions; jumps to answers.

---

## Operations Analyst / Management Trainee
Family business_product · Depts any · Hires general/service/core · Seniority fresher→
Improves processes / rotational grooming for management.

### FOCUS + ASKABLE QUESTIONS
- **Operations Analyst** — stack: process analysis, Excel/SQL, Lean/Six Sigma basics, KPIs, RCA, data analysis, coordination.
  - `[M]` improve an inefficient process; RCA (5-why/fishbone); which KPIs to track; Excel/SQL analysis; "orders are delayed — investigate". `[H]` design a process-improvement with metrics; capacity/bottleneck analysis.
- **Management Trainee** — stack: leadership basics, business acumen, communication, teamwork, adaptability, decision-making, presentation.
  - `[E]` why this company/role; a leadership example. `[M]` situational judgment (team conflict, tight deadline, ambiguous task); GD; a business scenario. `[H]` a strategy/decision case; handling a crisis.

### COMMON FOLLOW-UPS / STRONG vs WEAK / RED FLAGS
Follow-ups: how would you find the root cause; how do you prioritize; how do you lead/decide here. Strong = structured, data + people sense, decisive. Weak = vague, no method. Red flag: no RCA/decision structure; can't handle ambiguity.

---

## UX / Product Designer
Family design · Depts design/cse/any · Hires product/general · Seniority fresher→
Designs user experiences and interfaces.

### TECH STACK / KNOWLEDGE
- **Core (5):** **design fundamentals** (visual hierarchy, typography, color, layout, grids, gestalt) · **UX process** (research → personas → user flows → wireframes → prototypes → usability testing → iterate) · **interaction design** (patterns, states, micro-interactions, accessibility) · **user research** (methods — interviews/surveys/usability tests, synthesis) · **design tools** (Figma, prototyping)
- **Core (3):** design systems/components · information architecture · heuristics (Nielsen)
- **Tools (3):** Figma · prototyping (Figma/ProtoPie) · research/whiteboard tools
- **Emerging (2):** AI in design · design ops · motion/interaction · accessibility (WCAG)

### ROUND STRUCTURE
1. Portfolio review — 45 min · 2. Design exercise / whiteboard challenge — 45–60 min · 3. Design critique — 30 min · 4. Behavioral/collaboration — 30 min

### ASKABLE QUESTIONS (by topic)
- **Portfolio:** `[E]` walk me through a project. `[M]` your role, the problem, the process, the trade-offs, the outcome/metrics; a decision you'd change. `[H]` defend a controversial design decision; how you measured success.
- **Design exercise:** `[M]` **"design an app/feature for <problem/user>"** (clarify → users → flows → wireframe → rationale); redesign a flawed screen; improve <a common app>. `[H]` design under constraints (accessibility, one-handed, low-literacy); a complex flow.
- **Critique:** `[M]` critique this UI (heuristics, hierarchy, usability); what would you change and why. `[H]` trade-offs between aesthetics, usability, and business goals.
- **Fundamentals/process:** `[E]` what is UX vs UI; what is a wireframe vs prototype. `[M]` your design process; how do you do user research; accessibility basics; Nielsen heuristics. `[H]` design system thinking; measuring UX.
- **Behavioral:** working with PMs/engineers; handling design feedback; a project that failed.

### COMMON FOLLOW-UPS
Who's the user; why this choice; what did you test; how do you measure success; accessibility implications; how did you handle pushback.

### STRONG vs WEAK
**Strong:** user-centered reasoning, clear process, defends decisions with rationale + evidence, collaborative. **Weak:** aesthetics-only, no process/research, can't justify decisions, ignores accessibility.

### RED FLAGS
No user research; "it looks nice" without rationale; ignores accessibility/usability; can't take critique.

---
*End of the per-role question-template library. Long-tail/emerging roles inherit their family's template
here until promoted to a full per-role template.*

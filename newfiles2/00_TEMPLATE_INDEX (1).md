# PrepVista Feature #02 — PER-ROLE QUESTION-TEMPLATE LIBRARY
## Detailed tech stack + askable-question bank for every role

> **What this is.** For each role: its **detailed tech stack** (core topics → subtopics, tools, emerging),
> its **round structure**, and its **askable-question bank** — the specific question *themes* an interviewer
> (and the PrepVista simulator) can ask, organized by topic and tagged by difficulty. This is the content
> foundation the `role_blueprint.skill_stack` and the question generators draw from. The LLM generates the
> *actual* question text at runtime from these themes (grounded + dedup'd), so the bank is a **generative
> template**, not a fixed Q&A list (which keeps sessions fresh and non-repeating).
>
> **Difficulty tags:** `[E]` easy/fundamentals · `[M]` medium/applied · `[H]` hard/senior-stretch.
> **Freshness:** stacks are current (2024–26) and stored as editable config with a `last_verified` stamp.

### How the simulator uses a role template
1. Pick the role's `round_structure`. 2. For each round, select topics from the role's tech stack,
weighted (higher-weight topics appear more/harder). 3. For each selected topic, pull an askable-question
theme at the target difficulty and have the LLM generate a concrete question from it. 4. Grade with the
role rubric; follow up using the "common follow-ups". 5. Feed per-skill results to the Role-Readiness
resolver.

### Per-role template structure (identical for every role)
```
### <Role Name>
Family · Departments · Hires (company types) · Seniority
One-liner.

TECH STACK
- Core (weight): topic → subtopics
- Tools/Frameworks (weight)
- Emerging / Differentiators (weight)

ROUND STRUCTURE
n. Round — focus — minutes

ASKABLE QUESTIONS (by topic, difficulty-tagged)
<Topic>: [E]/[M]/[H] question themes...

COMMON FOLLOW-UPS
STRONG vs WEAK
RED FLAGS
```

### Files in this library (19 files, ~120 roles across every department)
**Flagship (Tier-A) families:**
- `01_software_engineering.md` — SDE, Backend, Frontend, Full-Stack, Mobile, SDET, Solutions Architect
- `02_data_and_ai.md` — Data Scientist, Data Analyst, Data Engineer, ML Engineer, AI/GenAI Engineer, BI/Product Analyst
- `03_infra_quality_security.md` — DevOps, Cloud, SRE, QA/Test, Security Analyst/SOC, Security Engineer/Pen-tester
- `04_core_electronics_electrical.md` — Embedded, VLSI (design/verif/PD), Electronics, Electrical, Power Systems, Control, Instrumentation
- `05_mechanical_civil.md` — Mechanical Design, Production, Quality, Maintenance; Civil, Structural, Site, Project
- `06_business_product_design.md` — Product Manager, Product Analyst, Business Analyst, Consultant, Operations Analyst/Mgmt Trainee, UX Designer

**Specialized / long-tail / emerging (Tier-B) families:**
- `07_software_specialized.md` — Game, AR/VR, Blockchain, API, Graphics/Rendering, Systems/Low-Level
- `08_data_ai_specialized.md` — NLP, Computer Vision, MLOps, Analytics Consultant, Decision Scientist, Research Analyst, Big Data/Analytics/Data Architect
- `09_infra_network_specialized.md` — Platform, Systems Admin, DBA, Network, Release/Build, Observability, App/Cloud Security, IAM, GRC, Incident-Response, Malware
- `10_electronics_specialized.md` — RF, DSP, Hardware Design, PCB, FPGA, Analog/Mixed-Signal, Automotive Embedded, Hardware Test/Validation
- `11_electrical_specialized.md` — Power Electronics, Protection & Switchgear, Substation, PLC/SCADA/Automation, Electrical Design, Renewable, EV Powertrain, Testing & Commissioning
- `12_mechanical_specialized.md` — CAD/CAE, Thermal, HVAC, Automotive, Aerospace, Robotics/Mechatronics, Industrial/Supply-Chain, Piping, Product Design
- `13_civil_specialized.md` — Geotechnical, Transportation, Environmental, Water Resources, Surveying, Estimation/QS, BIM, Planning, Bridge, Urban Planner, Construction Manager
- `14_chemical_allied.md` — Chemical/Process, Petrochemical, QA-QC, Biotech, Biomedical, Metallurgical/Materials, HSE, Pharma Production
- `15_business_specialized.md` — TPM, Program/Project Manager, Strategy Analyst, Growth/Marketing Analyst, BD Associate, Category/Ops, Supply-Chain, Customer Success, Process Consultant
- `16_finance_tech.md` — Quant Analyst, Quant Developer, Risk Analyst, Financial/IB Analyst, Actuarial, Credit, FinTech Product Analyst
- `17_design_specialized.md` — UI Designer, Interaction Designer, UX Researcher, Graphic/Visual/Motion Designer
- `18_sales_writing_support.md` — Sales/Solution/Pre-Sales Engineer, TAM/CS Engineer, FAE, Implementation, Technical Writer, DevRel, Tech/App Support, IT Consultant, HR Analytics, SEO/Content

> **Coverage note.** Every department and every role family now has full-depth templates. Any brand-new
> or hyper-niche role inherits its **family template** (structure + rubric + core skills) so there are
> **no dead-ends**; it can be promoted to its own dedicated template on demand.

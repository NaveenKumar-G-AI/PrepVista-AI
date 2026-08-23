# 05 — CORE: MECHANICAL & CIVIL ROLES — Question-Template Library
Families: mechanical, civil · Depts: mech/civil

> Domain-fundamentals heavy (rubric technical_depth ~0.45). Huge campus populations that mock-interview
> tools almost entirely ignore — a differentiator.

---

## Mechanical Design Engineer
Family mechanical · Depts mech · Hires core/product/general · Seniority fresher→
Designs mechanical components and systems; CAD + mechanics + design.

### TECH STACK
- **Core (5):** **Strength of materials** (stress/strain, bending, torsion, shear, Mohr's circle, factor of safety, beams, columns/buckling) · **CAD** (SolidWorks/CATIA/Creo/AutoCAD; part/assembly/drawing, GD&T) · **theory of machines / machine design** (gears, bearings, shafts, couplings, mechanisms, fatigue) · **engineering drawing & GD&T** (tolerances, fits, projections) · **material science** (properties, heat treatment, selection)
- **Core (4):** thermodynamics · fluid mechanics · engineering mechanics (statics/dynamics) · manufacturing processes (casting/welding/machining/forming)
- **Tools (3):** SolidWorks/CATIA · FEA basics (ANSYS) · AutoCAD · GD&T
- **Emerging (2):** CAE/simulation · DFM/DFA · additive manufacturing · lightweighting

### ROUND STRUCTURE
1. Aptitude/technical — 30 min · 2. SOM + machine design + CAD — 45 min · 3. Thermo/FM/manufacturing — 30 min · 4. Project deep-dive — 20 min · 5. HR — 20 min

### ASKABLE QUESTIONS (by topic)
- **Strength of materials:** `[E]` stress vs strain; types of stress; Hooke's law; factor of safety. `[M]` bending stress in a beam; torsion in a shaft; shear force/bending moment diagrams; Mohr's circle; principal stresses; column buckling (Euler). `[H]` combined loading; fatigue (S-N curve, endurance); stress concentration; design a shaft for given loads.
- **Machine design:** `[E]` types of gears; what is a bearing. `[M]` gear ratio/train; bearing selection; shaft design; keys/couplings; theories of failure (max shear/distortion energy). `[H]` design a gearbox stage; fatigue design; bolted/welded joint design.
- **CAD/GD&T:** `[E]` orthographic vs isometric; first vs third angle projection. `[M]` GD&T symbols (flatness, position, concentricity); tolerances & fits (clearance/interference/transition); parametric modeling. `[H]` tolerance stack-up; DFM considerations.
- **Thermodynamics:** `[E]` laws of thermodynamics; system vs surroundings. `[M]` Carnot cycle & efficiency; entropy; Otto vs Diesel cycle; enthalpy. `[H]` Rankine cycle; refrigeration (COP); real-cycle analysis.
- **Fluid mechanics:** `[E]` viscosity; Pascal's law; continuity. `[M]` Bernoulli's equation; Reynolds number (laminar/turbulent); flow through pipes; pump basics. `[H]` boundary layer; losses (major/minor); drag/lift.
- **Manufacturing:** `[E]` casting/welding/machining basics. `[M]` casting defects; welding types; machining operations (turning/milling/drilling); tolerances in manufacturing. `[H]` process selection for a part; DFM.

### COMMON FOLLOW-UPS
Derive/justify; what fails first and why; how would you reduce weight/cost; how do you manufacture this; what material and why.

### STRONG vs WEAK
**Strong:** strong SOM/design fundamentals, connects design to manufacturing and materials, CAD-fluent. **Weak:** rote formulas, no failure/manufacturing intuition, CAD-button knowledge only.

### RED FLAGS
Can't draw SFD/BMD; no factor-of-safety sense; ignores manufacturability.

---

## Production / Manufacturing Engineer
Family mechanical · Depts mech/eee · Hires core/general · Seniority fresher→
Manages manufacturing and production lines; processes + quality + lean.

### TECH STACK
- **Core (5):** **manufacturing processes** (machining, casting, welding, forming, joining) · **production planning & control** (scheduling, MRP, line balancing, capacity) · **Lean manufacturing** (5S, kaizen, JIT, kanban, waste/muda, value-stream mapping) · **Six Sigma / quality** (DMAIC, SPC, control charts, Cp/Cpk) · industrial engineering (time & motion, work study, OEE)
- **Core (3):** material handling · safety standards · inventory management
- **Tools (3):** Excel · ERP (SAP PP) · CAD basics · Minitab (quality)
- **Emerging (2):** Industry 4.0/automation · digital manufacturing · predictive quality

### ROUND STRUCTURE
1. Aptitude/technical — 30 min · 2. Manufacturing + lean + quality — 45 min · 3. Scenario (line/quality problem) — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Manufacturing:** `[E]` machining vs casting vs forming. `[M]` process for a given part; welding/casting defects + causes; tolerances; tooling/fixtures. `[H]` process improvement; cycle-time reduction.
- **Lean/Six Sigma:** `[E]` what is 5S/kaizen; seven wastes. `[M]` JIT/kanban; DMAIC phases; value-stream mapping; SPC & control charts; Cp/Cpk; 7 QC tools. `[H]` reduce defects in a process (root-cause with fishbone/5-why); improve OEE; line balancing.
- **Production/quality:** `[E]` what is OEE; quality vs inspection. `[M]` production scheduling; MRP; PPAP/FMEA; poka-yoke. `[H]` capacity planning; bottleneck analysis (theory of constraints); scrap reduction.
- **Scenario:** `[M]` "a line has 20% rejects — how do you investigate"; "throughput dropped — diagnose". `[H]` design a quality control plan.

### COMMON FOLLOW-UPS
How would you find the root cause; which lean tool and why; how do you measure improvement; how do you prevent recurrence.

### STRONG vs WEAK
**Strong:** structured RCA, real lean/Six-Sigma tools, data-driven. **Weak:** buzzwords without application; no RCA method; no metrics.

### RED FLAGS
Can't apply DMAIC/RCA; no quality-tools understanding; guesses at root causes.

---

## Quality Engineer (Mechanical) / Maintenance Engineer
Family mechanical · Depts mech/eee/ece · Hires core/general · Seniority fresher→
Quality: ensures product/process quality. Maintenance: keeps plant/equipment running.

### TECH STACK & QUESTIONS
- **Quality Engineer** — core: **7 QC tools**, metrology, **SPC/control charts**, **FMEA**, root-cause (5-why/fishbone), ISO 9001, GD&T, Cp/Cpk, PPAP, inspection/gauging.
  - `[E]` quality vs inspection; what is Cp/Cpk. `[M]` 7 QC tools; SPC/control charts (types); FMEA (severity/occurrence/detection/RPN); GD&T; measurement (calipers/micrometers/CMM). `[H]` design a control plan; MSA/gauge R&R; RCA for a recurring defect; ISO audit basics.
- **Maintenance Engineer** — core: preventive/predictive maintenance, RCA, mechanical/electrical systems, hydraulics/pneumatics, condition monitoring (vibration/thermography), reliability (MTBF/MTTR), CMMS, safety.
  - `[E]` preventive vs breakdown maintenance. `[M]` predictive maintenance techniques; MTBF/MTTR; RCA (5-why); hydraulics/pneumatics basics; lubrication. `[H]` reliability-centered maintenance; condition-monitoring program; reduce downtime.

### COMMON FOLLOW-UPS / STRONG vs WEAK / RED FLAGS
Follow-ups: how do you find/prevent the root cause; how do you measure quality/reliability. Strong = structured, data-driven, preventive mindset. Weak = reactive, no RCA/metrics. Red flag: no RCA method; treats symptoms not causes.

---

## Civil Engineer
Family civil · Depts civil · Hires core/general · Seniority fresher→
Designs and builds infrastructure; structures + geotech + construction breadth.

### TECH STACK
- **Core (5):** **structural analysis** (beams, trusses, frames, SFD/BMD, indeterminate structures, deflection) · **RCC & steel design (IS 456 / IS 800)** (limit state, working stress, reinforcement, beam/column/slab design) · **concrete technology** (mix design, workability, strength, curing, admixtures) · **geotechnical / soil mechanics** (soil classification, bearing capacity, shear strength, settlement, foundations) · **surveying** (levelling, theodolite, total station, contouring)
- **Core (4):** fluid mechanics/hydraulics · construction materials & methods · transportation engineering · estimation & costing
- **Tools (3):** AutoCAD · **STAAD.Pro / ETABS** · Revit (BIM) · MS Project/Primavera
- **Emerging (2):** BIM · green building · precast/modular

### ROUND STRUCTURE
1. Aptitude/technical — 30 min · 2. Structural + RCC/steel + concrete — 45 min · 3. Geotech/surveying/estimation — 30 min · 4. Project + HR — 30 min

### ASKABLE QUESTIONS (by topic)
- **Structural analysis:** `[E]` types of beams/supports; what is a truss. `[M]` SFD & BMD for a beam; determinate vs indeterminate; method of joints/sections; deflection. `[H]` moment distribution; slope-deflection; influence lines.
- **RCC/Steel design:** `[E]` working stress vs limit state; what is reinforcement. `[M]` design a singly-reinforced beam; slab/column basics; IS 456 provisions; development length; steel connections (bolt/weld). `[H]` doubly-reinforced/T-beam; column with moment; steel member design.
- **Concrete technology:** `[E]` grades of concrete; water-cement ratio. `[M]` mix design; workability (slump); tests (compressive strength); admixtures; curing. `[H]` durability; special concretes; defects & remedies.
- **Geotechnical:** `[E]` soil types; what is bearing capacity. `[M]` soil classification; shear strength (c, φ); bearing capacity (Terzaghi); shallow vs deep foundation; settlement. `[H]` slope stability; pile design; earth pressure.
- **Surveying:** `[E]` what is levelling; chain vs total station. `[M]` levelling/contouring; traversing; corrections. `[H]` curve setting; GPS/total-station workflows.
- **Estimation:** `[M]` estimate quantities for a small structure; rate analysis; BOQ. `[H]` detailed estimate + costing.

### COMMON FOLLOW-UPS
Derive/justify; which IS code; what fails first; how would you build/sequence this; how do you estimate this.

### STRONG vs WEAK
**Strong:** strong structural + design fundamentals, code-aware, connects design to construction. **Weak:** rote formulas, no code/construction sense, can't draw SFD/BMD.

### RED FLAGS
Can't draw SFD/BMD; no IS-code awareness; no factor-of-safety/serviceability sense.

---

## Structural Engineer
Family civil · Depts civil · Hires core/general · Seniority fresher→
Designs safe load-bearing structures; deeper structural + software.

### FOCUS DELTAS + EXTRA QUESTIONS (uses Civil stack, weighted to structures + STAAD/ETABS)
- `[M]` load calculations (dead/live/wind/seismic); load combinations (IS 875/1893); design an RCC/steel beam-column; foundation types selection; STAAD/ETABS modeling basics. `[H]` earthquake-resistant design (ductile detailing IS 13920); dynamic analysis; tall-building lateral systems; foundation design for given soil.
- **Strong vs weak:** strong load-path + code + software; weak = software-button knowledge without structural understanding. **Red flag:** no load-combination/code awareness; can't reason about load paths.

---

## Site Engineer / Project Engineer
Family civil · Depts civil/mech/eee · Hires core/general · Seniority fresher→
Site: executes/supervises construction. Project: plans and runs engineering projects.

### TECH STACK & QUESTIONS
- **Site Engineer** — core: construction methods & sequencing, quality control, **safety management**, reading drawings, surveying, estimation & billing, material management, concrete/steel work, labor coordination.
  - `[E]` how do you read a structural drawing; what is a bar bending schedule. `[M]` construction sequence for a footing/column/slab; concrete pour checks; quality tests on site; safety measures; billing/measurement. `[H]` manage a delay/defect on site; coordinate trades; RCC vs steel construction decisions.
- **Project Engineer** — core: **project planning & scheduling** (MS Project/Primavera, CPM/PERT, Gantt), cost estimation, resource management, risk, procurement, quality & safety, contracts.
  - `[E]` what is CPM/critical path; Gantt chart. `[M]` schedule a project; float/slack; resource leveling; cost control; risk register. `[H]` handle schedule slippage; earned value (SPI/CPI); contract/claims basics.

### COMMON FOLLOW-UPS / STRONG vs WEAK / RED FLAGS
Follow-ups: how would you handle a delay/defect/safety issue; how do you sequence this; how do you track cost/schedule. Strong = practical execution + planning + safety. Weak = textbook-only, no site/safety sense. Red flag: no safety awareness; can't sequence construction or read drawings.

---
*Next files: `03_infra_quality_security.md` (DevOps/Cloud/SRE/QA/Security) and `06_business_product_design.md` (PM/BA/Consultant/Analyst/Designer).*

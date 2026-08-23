# PrepVista — Feature #01: Company-Specific Interview Simulation
## MASTER INTELLIGENCE DOSSIER (build-ready knowledge base)

> **Purpose of this document.** This is the complete knowledge base gathered to build Feature
> #01 at full capacity. It is *not* the code. It is everything a Claude Code master prompt needs:
> the thesis, the universal data model, deep per-company intelligence, the simulation engine
> architecture, the authenticity layer, the track-prediction logic, the content strategy, the
> roster-scaling plan, and the moat. Feed this (plus the master prompt in `01_CLAUDE_CODE_MASTER_PROMPT.md`)
> to Claude Code.
>
> **Sourcing & freshness note.** Interview formats are compiled from current public candidate
> reports and placement-prep sources (2024–2026 cycles). Companies revise formats every cycle, and
> exact question counts / cutoffs are rarely officially published. Therefore the design stores every
> format as **versioned, editable data** (see the blueprint schema) and surfaces a "format confidence
> + last-verified date" on every company. The *skill mix and round shape* are stable; the *exact
> numbers* are treated as tunable config, never hardcoded.

---

## PART 0 — THE THESIS (why this feature is industry-turning and non-replaceable)

### 0.1 What every competitor sells today
Existing "mock interview" tools do one of three shallow things:
1. A generic question bank tagged with a company name ("Amazon questions") — no real format.
2. A single LLM chat that role-plays "an Amazon interviewer" — no rounds, no timing, no gates.
3. A coding-only judge (LeetCode-style) filtered by company tag — no aptitude, no HR, no behavior.

None of them reproduce **the actual experience of the actual company's actual selection process** —
the sectional timers, the question-locking, the tab-switch termination, the negative-marking rules,
the elimination gates, the platform look-and-feel, the track/tier branching, the company-specific
round types (Wipro's voice assessment, Amazon's Bar Raiser + 16 Leadership Principles, Cognizant's
gamified reasoning, Capgemini's 24-game pool, Zoho's build-an-application round, Google's hiring
committee + Googleyness).

### 0.2 What PrepVista Feature #01 sells
> **"Sit the real thing before the real day."** A faithful, end-to-end simulation of a *named
> company's* selection process — every round, in order, with that company's real rules, timing,
> gates, platform feel, difficulty calibration, and outcome logic — and then a readiness verdict
> that mirrors how that company actually decides (Ninja/Digital/Prime, Elite/Turbo, GenC/Pro/Next,
> Analyst/Senior Analyst, Hire/No-Hire + which tier/track the student is currently tracking toward).

### 0.3 The moat (five layers of depth that make replication fail)
1. **Format-fidelity data.** A structured, versioned blueprint per company capturing *dozens* of
   fields per round (platform, section order, per-section counts/timing, negative marking, cutoffs,
   navigation rules, languages, elimination logic, track branching). Encoding this for 10 companies
   is a research project; for 100+ it is a moat. Competitors copying the *idea* still face the
   *encoding* problem.
2. **Round-type simulators.** Each exotic round (voice assessment, gamified aptitude, Bar Raiser,
   work-simulation, build-an-app, hiring-committee) needs its *own* purpose-built simulator + rubric.
   A generic chat cannot fake these. PrepVista already owns 15 tested question modules + scoring; this
   feature composes them into company-authentic sequences and adds the missing exotic simulators.
3. **Authentic environment.** Platform emulation (TCS iON / AMCAT / CoCubes / Superset / HackerRank
   look-and-feel), sectional-timer engine, question-locking, tab-switch/focus detection, on-screen
   calculator toggles, negative-marking engine — the *test-taking conditions*, not just the questions.
4. **Track/tier prediction.** A per-company outcome model that converts sectional performance into the
   company's real branching (see Part 8). This is the "before the actual day" payoff and is unique to
   this depth of format modeling.
5. **The flywheel.** Every simulated session (with student consent, aggregated) sharpens difficulty
   calibration and refreshes format confidence. Layers 02/03 (Placement Intelligence, TPO) consume it.
   A late entrant has no flywheel and no format corpus.

### 0.4 Revenue thesis (why "more companies" changes the outcome)
- A student prepares for the **specific** companies visiting their campus. Coverage of *their* target
  companies is the difference between "nice to have" and "must buy before placement week."
- A TPO buys for the **whole batch**; the batch targets 20–60 companies. Coverage breadth is the
  purchase driver — a platform that simulates 8 companies loses to one that simulates 150.
- Breadth is also the defensibility: each additional authentically-modeled company is a unit of moat
  and a unit of addressable demand. The roster is the product's compounding asset (see Part 10).

---

## PART 1 — THE UNIVERSAL COMPANY INTERVIEW BLUEPRINT SCHEMA

This schema is the heart of the feature. It must capture *any* company's process as data so the
simulation engine is generic and the roster can scale to hundreds without new code. Every company =
one `company_blueprint` record. Rounds are ordered; each round is one of a fixed set of `round_types`
that each map to a simulator.

```jsonc
company_blueprint = {
  "company_id": "tcs",
  "display_name": "Tata Consultancy Services",
  "aliases": ["TCS"],
  "archetype": "mass_service",           // mass_service | product | premium_product | analytics | core | unique
  "tier": "tier1_service",               // marketing/positioning tier
  "hiring_scale": "very_high",            // very_high | high | medium | low  (drives how "known" the format is)
  "logo_asset": "tcs.svg",
  "brand_colors": {"primary":"#....","accent":"#...."},
  "platform": {                          // the assessment platform to EMULATE (look, rules)
    "name": "TCS iON",                   // TCS iON | AMCAT | CoCubes | Superset | HackerRank | Mettl | proctored_meet | custom
    "emulation_profile": "tcs_ion",      // key into the platform-skin registry (Part 7)
    "proctored": true,
    "tab_switch_policy": "terminate",    // terminate | warn | flag | none
    "navigation": "locked_forward",      // locked_forward | free_within_section | free_all
    "on_screen_calculator": true,
    "rough_work": "physical_or_scratchpad"
  },
  "packages": [                          // tracks/tiers the company hires into
    {"track":"ninja","label":"TCS Ninja","ctc_lpa":[3.5,3.9],"gate":"cognitive_only"},
    {"track":"digital","label":"TCS Digital","ctc_lpa":[7.0,7.5],"gate":"cognitive+advanced"},
    {"track":"prime","label":"TCS Prime","ctc_lpa":[9.0,11.0],"gate":"cognitive+advanced+strong"}
  ],
  "eligibility": {                       // for realism + a pre-sim "are you eligible" check
    "min_percentage_throughout": 60, "max_active_backlogs": 1,
    "max_academic_gap_years": 2, "degrees": ["BE","BTech","ME","MTech","MCA","MSc"]
  },
  "re_eligibility_gap_months": 24,       // cool-off before re-attempt (realism + "when can I retry")
  "format_confidence": 0.9,              // 0-1: how well-verified this blueprint is
  "last_verified": "2026-05",
  "recent_changes": [                    // surfaced to the student as "what changed this year"
    "FY26: ~60% of fresher hires AI-skilled; Prime technical round now includes an AI/data project review."
  ],
  "culture_values": ["reliability","integrity","learnability","relocation_flexibility"],
  "what_they_value": "Breadth, consistency, communication, and clearing every sectional gate.",
  "rounds": [ /* ordered list of round objects, see below */ ],
  "outcome_model": { /* track-prediction config, see Part 8 */ }
}
```

### 1.1 The round object (one per stage)

```jsonc
round = {
  "order": 1,
  "round_id": "tcs_foundation",
  "round_type": "aptitude_test",         // maps to a simulator (Part 6). Fixed vocabulary below.
  "label": "TCS NQT — Foundation (Cognitive Skills)",
  "is_elimination": true,                // does failing here stop the process?
  "gate_rule": {"type":"sectional_and_overall","min_percentile_by_track":{...}},
  "negative_marking": {"enabled": false, "penalty": 0.0},   // per-round (varies!)
  "total_minutes": 120,
  "sections": [                          // sub-sections within the round
    {"section_id":"verbal","label":"Verbal Ability","competency":"aptitude_reasoning",
     "item_type":"mcq","count":24,"minutes":30,"topics":["reading_comprehension","grammar","vocabulary"]},
    {"section_id":"reasoning","label":"Reasoning Ability","competency":"aptitude_reasoning",
     "item_type":"mcq","count":30,"minutes":50,"topics":["series","coding_decoding","seating","syllogism"]},
    {"section_id":"numerical","label":"Numerical Ability","competency":"aptitude_reasoning",
     "item_type":"mcq","count":26,"minutes":40,"topics":["percentages","tsd","ratio","pnc","profit_loss"]}
  ],
  "difficulty_profile": "medium",        // per-round difficulty anchor
  "notes": "No section switching once started; question locking; on-screen calculator available."
}
```

### 1.2 Fixed `round_type` vocabulary (each maps to one simulator in Part 6)
- `aptitude_test` — sectional MCQ aptitude (verbal / reasoning / numerical / DI).
- `technical_mcq` — programming/CS-fundamentals/pseudocode MCQ (and domain fundamentals: networking/cloud/DB).
- `coding_test` — write-and-run code against visible + hidden test cases (partial scoring).
- `advanced_coding` — 1 hard problem OR build-an-application / product-design (Zoho-style).
- `game_based_aptitude` — gamified cognitive challenges (Cognizant, Capgemini).
- `voice_assessment` — spoken-English: read-aloud, describe-image, speak-on-topic, repeat-after-audio, dictation (Wipro, Capgemini spoken).
- `written_communication` — timed essay / email with mistake-threshold + AI grammar grading (Wipro, Capgemini WET).
- `behavioral_survey` — work-style / personality / Leadership-Principles most-least survey (Amazon, Accenture behavioral).
- `work_simulation` — virtual-office scenario decisions (Amazon).
- `technical_interview` — live technical Q&A (DSA, CS fundamentals, project deep-dive).
- `managerial_interview` — scenario + project + pressure (TCS MR).
- `hr_interview` — behavioral + motivation + culture + salary.
- `system_design` — HLD/LLD (product/premium, senior).
- `bar_raiser` — the veto round with a different-team senior, behavior-heavy (Amazon; Microsoft "AA"; Google committee analog).
- `group_discussion` — simulated GD (some service companies).
- `hiring_committee` — asynchronous packet review + verdict (Google; modeled as an outcome step, not a live round).

> **Key design rule:** the engine renders a session by walking `rounds` in order, instantiating the
> matching simulator for each `round_type`, enforcing the round's `negative_marking`, timers, gates,
> and platform rules, and passing results to the `outcome_model`. Adding a company = adding a
> blueprint record. **No new code per company.**

### 1.3 Mapping to what PrepVista already owns
- `aptitude_test`, `technical_mcq` → `q_aptitude_reasoning`, `q_technical_domain` (branch banks), `q_puzzles_brainteasers`.
- `technical_interview` → `q_technical_domain` + `q_resume_based`.
- `hr_interview` → `q_hr_behavioral`, `q_career_motivation`, `q_culture_fit`, `q_salary_expectation`, `q_candidate_questions`.
- `behavioral_survey`, `bar_raiser` → `q_situational_star`, `q_hr_behavioral`, `q_stress_curveball` (+ new LP rubric).
- `managerial_interview` → `q_situational_star`, `q_stress_curveball`, `q_case_study`.
- `group_discussion` → `q_group_discussion`.
- **Missing simulators to build new:** `coding_test`/`advanced_coding` (real code execution + judge),
  `game_based_aptitude`, `voice_assessment`, `written_communication` (essay + AI grammar + mistake-threshold),
  `work_simulation`, `system_design`, `hiring_committee` (outcome step). These are the feature's net-new build.

---

## PART 2 — DEEP COMPANY PROFILES (the researched intelligence)

> Each profile below is the *research digest* that populates a `company_blueprint`. Numbers are
> current-cycle candidate-reported values; store them as editable config with a last-verified date.

### 2.1 TCS (Tata Consultancy Services) — archetype: mass_service — platform: TCS iON
- **Model:** Single **integrated NQT**, one ~**190-minute** session, decides three tracks from one test.
- **Tracks:** Ninja (₹3.5–3.9 LPA, cognitive only), Digital (₹7.0–7.5, cognitive + advanced), Prime (₹9.0–11.0, cognitive + advanced, top scores).
- **Round 1 — Foundation / Cognitive Skills (all candidates):** Verbal Ability (24 Q / 30 min), Reasoning Ability (30 Q / 50 min), Numerical Ability (26 Q / 40 min). **No negative marking on cognitive** (a widely-reported current detail; some legacy sources claim 0.33 negative marking on Foundation — store as a per-cycle flag, default off, and surface the ambiguity). On-screen calculator. Attempt everything.
- **Round 2 — Advanced (Digital/Prime only):** Advanced Programming Logic block + a Coding problem (~+60 min). Candidates who skip Advanced are capped at Ninja. Languages: C / C++ / Java / Python.
- **Rules:** In-centre (TCS iON authorized centers) for most NQTs; **question locking** (cannot revisit previous questions); **no tab switching (terminates the exam)**; physical rough sheets. Foundation sub-sections have been reported both as switchable and not — model as configurable; default no cross-section switching.
- **Interview (post-cutoff):** Technical → **Managerial (MR)** → HR. Ninja interview ~20–30 min; Digital/Prime 60–90 min and significantly more rigorous (DSA, competitive programming, Big Data/DS/IoT/Cloud, live coding / system design). **FY26:** ~60% of fresher hires AI-skilled; Prime technical now includes an AI/data project review.
- **Eligibility:** ≥60% throughout, ≤1 active backlog, ≤24-month gap, age 18–28. Scorecard valid 2 years; accepted by 4000+ companies (a selling point to surface).
- **Simulation must include:** sectional-timer engine, question-locking, tab-switch termination, on-screen calculator, track branching by percentile, MR round simulator.

### 2.2 Infosys — archetype: mass_service — platform: proctored (in-person for on-campus 2026) / HackerRank-style
- **Two entry tracks:**
  - **System Engineer (SE)** (~₹3.6 LPA): aptitude test — Reasoning (series, coding-decoding, blood relations, directions, cryptarithmetic, seating), Mathematical/Logical Ability (ratio, %, SI/CI, P&L, T&W, TSD, P&C, probability), Verbal (sentence completion, error correction, RC, critical reasoning), **Pseudocode** MCQs (arrays, loops, conditionals, functions, OOP, complexity), Numerical/puzzle + English grammar; then interview.
  - **Specialist Programmer (SP) / Digital Specialist Engineer (DSE)** (SP ~₹9+ L2/L3 premium; DSE ~₹6.5): **3 coding problems in 3 hours** — 1 Easy (basic DS/algo), 1 Medium (greedy), 1 Hard (usually DP). **Sectional + overall cutoffs.** Performance decides SP vs DSE. Languages: Java / Python / C++ / C.
- **HackWithInfy:** a separate elite coding contest funneling top coders to SP.
- **Rounds:** Online test → Technical interview (logic behind your solutions, DSA, puzzles, branch subjects, project) → HR.
- **Re-eligibility:** **9 months** since any prior Infosys process. Gap ≤2 years.
- **Simulation must include:** two distinct blueprints (SE aptitude+pseudocode vs SP/DSE 3-problem coding gauntlet with sectional + overall gates), coding judge, SP-vs-DSE outcome branching.

### 2.3 Wipro — archetype: mass_service — platform: Superset
- **Tracks:** Elite (₹6.5 LPA), Turbo (₹5), Velocity, Project Engineer (₹3.5). Coding + higher cutoffs gate the higher tracks.
- **Round 1 — Online Assessment:**
  - **Aptitude** (Quants + Logical + Verbal), ~**48 min combined**. No negative marking; 1 mark each.
  - **Written Communication Test** — **essay, 20 min**. **Distinctive rule: a ~5-mistake threshold; exceeding it triggers negative marking.** AI-evaluated for grammar/clarity/coherence/vocabulary/structure.
  - **Coding** — **2 problems, 60 min**, visible + hidden test cases, C / C++ / Java / Python.
  - (Turbo variant reported as ~128 min total, ~51 items: Quants 16Q/16min, Logical 14Q/14min, Verbal 18Q/18min, Coding 2/60min, Essay 20min.)
- **Round 2 — Voice / Communication Assessment (DISTINCTIVE, elimination):** automated spoken-English — read a passage aloud, describe an image (structure: what→where→who→what's happening→opinion), speak on a topic ~90s, listen-and-type dictation, pronunciation/fluency/grammar scoring.
- **Round 3 — Business Discussion / HR:** confidence, leadership, teamwork, motivation; sometimes puzzles or a GD.
- **Re-eligibility:** **6 months.** One backlog allowed at assessment; cleared before offer.
- **Simulation must include:** the **voice_assessment simulator** (record → score pronunciation/fluency/pace/content; this is a signature differentiator), the **essay simulator with mistake-threshold → negative marking**, and Elite/Turbo branching.

### 2.4 Cognizant — archetype: mass_service — platform: Superset (+ Cognizant app)
- **Tracks (by performance, NO separate registration):** GenC (₹4 LPA) → GenC Pro → GenC Next (highest); also GenC Elevate, Digi. Solve more coding + hold a relevant certification (Salesforce / CyberSecurity / ServiceNow) → higher track.
- **Round 1 — Communication Assessment (~60 min):** listening & speaking, grammar, fluency; **includes a "repeat after the audio" section played only once.**
- **Round 2 — Aptitude + Reasoning (Game-Based) (~80 min reported):** ~30 aptitude/quant + logical-reasoning questions **plus 4 gamified sections** (Deductive Challenge, Switch Challenge, Grid Challenge, etc.) — **reach the maximum level for a higher score.**
- **Round 3 — Technical Assessment (Coding):** GenC = **5 questions: 2 SQL, 2 coding (any language), 1 Web-UI (HTML/CSS/JS)**; must solve ≥3 for GenC. GenC Pro = language **clusters** (Cluster 1 Java/ANSI SQL/HTML/CSS/JS; Cluster 2 Python/ANSI SQL/Cloud; Cluster 3 C#/ANSI SQL/HTML/CSS/JS), **24 coding questions in 120 min**, moderate→high. Solve 5 → GenC Next; 3–4 + certification → GenC Pro.
- **Round 4 — Technical + HR Interview:** CS fundamentals (OOP/DBMS/CN/OS), SQL depth (index hunting, fill factor), project deep-dive, awareness of AI/Big Data trends, standard HR. ~30 min.
- **Rules:** no negative marking; ~135 min OA total (GenC). Round 1/2 order may swap by zone.
- **Simulation must include:** the **game_based_aptitude simulator** (leveling challenges), SQL + Web-UI coding item types, cluster selection, and the "solve N → track" outcome model.

### 2.5 Accenture — archetype: mass_service — platform: CoCubes
- **NLT (National Level Test), ~120–175 min, sectional cutoffs (~60–70%), navigation allowed, no negative marking, adaptive cognitive.** Recently restructured into stages of multiple sections:
  - **Behavioral Assessment** — personality/work-style, no technical, untimed-ish.
  - **Cognitive Assessment** — English Ability, Abstract Reasoning, Critical Thinking & Problem Solving, **Common Applications & MS Office** (distinctive), (game-based questions have replaced some classic aptitude).
  - **Technical Assessment** — **Pseudo Code**, **Fundamentals of Networking, Security & Cloud** (distinctive), programming MCQs.
  - **Coding** — **2 questions, 45 min**, C/C++/Java/Python — **now an elimination round; its score carries into the interview.**
  - **Communication Assessment** — spoken English (sentence mastery, vocabulary, fluency, pronunciation), typically **not** elimination.
- **Rounds:** OA → Technical Interview (core subjects, coding, projects, ~30–45 min) → HR (~20–30 min). Packages: ASE ₹4.5–5 LPA; Advanced App Engineering up to ₹8–10.
- **Eligibility:** ≥60%/6.0 CGPA, no active backlogs (varies).
- **Simulation must include:** the MS-Office/Common-Applications section, Networking/Security/Cloud fundamentals bank, pseudocode focus, adaptive cognitive behavior, and coding-as-elimination gate.

### 2.6 Capgemini — archetype: mass_service — platform: Superset ("Exceller" assessment)
- **Tiers:** Analyst (₹4.0–4.5 LPA) and Senior Analyst (₹6.5–7.5). **The coding round's performance alone determines the tier** ("initial professional market valuation").
- **Sections (~90–105 min, no negative marking, each a sectional gate ~70%):**
  - **Pseudocode / Technical MCQ** — ~40 MCQs: programming logic, C/C++, data structures, OOP, **output prediction** (+ DB/networking/cloud for some streams).
  - **English Communication** — **Written English Test (essay)** + **AI-based spoken English test** (reading/speaking/listening; elimination).
  - **Game-Based Aptitude** — **4 games randomly drawn from a pool of 24** (Deductive/Geo-Sudo, Inductive, Grid Challenge, Motion Challenge, Digit Challenge, Switch Challenge…); each ~5–6 min; **reach the maximum level (higher levels score more).**
  - **Quantitative Aptitude** — profit/loss, ratio, mixtures & alligation, averages, %, time-speed-distance.
  - **Behavioral Competency** ("Adept Essentials" / PowerSkills) — adaptability, problem-solving; untimed ~20 min (availability differs on/off campus).
  - **Coding round** (for higher package) — **2 questions, 45 min, C / C++ / Java only — Python is BANNED** (distinctive).
- **Rounds:** OA (Exceller) → Technical Interview (pseudocode logic, core subjects, projects, cloud/DB/networking) → HR. Hiring ~45,000 in 2025 with an explicit AI-ready-workforce focus.
- **Simulation must include:** the 24-game pool (draw 4) with leveling, **Python-banned** coding constraint, tier = coding-performance outcome, AI-spoken-English test.

### 2.7 HCLTech — archetype: mass_service — platform: varies (HCL national test / Mettl-style)
- **Entry paths:** HCLTech engineering hiring (BE/BTech) and **TechBee** (a 12th-pass Early Career Programme — separate, non-degree; keep as a distinct blueprint if targeted).
- **Engineering process (standard service shape; store with lower `format_confidence` and verify):** Online aptitude (quant + logical + English) + technical MCQ (CS fundamentals, programming) + a coding component → Technical interview (DSA, CS fundamentals, project) → HR. Packages typically ₹3.5–4.5 LPA base with higher digital tracks.
- **Simulation:** reuse the mass_service template; flag as "verify current format." (This is the one named company with the thinnest public 2026 detail — a good candidate for a "verify before season" banner.)

### 2.8 Zoho — archetype: unique (product, very selective) — platform: proctored (Zoho Meet) / in-person
- **5–7 rounds for freshers; famously selective (e.g., ~700 attempt → ~2 offers reported).** Logic over CGPA.
- **Round 1 — Written Test (~90 min):** general aptitude (time/work, profit&loss, speed/distance, %, ratios, averages) + **C-programming aptitude** (pseudocode output; nested loops, recursion, flowcharts, pointers). Harder papers → fewer (~20) questions. Some campuses demand near-perfect (e.g., a reported "10/10 to pass").
- **Round 2 — Basic Programming:** one-on-one (laptop or screen-share proctored); **5–8 programming problems** in C/C++/Java — loops, recursion, 2D arrays, strings, pattern printing, basic DS. (Signature problem styles: reverse a number, palindrome, dial-pad number sequence for a word, merge sorted arrays, star patterns, Armstrong/lucky numbers.)
- **Round 3 — Advanced Programming:** **one hard problem in ~90 min, OR build an application / do a product-design task** (write an application at an advanced level). This "build something real" round is Zoho's signature.
- **Round 4 — Technical HR:** programming fundamentals, DBMS, OS, CN, resume depth; sometimes **system design (LLD/HLD)** for some.
- **Round 5+ — General HR:** family background, hobbies, why Zoho, location, situational/decision-making, cultural fit.
- **Re-eligibility:** **6-month** cool-off. Packages ~₹6–8 LPA (higher for stronger performers). Alt path: Zoho School of Technology.
- **Simulation must include:** the multi-stage escalating-difficulty gauntlet, the **advanced_coding "build an application" simulator**, C-output pseudocode items, and the "near-perfect to pass" gate option.

### 2.9 Amazon — archetype: premium_product — platform: Amazon OA (HackerRank/Codility-style) → virtual loop
- **Process:** Online Assessment → Phone Screen → **Onsite Loop (4–5 rounds)** → **Bar Raiser** → **Debrief**.
- **Online Assessment (single proctored session, ~2–3.5 h):**
  - **2 DSA problems** (easy–medium; graphs incl. DSU/BFS/DFS, DP variants, binary-search-on-answer trending in 2025–26), auto-graded with **partial scoring on hidden tests.**
  - **Work Simulation** — virtual-office scenarios (choose responses to emails / minor debugging).
  - **Work-Style Survey** — **Leadership-Principles most/least** multiple-choice.
  - Sometimes a **code-debugging** section and/or logical reasoning; growing reports of AI-assisted coding sections.
- **The 16 Leadership Principles ≈ 50% of evaluation.** Every interviewer scores **both** technical **and** LP. Prepare 6 STAR stories mapped to LPs; expect 1–2 LP probes per round. (You can fail with perfect code and weak LPs.)
- **Interview loop:** DSA rounds (1 LC-medium + 1 LC-hard typical), sometimes **machine coding / LLD** (design chess / snake-and-ladder / parking lot / bookstore), each with LP follow-ups.
- **Bar Raiser (DISTINCTIVE):** a specially-trained senior from a **different team**, **behavior-heavy**, holds a **no-fly veto**; you are not told who it is; "the single hardest round." Debrief led by the Bar Raiser; each interviewer files **Strong hire / Hire / No hire / Strong no hire.**
- **Offer economics:** signing bonus ~₹6L with a 12-month clawback (retention). SDE-1 vs SDE-2 differ (SDE-2 adds full system design + deeper LP). Re-apply after **6 months.** Languages: Python / Java / C++ / JS.
- **Simulation must include:** the LP **behavioral_survey** + **work_simulation** simulators, coding judge, **bar_raiser simulator** (different-team persona, veto logic, LP-depth probing), and the Strong-hire/No-hire debrief verdict.

### 2.10 Microsoft — archetype: premium_product — platform: Microsoft OA (Codility/HackerRank-style) → loop
- **Process:** Resume screen → **OA (1–2 rounds: DSA + debugging)** → sometimes recruiter call → Phone screen(s) → **Onsite/"Super Day" loop (4–5 rounds, ~45–60 min)** → decision.
- **Question flavor:** strong DSA; **Backtracking noticeably more common at Microsoft** than peers; also DP, two-pointers, graphs. Typical set spans LC easy→hard (valid parentheses, reverse linked list, find peak element, group anagrams, serialize/deserialize tree, word search, trapping rain water, min window substring).
- **Round shape:** DSA rounds + **1 LLD round** + **System Design** (for experienced) + **Behavioral/HR**; sometimes an **ad-hoc presentation on a past project with a brief demo.**
- **"As-Appropriate/Astute" final decision-maker round** functions like Amazon's Bar Raiser (a senior who calibrates the bar). Internships are a common entry path.
- **Simulation must include:** DSA judge with a backtracking-weighted bank, an LLD round, a project-presentation simulator, and an AA-style final gate.

### 2.11 Google — archetype: premium_product — platform: Google Hiring Assessment (some) → loop → committee
- **Process (5 stages):** Resume screen → **Online Assessment (GHA, some candidates)** → **Technical Phone Screen** (~45 min, medium coding via Meet) → **Onsite Loop (4–6 rounds, ~45 min each)** → **Hiring Committee review** → **Team Matching** (now often before committee).
- **Onsite loop:** 2–3 **DSA/coding** rounds (algorithms + data structures; graphs, DP; whiteboard or Chromebook), **System Design** at **L5+**, and a **Googleyness** behavioral round (collaboration, ambiguity tolerance, learning mindset, self-awareness) — **every candidate, every level.**
- **Hiring Committee (DISTINCTIVE):** third-party Googlers **not present in your interviews** make the decision from a packet (feedback forms + resume + phone screens). Feedback scale: **Strong no hire / No hire / Leaning no hire / Leaning hire / Hire / Strong hire.** Outcomes: hired / team-match-needed / more-interviews / rejected. Evaluated on 4 attributes: **General Cognitive Ability, Role-Related Knowledge, Leadership, Googleyness.**
- **2026 realities:** **AI assistance not permitted** at any stage; in-person interviews reinstated to combat AI-assisted cheating; a **code-comprehension** round pilot (read/analyze code rather than write). L3 entry-level; ~99.8% reject rate.
- **Simulation must include:** the phone-screen → multi-DSA → Googleyness sequence, an L5+ system_design branch, and the **hiring_committee outcome step** (packet → committee verdict on the 6-point scale) as the payoff — a unique, faithful touch no competitor models.

### 2.12 Cross-company quick matrix (for the roster + UI badges)

| Company | Platform | Signature round(s) | Coding langs | Neg. marking | Tracks | Re-elig |
|---|---|---|---|---|---|---|
| TCS | TCS iON | MR round; locked-forward; tab-switch=terminate | C/C++/Java/Py | Cognitive: no* | Ninja/Digital/Prime | 24 mo |
| Infosys | HackerRank-style | 3-problem gauntlet (E/M/H); pseudocode (SE) | Java/Py/C++/C | — | SE / SP / DSE | 9 mo |
| Wipro | Superset | **Voice assessment**; essay 5-mistake→neg | C/C++/Java/Py | Aptitude: no; essay: threshold | Elite/Turbo/Velocity | 6 mo |
| Cognizant | Superset | **Gamified reasoning**; SQL+Web-UI coding | any (clusters) | No | GenC/Pro/Next | — |
| Accenture | CoCubes | MS-Office; Networking/Security/Cloud; coding=elim | C/C++/Java/Py | No | ASE / Advanced | — |
| Capgemini | Superset | **24-game pool (draw 4)**; **Python banned** | C/C++/Java | No | Analyst/Sr Analyst | — |
| HCLTech | varies | (verify) standard service shape | C/C++/Java/Py | verify | base/digital | — |
| Zoho | proctored | **Build-an-application** advanced round | C/C++/Java | — | single (merit) | 6 mo |
| Amazon | HackerRank-style | **16 LPs + Bar Raiser veto**; work-sim | Py/Java/C++/JS | — (partial-score) | SDE-1/2 | 6 mo |
| Microsoft | Codility-style | Backtracking-heavy; LLD; project demo; AA gate | any | — | SDE | — |
| Google | GHA/Meet | **Googleyness + Hiring Committee**; code-comprehension | any | — | L3+ | ~few mo |

\* TCS Foundation negative marking is reported inconsistently across cycles — model as a per-cycle flag (default off) and show the ambiguity.

---

## PART 3 — THE SIMULATION ENGINE ARCHITECTURE

The engine is a **blueprint interpreter**. Given a `company_blueprint`, a `StudentProfile`, and a
chosen track, it renders and runs the full selection process. Core components:

### 3.1 Session Orchestrator (company mode)
- Loads the blueprint, resolves the target track, and builds an ordered **round plan**.
- For each round: instantiates the matching **round simulator**, applies the round's timers, gates,
  negative-marking, navigation, and platform rules, collects results, evaluates the `gate_rule`.
- On an elimination gate failure, **stops** and produces an "eliminated at round X" outcome (this is
  authentic and valuable — the student learns exactly where they'd be cut).
- Persists a `CompanySessionRecord` (extends the existing `SessionRecord`) with per-round, per-section
  scores, timings, integrity signals, and the final `outcome_model` verdict.

### 3.2 Sectional Timer Engine
- Per-section countdown with hard cutoffs; optional per-round master clock.
- Enforces `navigation` mode: `locked_forward` (TCS — no revisit), `free_within_section`, `free_all`.
- Emits time-pressure telemetry (used by scoring + integrity + coaching).

### 3.3 Negative-Marking Engine (per-round, configurable)
- Supports: none; fixed per-wrong penalty (e.g., 0.33); and **threshold models** (Wipro essay:
  free up to ~5 mistakes, then penalize). Applied at scoring time from the round's `negative_marking`.

### 3.4 Question-Locking & Attempt State
- Tracks answered/locked/flagged per item; enforces no-revisit where required; supports "mark for
  review" only where the real platform allows it.

### 3.5 Proctoring / Integrity Layer (reuses `integrity_monitor.py` + `integrity_config.json`)
- **Tab-switch / focus-loss detection** with per-company policy: `terminate` (TCS), `warn`, `flag`.
- Paste-burst, superhuman-typing, rapid-response, idle-then-instant signals — **conservative**, never
  auto-fail (all flags for review), exactly as the existing integrity config specifies.
- Optional camera proctoring (opt-in per college) for the exotic proctored companies.

### 3.6 Track/Outcome Resolver (Part 8)
- Converts per-section performance into the company's real branching + a "you are currently tracking
  toward <track>" verdict, plus the gap to the next track.

### 3.7 Company-authentic Report (extends `feedback_config.json`)
- Adds a **round-by-round timeline** ("cleared Foundation → cleared Advanced → Bar Raiser: borderline"),
  the **predicted track**, the **cutoffs you did/didn't clear**, and **company-specific coaching**
  (e.g., "Wipro voice: reduce filler words"; "Amazon: your LP stories lack measurable impact").

---

## PART 4 — ROUND-TYPE SIMULATORS (the net-new builds, with rubrics)

Each `round_type` maps to one simulator. Reuse PrepVista's modules where noted; build the rest.

### 4.1 `aptitude_test` (REUSE `q_aptitude_reasoning` + parametric generator)
- Sectioned MCQ with the exact per-section counts/timings from the blueprint. Objective grading.
- **Parametric item generator** (new, lightweight): template + randomized numbers → infinite fresh,
  auto-answerable quant/reasoning items so the "test" never repeats and always has a correct key.

### 4.2 `technical_mcq` (REUSE `q_technical_domain` banks + pseudocode generator)
- Programming-logic MCQs, **pseudocode output-prediction** items (Infosys/Capgemini/Accenture/Zoho
  signature), CS fundamentals, and **domain fundamentals** (Accenture: networking/security/cloud;
  Cognizant: SQL; Accenture: MS-Office/common-applications).

### 4.3 `coding_test` / `advanced_coding` (NEW — real code execution + judge)
- Monaco-style editor; language set per blueprint (respect **Capgemini: no Python**; Wipro/TCS/Infosys
  language lists). Run against **visible + hidden test cases** with **partial scoring**.
- Difficulty ladder per company (Infosys E/M/H; Amazon LC-medium + LC-hard; Zoho hard-single).
- **`advanced_coding` "build-an-application"** (Zoho): a mini product/design task graded on structure,
  correctness, and design reasoning (LLM-assisted rubric + optional runnable checks).
- **Execution options for the build prompt:** a sandboxed judge (e.g., Judge0-style) or, at minimum,
  hidden-test evaluation; document both so Claude Code can pick per deployment constraints.

### 4.4 `game_based_aptitude` (NEW — Cognizant, Capgemini)
- A small library of **cognitive mini-games** with **leveling** (difficulty rises per level; higher
  levels score more), mirroring the real pools: Deductive/Geo-Sudo (fill a 4×4/5×5/6×6 grid, a shape
  once per row/column), Grid Challenge, **Switch Challenge** (shapes pass through code-switches), Motion
  Challenge, Digit Challenge, Inductive reasoning. Capgemini: **draw 4 of a 24-pool**; Cognizant: fixed
  set. Score = max level reached × per-level weight. (These test visual reasoning, decoding, multitasking,
  memory — grade on level + accuracy + speed.)

### 4.5 `voice_assessment` (NEW — Wipro; Capgemini/Cognizant spoken) — SIGNATURE DIFFERENTIATOR
- Sub-tasks: **read-aloud** a passage, **describe an image** (~60–90s), **speak on a topic** (~90s),
  **repeat-after-audio** (played once), **listen-and-type dictation.**
- Capture audio → score **pronunciation, fluency, pace, filler-word rate, grammar, content coverage,
  relevance.** (Pipeline: speech-to-text + prosody/fluency features + LLM content grading; document a
  fallback that grades transcript-only if audio infra is unavailable.)
- Coaching: filler-word count, WPM target, mispronounced words, structure tips.

### 4.6 `written_communication` (NEW — Wipro essay, Capgemini WET)
- Timed essay/email editor; **grammar/coherence/vocabulary/structure grading (LLM + rules).**
- **Wipro mistake-threshold rule:** count mistakes; beyond the threshold apply negative marking.

### 4.7 `behavioral_survey` (NEW — Amazon LP, Accenture behavioral)
- **Leadership-Principles / work-style most-least items** (present a scenario, pick most-like-you and
  least-like-you), scored for consistency and LP-alignment (Amazon's 16 LPs; Accenture's traits).

### 4.8 `work_simulation` (NEW — Amazon)
- Virtual-office scenarios: respond to emails, prioritize tasks, minor debugging; graded on judgment
  + LP alignment. (Composes `q_situational_star` + `q_case_study` styles into an Amazon skin.)

### 4.9 `technical_interview` / `managerial_interview` / `hr_interview` (REUSE modules)
- `technical_interview` → `q_technical_domain` (branch-routed) + `q_resume_based`, adaptive follow-ups.
- `managerial_interview` → `q_situational_star` + `q_stress_curveball` + `q_case_study` (TCS MR skin).
- `hr_interview` → `q_hr_behavioral` + `q_career_motivation` + `q_culture_fit` + `q_salary_expectation`
  + `q_candidate_questions`, all already tested. Company skin sets tone/values.

### 4.10 `system_design` (NEW — product/premium, senior/L5+)
- HLD/LLD prompt + rubric (requirements, components, data flow, scaling, trade-offs). LLM-graded with a
  structured checklist. Branch on level (only surfaced for L5+/SDE-2/experienced).

### 4.11 `bar_raiser` (NEW — Amazon; Microsoft "AA"; adapted) — SIGNATURE DIFFERENTIATOR
- A **different-team senior persona** that goes **deep on behavior/LPs**, probes with escalating
  follow-ups, and holds a **veto**: a weak Bar Raiser result caps the outcome regardless of coding.
- Uses `q_hr_behavioral` + `q_situational_star` + `q_stress_curveball` with an **LP-depth rubric** and
  a "raise-the-bar" scoring stance (stricter than a normal HR round).

### 4.12 `group_discussion` (REUSE `q_group_discussion`) — some service companies.

### 4.13 `hiring_committee` (NEW — Google) — modeled as an OUTCOME step, not a live round
- After the loop, assemble a **packet** (per-round scores + notes) and run a **committee verdict** on
  Google's 6-point scale, returning hired / team-match / more-interviews / rejected. A faithful, unique
  finale.

---

## PART 5 — PLATFORM LOOK-AND-FEEL EMULATION (the authenticity skins)

A **platform-skin registry** gives each real assessment platform a visual + behavioral profile so the
test *feels* like the real one. Skin = header/branding, section-navigator UI, timer placement, palette,
question-panel layout, calculator widget, and the enforced rules.

- **`tcs_ion`** — TCS iON centre look; locked-forward navigator; on-screen calculator; tab-switch=terminate; question-locking.
- **`amcat`** — adaptive feel; single-question focus; no back-navigation.
- **`cocubes`** — Accenture NLT; section list with sectional gates; navigation allowed within rules; no negative marking.
- **`superset`** — Wipro/Cognizant/Capgemini campus portal; multi-section; used to launch OA + voice/game modules.
- **`hackerrank_style` / `codility_style`** — Amazon/Microsoft/Infosys coding console; editor + test-case runner + partial score.
- **`proctored_meet`** — Zoho/phone-screen style; screen-share + one-problem focus.
- **`custom`** — generic PrepVista skin for companies without a known platform.

Each skin is data-driven (a JSON profile the frontend reads), so new companies reuse an existing skin.

---

## PART 6 — TRACK / TIER PREDICTION (the "before the actual day" payoff)

The `outcome_model` per blueprint converts sectional performance into the company's **real** branching,
and states the **gap to the next track**. Examples:

- **TCS:** cognitive percentile → Ninja gate; + advanced-section performance → Digital vs Prime. Output:
  "You're tracking **Digital**; to reach **Prime**, lift Advanced Coding by ~1 problem / raise reasoning percentile."
- **Infosys:** overall coding score vs sectional cutoffs → SE vs DSE vs SP. "You cleared 2/3 problems →
  **DSE** track; solve the DP problem to reach **SP**."
- **Wipro:** aptitude + coding + essay + voice → Elite vs Turbo vs Velocity. "Voice + essay strong,
  coding borderline → **Turbo**; clear both coding problems → **Elite**."
- **Cognizant:** #coding solved (+ certification) → GenC / Pro / Next. "Solved 3/5 → **GenC**; solve 5 or add a
  ServiceNow/Salesforce/CyberSecurity cert → **GenC Pro/Next**."
- **Capgemini:** coding-round performance → Analyst vs Senior Analyst. "Coding = Analyst tier; both problems
  clean → **Senior Analyst**."
- **Amazon / Microsoft:** per-round rubric + **Bar Raiser/AA** → **Strong hire / Hire / No hire**. "Coding: Hire;
  Bar Raiser: borderline on Dive-Deep → overall **Leaning hire**; add measurable impact to 2 LP stories."
- **Google:** packet → committee 6-point verdict → hired / team-match / more-interviews / rejected, plus
  which of the 4 attributes was weakest.

Output contract per session: `predicted_track`, `confidence`, `gap_to_next_track` (concrete actions),
`cleared_gates[]`, `failed_gate` (if eliminated), and `attribute_breakdown`.

---

## PART 7 — CONTENT STRATEGY (how the sim always has fresh, correct material)

- **Aptitude / pseudocode:** parametric generators (template + randomized values) guarantee infinite,
  auto-gradable items with correct keys — no repetition, no LLM hallucination risk on the answer key.
- **Coding:** a company-tagged problem bank (by difficulty ladder) + LLM-generated variants validated
  against hidden tests before serving; dedup via the existing embedding cosine-reject (≥0.85).
- **Interview rounds:** reuse the 15 tested modules (already have real content libraries + rubrics);
  the company skin only re-weights categories, difficulty, tone, and values.
- **Exotic rounds (voice/game/work-sim/LP):** curated task banks + generators per Part 4, each with an
  objective or rubric-based grader.
- **Company facts:** the blueprint stores values, packages, recent changes, and a **format-confidence +
  last-verified** stamp; a lightweight refresh loop (search + human review) keeps them current.
- **Grounding, not fine-tuning:** an un-fine-tuned Groq model is steered by the blueprint + banks +
  rubrics; graceful static fallback (per existing `llm_config.json`) means a session never breaks.

---

## PART 8 — THE ROSTER: SCALING TO HUNDREDS (the revenue engine)

**Principle:** breadth is the product's compounding asset and its moat. The blueprint schema makes
adding a company a *data* task, not a code task. Tiering the roster by depth lets breadth scale fast
while keeping fidelity honest.

- **Tier A — Full-fidelity (hand-verified):** the 11 named companies here + the next ~30–40 highest-
  volume campus recruiters. Every field verified, `format_confidence ≥ 0.85`, exotic rounds modeled.
- **Tier B — Template-mapped (archetype default + light verification):** hundreds of companies mapped
  to an archetype template (mass_service / product / analytics / core / unique) with known package
  bands and platform, `format_confidence` 0.5–0.75, flagged "verify before your drive."
- **Tier C — Generic archetype (from `companies.json`, 600+ names):** any company not yet detailed runs
  the closest archetype template so a student always gets a *relevant* simulation; shown with a clear
  "generic format" badge and an invite to request full modeling (demand signal → prioritize Tier A/B).

**Archetype templates (defaults a company inherits until hand-verified):**
- `mass_service` → OA (aptitude + technical MCQ/pseudocode + 1–2 coding) → Technical Interview → HR;
  platform Superset/CoCubes/HackerRank-style; packages ~₹3.5–7.5 with tracks.
- `product` → OA (2 DSA + sometimes debugging) → 2–3 technical/DSA interviews → HR; HackerRank-style.
- `premium_product` → OA/phone screen → DSA loop + system design → behavioral/committee/bar-raiser.
- `analytics` → aptitude+stats → case/guesstimate → SQL/ML technical → HR.
- `core` (mech/civil/eee/ece) → aptitude + domain MCQ → domain technical → HR.
- `unique` → bespoke (Zoho-style); always Tier A.

This directly ties to revenue: a campus's visiting companies are mostly Tier A/B; Tier C guarantees no
"company not found" dead-ends; the "request modeling" button converts demand into roadmap.

---

## PART 9 — INTEGRATION WITH THE EXISTING PREPVISTA ENGINE (reuse, don't rebuild)

Feature #01 is a **composition layer** over what already exists:
- **Question modules (15, tested):** reused as round simulators for interview/HR/GD/situational.
- **`base.py` contracts:** `StudentProfile`, `QuestionContext`, `GeneratedQuestion`, `AnswerContext`,
  `EvaluationResult`, `DifficultyController`, `LLMClient`/`DedupService`/`SessionStore` protocols.
- **`scoring.py` + `scoring_config.json`:** per-round scores roll into the 7 pillars + PRI; the company
  report adds the round-timeline + track prediction on top.
- **`categories.json` / `competencies.json` / `difficulty_config.json`:** category→pillar→competency
  mapping and adaptive difficulty carry straight over.
- **`interview_blueprints.json`:** the *rapid 14-category* blueprints stay as "general practice";
  Feature #01 adds **company blueprints** as a new, parallel blueprint type (company mode vs practice mode).
- **`integrity_config.json` + `integrity_monitor.py`:** power the proctoring layer (tab-switch policy per company).
- **`llm_config.json`:** the Groq model roster, per-purpose sampling, retry/breaker, dedup, and static
  fallback run every generated item and every rubric grading.
- **`feedback_config.json`:** extended with company-mode sections (round timeline, predicted track, gates).
- **New data files to add:** `company_blueprints/*.json` (one per company), `platform_skins.json`,
  `outcome_models/*.json` (or embedded), plus the exotic-round content banks/generators.
- **New services to add:** company session orchestrator, sectional-timer engine, negative-marking
  engine, code-execution/judge service, voice-assessment pipeline, game-based modules, track resolver.

---

## PART 10 — WHY COMPETITORS FAIL TO REPLICATE (the moat, concretely)

1. **The encoding wall.** Copying "simulate companies" is easy; encoding 40+ blueprints with dozens of
   verified fields each, per cycle, is a sustained research operation. The schema + roster is the asset.
2. **The exotic-round wall.** A generic LLM chat cannot fake a leveling game, a scored voice assessment,
   a work-simulation, a build-an-application judge, a Bar-Raiser veto, or a hiring-committee packet.
   Each needs a purpose-built simulator + rubric. PrepVista already owns 15 tested modules + scoring to
   compose from; a newcomer starts from zero.
3. **The environment wall.** Sectional timers, question-locking, tab-switch termination, negative-marking
   variants, platform skins — the *test conditions*, not just questions. Hard to fake convincingly.
4. **The outcome wall.** Faithful track/tier prediction (Ninja/Digital/Prime, Elite/Turbo, GenC/Pro/Next,
   Analyst/Senior, Hire/No-Hire, committee verdict) requires the deep format model *and* a calibrated
   mapping. This is the "before the actual day" magic and is downstream of everything above.
5. **The flywheel wall.** Consented, aggregated session data continuously recalibrates difficulty and
   refreshes format confidence, and feeds Layers 02/03. A late entrant has neither the corpus nor the loop.
6. **The integration wall.** Because it reuses a tested engine (modules + scoring + integrity + LLM
   hardening), PrepVista ships fidelity fast; a competitor must build the whole substrate first.

**Net:** the feature is defensible not because any single piece is secret, but because the *composition*
— verified format corpus × purpose-built exotic simulators × authentic environment × outcome model ×
data flywheel × reused tested engine — is expensive, cumulative, and cycle-perishable to reproduce.

---

## PART 11 — BUILD SEQUENCE FOR CLAUDE CODE (recommended order)

1. **Schema + data:** implement `company_blueprint` + `round` models; encode the 11 Tier-A blueprints
   from Part 2; add `platform_skins.json` and archetype templates (Part 8).
2. **Company Session Orchestrator:** blueprint interpreter that walks rounds, applies gates/timers,
   persists `CompanySessionRecord`.
3. **Engine services:** sectional-timer engine, negative-marking engine, question-locking/attempt state,
   proctoring hook into `integrity_monitor`.
4. **Reused interview simulators:** wire the 15 modules as `technical_interview` / `managerial_interview`
   / `hr_interview` / `group_discussion` / `behavioral_survey` bases with company skins.
5. **Net-new simulators (in impact order):** `coding_test`/`advanced_coding` (judge) → `game_based_aptitude`
   → `voice_assessment` → `written_communication` → `work_simulation` → `system_design` → `bar_raiser`
   → `hiring_committee` (outcome).
6. **Parametric generators:** aptitude + pseudocode item generators with correct keys.
7. **Track/Outcome Resolver:** per-blueprint `outcome_model` → predicted track + gap-to-next.
8. **Company report:** extend `feedback_config` with round timeline + predicted track + gates + coaching.
9. **Frontend:** platform skins (timer, navigator, editor, calculator), voice capture, game canvases,
   the round-timeline result view, and the roster with A/B/C badges + "request modeling."
10. **Roster expansion:** Tier-B/C mapping over `companies.json`; the "verify/last-updated" surfacing.

---

## PART 12 — OPEN ITEMS / VERIFY-BEFORE-SEASON

- **HCLTech** current-cycle format has the thinnest public 2026 detail — verify before relying on it.
- **TCS Foundation negative marking** varies by cycle — keep the per-cycle flag; default off.
- **Coding execution infra** (sandbox judge vs hidden-test-only) is a deployment choice — document both.
- **Voice-assessment infra** (full audio pipeline vs transcript-only fallback) — document both.
- **AI-assistance policy** differs by company (Google forbids; some allow AI-assisted coding) — model a
  per-company `ai_assistance_allowed` flag so the sim mirrors the real rule.
- **All formats are cycle-perishable** — the format-confidence + last-verified stamps and a refresh loop
  are part of the product, not an afterthought.

---
*End of dossier. Companion files: `01_CLAUDE_CODE_MASTER_PROMPT.md` (the build prompt) and*
*`02_COMPANY_ROSTER.md` (Tier A/B/C roster + archetype mapping).*

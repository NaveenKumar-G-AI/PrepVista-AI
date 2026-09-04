# PrepVista AI — Complete Codebase Feature Catalogue

This document is the single source-verified inventory of product, platform, operational, test, prototype, research, and legacy capabilities in this repository. It is written in the requested format: every item has a feature headline, a concise explanation of what exists, and why it matters or should be demonstrated.

**Verification date:** 1 September 2026

**Repository scope:** `C:\PrepVista-AI` only

## 1. Coverage and interpretation

The catalogue was built from the tracked repository rather than from marketing copy:

| Coverage measure | Verified count |
|---|---:|
| Tracked files inventoried | 1,177 |
| Tracked text/code files scanned | 1,129 |
| Tracked text/code lines scanned | 273,011 |
| Main router HTTP/WebSocket operations | 184 |
| Direct application route definitions | 4 (`/` supports both GET and HEAD) |
| Next.js page routes | 45 |
| Redirect-only compatibility pages | 5 of 45 |
| Main PostgreSQL migrations | 35 |
| SQL table declarations across those migrations | 90 |
| Primary Python test functions discovered | 203 |
| Standalone `tpodashboard` parts | 17 |

The scan covers source, configuration, migrations, tests, deployment files, documentation, generated reference inventories, and standalone prototypes. Minified third-party vendor files are classified by their integration purpose; they are not presented as PrepVista-authored features.

### Status legend

| Status | Meaning |
|---|---|
| **Live UI + API** | A current first-party screen calls a current main-backend endpoint. |
| **Live API** | Mounted in the production FastAPI application, but no current first-party screen exposes the complete capability. |
| **Live internal** | Used automatically by the deployed application without a dedicated screen. |
| **UI only** | A current screen or interaction exists, but the named operation is not persisted by a backend call. |
| **Tested library** | Implemented and tested in the main `app` tree, but not mounted in the current API or frontend. |
| **Redirect** | Compatibility URL that forwards to another current page; not an independent feature. |
| **Operations / QA** | Deployment, reliability, security, maintenance, or verification capability. |
| **Reference prototype** | Standalone source bundle that is not imported by the deployed app. |
| **Research / content** | Knowledge base, question bank, market file, or design source; not executable product behavior. |
| **Legacy / artifact** | Archived implementation or build/debug output; not a current feature. |

The status column is essential. A feature being present somewhere in the repository does **not** automatically mean it is available in production.

## 2. Public product and shared user experience

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 1 | Dual candidate-and-college platform | One application serves individual candidates, organization-managed students, college placement teams, and platform administrators with role-specific workspaces. | Establishes that PrepVista is both a B2C interview product and a B2B placement operating system. | Live UI + API |
| 2 | Public landing experience | The landing page explains resume-personalized, voice-first interview practice, coaching outcomes, audiences, privacy, and calls to action. | Gives a visitor an immediate, complete explanation of the product promise. | Live UI + API |
| 3 | Live public growth evidence | Landing, login, and pricing pages load persisted public-growth and launch-offer counters rather than substituting generated numbers. | Demonstrates real usage and launch momentum without fabricating social proof. | Live UI + API |
| 4 | Product funnel telemetry | Landing views, CTA clicks, pricing views, and upgrade intent are normalized and stored through `/events/track`. | Shows that acquisition and conversion behavior can be measured and improved. | Live UI + API |
| 5 | Public pricing comparison | Free, Pro, and Career cards explain limits, benefits, ownership state, expiry state, switching, and purchase actions. | Converts the intelligence stack into understandable commercial choices. | Live UI + API |
| 6 | Referral invitation landing | A public referral code resolves inviter context and lets a visitor reserve an email before signup. | Demonstrates a measurable, reward-linked growth loop. | Live UI + API |
| 7 | Privacy and Terms pages | Shared legal-page infrastructure renders dated Privacy and Terms documents with consistent navigation. | Demonstrates that candidate data and commercial terms are addressed visibly. | Live UI |
| 8 | Role-aware navigation | Individual, organization-student, organization-admin, and platform-admin users receive different side rails, home routes, and protected-page redirects. | Makes the multi-role product understandable and prevents users entering the wrong workspace. | Live UI + API |
| 9 | Organization-student navigation | The student rail provides college-managed practice, sessions, analytics, reports, messages, profile, and settings without individual purchase controls. | Shows the managed student experience as distinct from self-serve billing. | Live UI + API |
| 10 | Dark and light themes | A shared theme context persists the chosen appearance and applies it across the application. | Demonstrates usability and personal preference support across long practice sessions. | Live UI |
| 11 | Shared brand and ambient system | Brand logo, authenticated header, background effects, icons, selectors, confirmation dialogs, and reusable chart wrappers create a consistent shell. | Demonstrates that features belong to one coherent product rather than disconnected pages. | Live UI |
| 12 | Loading, empty, error, and retry states | Major routes render explicit loading, no-data, failure, disabled-submit, confirmation, and retry states. | Proves the UI handles real operational conditions, not only ideal demo data. | Live UI + API |
| 13 | In-app support access | Authenticated non-platform-admin users can open a support thread, send text or a compressed JPEG attachment, and read replies. | Demonstrates an embedded customer-support loop without leaving the product. | Live UI + API |
| 14 | Client service-awake keeper | A shared component calls the frontend heartbeat route so the deployment can remain responsive. | Reduces cold-start friction in demonstrations and ordinary use. | Live internal |
| 15 | Legacy organization-route compatibility | Five old organization URLs redirect to current analytics, communications, interviews, or access pages. | Preserves old bookmarks while keeping only one active implementation for each capability. | Redirect |

## 3. Identity, authentication, authorization, and account lifecycle

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 16 | Existing-account check | `/auth/account-status` tells the login/signup flow whether a PrepVista profile already exists for an email. | Prevents confusing duplicate-account flows. | Live UI + API |
| 17 | Email-and-password login | Credentials are authenticated through Supabase and resolved to the canonical PrepVista profile. | Demonstrates the primary repeat-user entry path. | Live UI + API |
| 18 | Verified manual signup | Signup requires a server-issued six-digit email code before account creation. | Prevents unverified or mistyped identities entering the platform. | Live UI + API |
| 19 | Verification-code abuse controls | Codes have expiry, resend delay, attempt limits, locking, hashing, and dedicated storage. | Demonstrates that signup verification is security logic, not a decorative form step. | Live API |
| 20 | Gmail API or Resend delivery | Verification and account notification email can use Gmail API credentials or Resend, with configuration validation. | Makes the signup flow deployable across different email-provider setups. | Live internal |
| 21 | Deliverable-email validation | Address normalization, DNS/deliverability checking, common-provider typo rejection, fake-pattern rejection, and disposable-domain blocking run before accepting identities. | Reduces fake accounts and failed communications. | Live internal |
| 22 | Google OAuth | The frontend exchanges the OAuth callback with Supabase and completes backend profile resolution. | Provides a low-friction sign-in alternative. | Live UI + API |
| 23 | Canonical cross-provider identity | `auth_identity_links` and the identity service map email/password and OAuth identities to one profile. | Prevents duplicate users when the same person changes login method. | Live internal |
| 24 | Token refresh and session restoration | A persisted refresh token can restore a missing short-lived access token after a new tab or browser restart. | Demonstrates continuity without asking the user to log in repeatedly. | Live UI + API |
| 25 | Concurrent refresh deduplication | Only one token-refresh request is allowed in flight when multiple API calls receive 401 at once. | Prevents a refresh storm and inconsistent token state. | Live internal |
| 26 | Cross-tab logout | Removal of the refresh token in one tab clears in-memory authentication in other tabs and redirects protected pages. | Closes the forgotten-open-tab session window. | Live internal |
| 27 | Client JWT-shape guard | Malformed access-token strings are cleared rather than injected into the Authorization header. | Prevents corrupted or injected local values from becoming request headers. | Live internal |
| 28 | Onboarding goal capture | New users can persist their name and preparation goal before entering the main workspace. | Gives personalization a meaningful user objective from the beginning. | Live UI + API |
| 29 | Current-user context | `/auth/me` returns role, plan, organization, quota, and account data used for navigation and feature gating. | Demonstrates that all workspaces are driven by one authoritative identity payload. | Live UI + API |
| 30 | Main-admin authorization | Platform routes require platform-admin privileges, with a limited premium-override exception only for the main console. | Demonstrates explicit separation of platform operations from normal users. | Live API |
| 31 | Organization-admin authorization | College routes resolve active organization membership and organization identity before data access. | Enforces the institutional workspace boundary. | Live API |
| 32 | Tenant-scoped organization data | College, student, recruiter, drive, interview, offer, communication, and report queries are scoped by organization. | Prevents one college from reading or modifying another college's data. | Live API |
| 33 | Row-level security foundation | Core profile, interview, billing, referral, feedback, support, and plan tables have PostgreSQL RLS policies. | Adds a database-level boundary beneath application checks. | Live internal |
| 34 | Profile and access overview | The profile page shows identity, plan ownership, quota/reset data, recent billing, shortcuts, and support contact. | Gives users one place to understand their account and access. | Live UI + API |
| 35 | Personal settings | Users can change theme, inspect billing/access state, sign out, and reach support or pricing. | Demonstrates self-service account control. | Live UI + API |
| 36 | Privacy-aware account deletion | Account deletion removes live account data, archives only a minimal identity record, and includes later pseudonymization/erasure support. | Demonstrates a concrete user-controlled privacy lifecycle. | Live UI + API |
| 37 | Platform-granted tier access | An administrator can grant, revoke, or set tier-isolated unlimited access markers without changing unrelated tiers. | Supports controlled support, promotion, and remediation workflows. | Live UI + API |
| 38 | Organization-admin user lifecycle | Platform admins can create, list, inspect, update, enable, disable, and reset organization-admin accounts. | Demonstrates delegated college administration with central control. | Live UI + API |

## 4. Resume intelligence and interview preparation

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 39 | Resume-led interview setup | The active setup screen uploads a resume, selects an unlocked plan and difficulty, checks quota, and creates a session. | Establishes that the interview is prepared for the candidate rather than selected from a generic list. | Live UI + API |
| 40 | Multi-format resume ingestion | The backend accepts PDF, DOCX, legacy DOC, and supported image formats; the current first-party setup picker intentionally exposes PDF only. | Shows broader ingestion capability while accurately distinguishing it from the present UI. | Live API |
| 41 | Upload size and request guards | Header and actual-byte checks enforce the resume limit, while global body-size middleware rejects oversized requests. | Prevents memory-exhaustion uploads and gives clear user errors. | Live API |
| 42 | File-type spoofing defense | Magic bytes and content-type-aware validation reject files renamed to appear as PDF, Word, or image resumes. | Demonstrates safe handling of untrusted uploads. | Live internal |
| 43 | Native PDF and DOCX extraction | Text resumes are parsed directly with dedicated PDF and Word libraries. | Covers the formats most candidates already use. | Live internal |
| 44 | Legacy DOC conversion | LibreOffice headless conversion handles older `.doc` resumes in the production container. | Prevents older institutional documents from blocking a session. | Live internal |
| 45 | Image and scanned-PDF OCR | Tesseract and Poppler extract content from photographed or image-only resumes. | Demonstrates accessibility to real-world, imperfect resume files. | Live internal |
| 46 | Resume extraction quality gate | Empty, unreadable, or too-short extracted text is rejected with a meaningful response instead of silently producing a generic interview. | Avoids false personalization from unusable input. | Live API |
| 47 | Resume prompt-injection screening | Suspicious embedded instructions are detected and logged without letting resume text override system behavior. | Demonstrates that uploaded documents cannot instruct the evaluator to award favorable results. | Live internal |
| 48 | Structured resume understanding | The parser extracts candidate identity, field, projects, skills, tools, education, and experience into a safe summary. | Supplies concrete facts for question grounding and evaluation. | Live internal |
| 49 | Graceful resume fallback | If advanced parsing fails, bounded inference/default logic still builds a usable profile instead of leaving the user stranded. | Keeps the primary interview flow resilient. | Live internal |
| 50 | Department normalization | Free-text values such as CSE, AI&DS, E&CE, Mechanical, degree-prefixed names, and other aliases map to canonical branches. | Makes bulk college data usable despite inconsistent naming. | Live internal |
| 51 | Safe generic branch fallback | An unknown department is flagged for review and routed to a general technical module rather than crashing or blocking the CSV batch. | Demonstrates operational tolerance without inventing a branch. | Live internal |
| 52 | Eight branch-specific technical modules | CSE, AI & Data Science, AI & ML, ECE, EEE, Mechanical, Civil, and Cybersecurity each have ten technical categories; a six-category general fallback also exists. | Shows that technical assessment is meaningful outside generic software questions. | Live internal |
| 53 | Four difficulty modes | Auto, Basic, Medium, and Difficult alter planning and live-question pressure. | Lets users choose confidence-building practice or a more demanding simulation. | Live UI + API |
| 54 | Plan-specific interview personalities | Free uses a friendly coach, Pro a senior technical interviewer, and Career an advanced hiring panel. | Makes commercial tiers visibly different in behavior, not only in quotas. | Live internal |
| 55 | Planned category coverage | The planner balances introduction, technical depth, project ownership, communication, problem solving, behavioral, situational judgment, creative thinking, and AI-tool fluency. | Demonstrates deliberate assessment coverage instead of random prompts. | Live internal |
| 56 | Plan-specific coverage depth | Free targets 3 universal plus 1 technical category, Pro 5 plus 2, and Career 6 plus 3 within their turn budgets. | Shows how longer plans buy broader evidence, not filler conversation. | Live internal |
| 57 | Resume-grounded opening question | The first active question is generated from the parsed profile and chosen plan/difficulty. | Creates an immediate proof of personalization. | Live UI + API |
| 58 | First-question prefetch | The question plan and opening question are prepared during setup so the live route starts without another model wait. | Improves the most visible latency point in a demo. | Live internal |
| 59 | Placement-drive setup concurrency cap | A semaphore limits simultaneous CPU-heavy parsing and model planning when many students start together. | Demonstrates engineering for college-scale bursts rather than single-user demos. | Live internal |

## 5. Adaptive interview runtime and voice infrastructure

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 60 | Live voice interview chamber | The current route provides microphone validation, live transcript, waveform, silence timer, elapsed time, interviewer state, questions, answer submission, and transcript history. | It is the central experiential proof of the product. | Live UI + API |
| 61 | Browser speech-recognition path | The frontend can capture and submit browser-recognized speech with hardware-state feedback. | Provides a direct voice experience with minimal round-trip overhead. | Live UI |
| 62 | Server-side STT feature flag | A controlled switch enables WebSocket and REST server transcription without forcing every deployment onto it. | Supports gradual rollout and safe fallback between speech architectures. | Live API |
| 63 | Groq Whisper transcription | Server audio can be transcribed with `whisper-large-v3` as the primary STT engine. | Demonstrates production-grade speech recognition independent of browser APIs. | Live API |
| 64 | Deepgram fallback | Deepgram Nova-2 is used as an optional secondary provider when configured and the primary path fails. | Reduces single-provider voice failure risk. | Live internal |
| 65 | Spoken-language normalization | STT language hints are normalized before provider use. | Improves predictable transcription behavior across clients. | Live internal |
| 66 | Transcript normalization | Speech output is cleaned into stable text before it reaches the interview and evaluator. | Prevents formatting/noise artifacts from affecting scoring. | Live internal |
| 67 | Resume-context transcript repair | Misheard colleges, companies, tools, projects, and technical terms can be repaired against known candidate context. | Demonstrates that candidates are judged on intended knowledge rather than microphone errors. | Live internal |
| 68 | Transcript-repair guardrails | Repairs are rejected if empty, preamble-contaminated, excessively expanded, or meaningfully unsafe. | Prevents an AI repair step from rewriting what the candidate actually said. | Live internal |
| 69 | Transcript-repair audit | Original and corrected text plus repair context can be retained for review. | Makes correction behavior disputable and explainable. | Live internal |
| 70 | Private interview-audio storage | Audio chunks and turn records are stored in a private Supabase bucket with session/turn paths. | Creates a reviewable evidence trail without public recordings. | Live internal |
| 71 | Time-limited audio access | Audio review uses signed URLs with bounded lifetime and configured retention. | Demonstrates privacy-preserving dispute resolution. | Live internal |
| 72 | Answer-led follow-up questions | The next question uses facts from the actual answer, previous question, resume, and planned category. | Proves that the AI is listening rather than reading a fixed questionnaire. | Live UI + API |
| 73 | Grounded follow-up language | Heuristics and tests reject vague follow-ups such as generic “that work” references when concrete context exists. | Makes personalization visible and reduces uncanny interviewer behavior. | Live internal |
| 74 | Adaptive live difficulty | Answer strength, silence, difficulty mode, and session context influence follow-up pressure and wording. | Demonstrates a realistic interviewer that responds to performance. | Live internal |
| 75 | Follow-up depth limits | Free allows lighter probing while Pro and Career support deeper answer exploration. | Makes plan differentiation observable during the conversation. | Live internal |
| 76 | Clarify/repeat without losing a turn | A request to repeat or explain the question returns a clarification while preserving the current turn and evaluation target. | Shows humane interview behavior and correct accounting. | Live UI + API |
| 77 | Silence retry policy | A no-answer timeout can simplify/retry the same question up to the plan limit before closing it. | Handles nervous pauses without immediately wasting the session. | Live UI + API |
| 78 | Explicit early finish | A user-requested end closes the interview cleanly and produces the available summary/report. | Gives the candidate control without corrupting session state. | Live UI + API |
| 79 | Session access tokens | Each interview receives a session-scoped access token validated with the authenticated user and session state. | Prevents guessing an ID and controlling another session. | Live API |
| 80 | Idempotent answer submission | A client request ID makes retried submissions return the same result instead of creating duplicate turns. | Protects sessions from mobile/network retries and double-clicks. | Live UI + API |
| 81 | Stable turn/evaluation alignment | Active question turn, conversation rows, and unique `(session, turn)` evaluation constraints keep feedback attached to the correct answer. | Prevents the most damaging logical error: grading one answer against another question. | Live internal |
| 82 | Background evaluation throttling | Answer evaluation is scheduled separately with concurrency limits and duplicate checks. | Keeps the conversation responsive while preventing model-rate spikes. | Live internal |
| 83 | Session-level novelty | Recent question signatures are stored in memory/Redis and used to reject exact or near repeats. | Makes each turn add new evidence. | Live internal |
| 84 | Cross-session topic cooldown | Prior sessions influence the next plan so returning candidates cover new categories over time. | Demonstrates a long-term practice curriculum rather than repeated first interviews. | Live internal |
| 85 | Deterministic session variation | A user/session/plan seed rotates valid question families and target variants reproducibly. | Gives students different interviews while retaining debuggability. | Live internal |
| 86 | Multi-provider interview generation | Groq is the primary model path and OpenAI is available as fallback; a common model-provider interface also includes OpenRouter, mock, and disabled stubs. | Reduces dependency on one LLM and standardizes provider behavior. | Live internal |
| 87 | Groq resilience layer | Key rotation, token-bucket limiting, prompt caching, retry/backoff, jitter, and circuit breaking protect model calls. | Demonstrates readiness for burst traffic and provider instability. | Live internal |
| 88 | Provider health diagnostics | College administrators can retrieve all-provider or single-provider health status. | Gives operations a fast explanation when AI features degrade. | Live UI + API |
| 89 | Interview integrity monitoring | Client events can be logged as non-terminal violations, capped against spam, or used to terminate a session for a hard violation. | Supports credible assessment and reviewable proctoring. | Live UI + API |
| 90 | Practice-versus-proctoring mode | Session state records the selected proctoring mode and applies normalized integrity behavior. | Separates supportive practice from stricter institutional use. | Live API |

## 6. Evaluation, coaching, readiness, and reports

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 91 | Per-answer evaluation | Each completed answer is assessed against its question, rubric category, plan, resume context, timing, and normalized transcript. | Converts conversation into structured evidence. | Live API |
| 92 | Content-versus-delivery analysis | Technical/content quality and communication/delivery are evaluated separately. | Distinguishes knowing the answer from expressing it effectively. | Live UI + API |
| 93 | Relevance analysis | The evaluator measures whether the answer actually addresses the asked question. | Proves semantic understanding rather than word-count scoring. | Live UI + API |
| 94 | Technical accuracy and depth | Domain correctness and depth are scored with plan-appropriate strictness. | Demonstrates the core professional-assessment value. | Live UI + API |
| 95 | Clarity and structure | Feedback captures how clearly and logically the candidate communicates. | Turns a vague speaking problem into an actionable skill. | Live UI + API |
| 96 | Specificity and evidence | The system rewards concrete examples, ownership, methods, and outcomes rather than generic claims. | Encourages interview answers that hiring panels trust. | Live UI + API |
| 97 | Answer quality classification | Answers can be classified into meaningful quality/status groups instead of exposing only a number. | Makes the result easier for candidates and TPOs to interpret. | Live UI + API |
| 98 | Low-quality answer flags | Too-short, filler-heavy, keyboard-mash, low-alphabetic, timeout, and related states are recorded explicitly. | Prevents misleading scores from unusable evidence. | Live API |
| 99 | Evidence-grounded strengths | Strengths must be traceable to the answer/resume facts; low-value generic praise is filtered. | Makes coaching defensible and personal. | Live UI + API |
| 100 | Root-cause improvement guidance | Feedback identifies the missing specificity, structure, depth, relevance, or family-specific signal behind a weak answer. | Converts diagnosis into a precise next action. | Live UI + API |
| 101 | Grounded better answer | Pro/Career can receive a stronger answer built only from available candidate facts, with placeholder and invented-metric suppression. | Demonstrates useful rewriting without fabricating experience. | Live UI + API |
| 102 | Honest answer suppression | If evidence is too thin to build a truthful model answer, the evaluator explains the limitation instead of inventing one. | Protects user trust and report integrity. | Live internal |
| 103 | Corrected-intent answer | Eligible plans can see a cleaned representation of what the candidate intended to communicate. | Helps separate transcript noise from communication coaching. | Live UI + API |
| 104 | Answer blueprint | Career feedback can provide a question-family-specific structure such as STAR or technical explanation sequencing. | Gives the user a reusable method, not only a rewritten sentence. | Live UI + API |
| 105 | Response-time intelligence | Per-answer response time and session-level timing statistics influence guidance where evidence exists. | Adds delivery and composure insight beyond text correctness. | Live UI + API |
| 106 | Deterministic score normalization | Metrics are clamped and rescaled consistently, including legacy ten-point records. | Keeps dashboards, reports, and historical data comparable. | Live internal |
| 107 | Session summary | Finish logic composes score, answered/planned/closed counts, strengths, improvements, next step, and plan-specific analysis. | Gives the candidate a useful outcome immediately after the final turn. | Live UI + API |
| 108 | Skill-score history | Per-session category measurements are synchronized into user skill history. | Enables growth analysis across multiple interviews. | Live internal |
| 109 | Placement Readiness Score | Category evidence is rolled into weighted placement pillars and a 0–100 readiness score, renormalizing when some pillars are absent. | Gives candidates and colleges a single decision-ready readiness measure without treating missing data as zero. | Live UI + API |
| 110 | Readiness tiers | Ready, Almost Ready, Developing, At Risk, and insufficient/not-started states are derived consistently. | Makes readiness immediately understandable at individual and cohort level. | Live UI + API |
| 111 | Company hiring-probability curves | Readiness evidence is translated into bounded probabilities for company profiles with different hiring bars. | Makes an abstract score actionable against placement targets. | Live UI + API |
| 112 | Outcome-based calibration | TPO-submitted real outcomes fit per-company logistic parameters when sufficient evidence exists, otherwise heuristics remain in use. | Demonstrates a system that improves from institutional results without pretending sparse data is predictive. | Live API |
| 113 | Full session report API | `/reports/{session_id}` returns the session, transcript, evaluations, summary, readiness, and plan-gated sections. | Provides one authoritative report contract for UI, sharing, and PDF. | Live UI + API |
| 114 | Professional PDF report | Paid-plan reports render branded summaries, readiness, rubric rows, question feedback, and coaching into a downloadable PDF. | Turns practice into a portable professional artifact. | Live UI + API |
| 115 | Secure report sharing | A user can create an expiring share token; a public endpoint returns a limited report and records view state. The current report screen does not expose this action. | Enables mentor/recruiter review without exposing the full account. | Live API |
| 116 | Plan-gated report depth | Ideal answers, rubric breakdown, history, corrected intent, answer blueprints, and PDF access are enforced from one plan configuration. | Demonstrates meaningful tier differentiation and prevents frontend-only paywalls. | Live UI + API |
| 117 | Session history | Eligible users can browse dated sessions with plan, difficulty, state, and score, then reopen reports. | Makes improvement visible over time. | Live UI + API |
| 118 | History retention by plan | Retention and visibility rules follow the effective plan rather than assuming all sessions are permanently visible. | Keeps storage and paid access behavior aligned. | Live internal |
| 119 | Single and bulk history deletion | Users can confirm deletion of one session or a selected group. | Provides practical control over personal performance history. | Live UI + API |
| 120 | Personal coaching analytics | The analytics page derives strongest/weakest measured skills, current signals, trend direction, and recommended practice from dashboard, skills, and latest-report data. | Shows improvement priorities without sample fallback. | Live UI + API |
| 121 | Answer-quality fingerprint chart | The report visualizes the measured shape of answer quality. | Gives a memorable summary of the candidate's response style. | Live UI + API |
| 122 | Session momentum curve | Turn scores show how performance changed during the interview. | Reveals whether confidence and quality improved or declined under continued questioning. | Live UI + API |
| 123 | Response timing intelligence map | Answer timing is plotted where persisted timing evidence exists. | Shows hesitation and pacing patterns. | Live UI + API |
| 124 | Confidence-decay pattern | The report models changes in confidence-related signals across turns when supported by data. | Surfaces performance under pressure. | Live UI + API |
| 125 | Topic-by-skill blind-spot heatmap | Topic coverage is crossed with measured skills to expose weak combinations. | Turns a broad “needs improvement” message into a targeted practice map. | Live UI + API |
| 126 | Follow-up rabbit-hole analysis | Performance by follow-up depth shows where deeper probing caused answer collapse. | Demonstrates interviewer pressure intelligence. | Live UI + API |
| 127 | Answer-classification breakdown | The report summarizes answer-status categories across the session. | Makes repeated response problems visible. | Live UI + API |
| 128 | Communication-content scissor effect | Content and communication series are compared to expose divergence. | Clearly shows “what was said” versus “how it was delivered.” | Live UI + API |
| 129 | Topic-avoidance map | Available evidence is used to compare expected and demonstrated topic engagement. | Helps reveal areas the candidate may be avoiding or under-explaining. | Live UI + API |
| 130 | Technical-readiness gauge | Technical evidence is summarized into a focused readiness view. | Gives a fast technical interview signal. | Live UI + API |
| 131 | Missing-elements frequency | The report counts recurring missing answer components. | Provides a practical checklist for the next attempt. | Live UI + API |
| 132 | Score-contribution waterfall | Per-question/category contributions explain how the final score was formed. | Makes the headline number more transparent. | Live UI + API |

## 7. Plans, billing, growth, feedback, and support

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 133 | Free practice tier | Free provides five-turn interviews, two interviews per month, a supportive interviewer, basic feedback, and no paid history/PDF/rubric extras. | Lets a new user experience the core value before buying. | Live UI + API |
| 134 | Pro practice tier | Pro provides ten-turn interviews, 15 interviews per month, deeper follow-ups, ideal answers, rubric detail, history, corrected intent, and PDF reports. | Demonstrates the first complete professional coaching tier. | Live UI + API |
| 135 | Career practice tier | Career provides thirteen-turn interviews, unlimited plan-config usage, advanced panel style, and answer blueprints in addition to Pro features. | Shows the highest-depth candidate transformation experience. | Live UI + API |
| 136 | College Career entitlement | Organization-managed students are assigned Career-level practice through the college rather than purchasing individually. | Demonstrates the core B2B value delivered to enrolled students. | Live UI + API |
| 137 | Owned-plan switching | A user with multiple active entitlements can switch the active plan without repurchasing it. | Makes paid access flexible and prevents duplicate charges. | Live UI + API |
| 138 | Time-bounded plan lifecycle | Entitlements track source, start, expiry, active state, renewal, and the highest currently valid tier. | Ensures plan access remains consistent across dashboard, interviews, reports, and billing. | Live internal |
| 139 | Monthly quota enforcement | Interview setup checks plan allowance, used count, period/reset, referral bonus, and admin grants before creating a session. | Proves limits are enforced server-side, not only displayed. | Live API |
| 140 | Usage and quota dashboard | Used, remaining, progress, reset/expiry, owned tiers, referral bonus, and low-limit warnings are shown from live data. | Helps users understand access before starting an interview. | Live UI + API |
| 141 | Quota and plan email warnings | Email helpers support low-quota, nearing-expiry, and expired-plan notices. | Enables proactive retention and avoids surprise lockouts. | Live internal |
| 142 | Razorpay order creation | The backend creates a provider order only for valid purchasable plans and persists the reservation. | Starts checkout from an authoritative server amount. | Live UI + API |
| 143 | Idempotent purchase creation | A checkout idempotency key and unique receipt reuse an existing provider order after client/network retry. | Prevents duplicate orders and accidental double purchase attempts. | Live UI + API |
| 144 | Razorpay hosted checkout | The pricing page opens Razorpay Checkout using the server-created order. | Demonstrates the real user purchase experience. | Live UI + API |
| 145 | Payment signature verification | Order, payment, amount, currency, signature, and user association are checked before access is activated. | Prevents a client from self-awarding a paid plan. | Live API |
| 146 | Raw-body webhook verification | Razorpay webhook signatures are verified against the exact raw request body. | Demonstrates correct provider-security handling. | Live API |
| 147 | Webhook event idempotency | Provider event IDs and `webhook_events` prevent duplicate processing. | Makes billing safe when Razorpay retries delivery. | Live API |
| 148 | Payment/refund state reconciliation | Captured, failed, refunded, expired, and renewal cases update payments and entitlements without invalidating a newer valid purchase. | Keeps access correct across asynchronous billing events. | Live API |
| 149 | Billing status and sync | Users can load owned/active/expired plans and recent payment data, while sync rechecks current state. | Gives both the UI and support team an authoritative billing view. | Live UI + API |
| 150 | Admin payment notification | Verified individual payments can notify the configured platform administrator. | Supports commercial oversight without manual transaction polling. | Live internal |
| 151 | Revenue and lifetime-value analytics | Per-user revenue, payment dates, subscription state, and aggregate revenue/LTV are available to the admin console. | Demonstrates business-operating intelligence alongside product usage. | Live UI + API |
| 152 | Limited launch offer | Capacity, slots, eligibility, queued grants, approval, rejection, expiry, and reset are persisted and race-safe. | Creates a controllable early-adopter promotion instead of an uncontrolled coupon. | Live UI + API |
| 153 | Personal referral identity | Each eligible user receives a stable referral code and URL with slot, reservation, joined, and reward state. | Gives every candidate a measurable invitation loop. | Live UI + API |
| 154 | Referral reward fulfillment | A referred signup can be linked to the inviter and award bonus interviews exactly once. | Demonstrates a complete referral lifecycle rather than only link sharing. | Live API |
| 155 | User feedback | Users submit feedback and view prior entries/status; administrators can view all feedback. | Creates a direct product-improvement channel. | Live UI + API |
| 156 | Support thread lifecycle | Support messages retain sender role, attachment, read/notified state, and archive state. | Preserves the full context of customer issues. | Live UI + API |
| 157 | Platform support workbench | Admins can list users with threads, inspect conversation history, reply with optional image, archive, and unarchive. | Demonstrates an operational support workflow, not only a user chat bubble. | Live UI + API |

## 8. College organization management and cohort intelligence

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 158 | College organization dashboard | One live response supplies student/seat/segment counts, cohort performance, readiness, risks, weak categories, and optional placement/recruiter/drive summaries. | Gives a TPO an immediate operational command view. | Live UI + API |
| 159 | Organization CRUD | Platform administrators create, inspect, edit, suspend, activate, and delete college organizations with generated codes and contact/seat metadata. | Demonstrates full institutional customer lifecycle management. | Live UI + API |
| 160 | Seat-limit controls | College configuration defaults to 50 seats, supports controlled limits up to 5,000, and reports used/remaining seats. | Shows that access can be licensed and governed at institution scale. | Live API |
| 161 | Student directory | TPOs search, filter, sort, paginate, inspect, add, update, and remove organization enrollments. | Provides the core roster-management workflow. | Live UI + API |
| 162 | Existing-account enrollment | Adding a college student links an existing PrepVista identity to the organization enrollment and academic segments. | Avoids creating shadow accounts and preserves candidate history. | Live UI + API |
| 163 | Bulk student CSV onboarding | A TPO can upload up to 500 rows with required email, student ID, department, and batch columns, receive validation results, and import valid students. | Demonstrates practical onboarding of a real batch rather than manual one-by-one entry. | Live UI + API |
| 164 | Downloadable CSV template | The students page provides a sample file matching the accepted import structure. | Reduces formatting errors during demonstrations and real onboarding. | Live UI |
| 165 | Student detail and notes | The college student route shows identity, code, section, department, year, batch, access dates, activity, and notes. | Gives TPOs a single student record for intervention and administration. | Live UI + API |
| 166 | Individual Career access control | TPOs grant or revoke Career access for a selected enrolled student. | Demonstrates precise license management. | Live UI + API |
| 167 | Bulk organization access control | Platform administrators can grant or revoke Career access across an organization. | Supports institution-wide activation and suspension. | Live UI + API |
| 168 | Access-control workbench | The college page separates students with and without access and shows utilization KPIs plus recent actions. | Makes seat allocation operationally clear. | Live UI + API |
| 169 | Immutable-style access audit | Add, edit, remove, bulk, segment, login, grant, and revoke actions are written to the organization access log with actor context. | Gives colleges accountability for administrative changes. | Live UI + API |
| 170 | Department management | TPOs create, edit, list, and dependency-check/delete departments with canonical branch routing and technical-topic preview. | Connects academic structure directly to technical interview relevance. | Live UI + API |
| 171 | Branch-routing coverage | The departments page reports routed versus generic-fallback departments and exposes records needing review. | Makes data-quality gaps visible before they affect assessment. | Live UI + API |
| 172 | Academic year management | Years can be created, edited, ordered, and dependency-check/deleted. | Supports institution-specific cohort structure. | Live UI + API |
| 173 | Drag/reorder year sequence | A persisted reorder endpoint keeps the college's preferred year ordering. | Demonstrates that the academic hierarchy is configurable, not hard-coded. | Live UI + API |
| 174 | Batch management | Batches are created and related to academic years, edited, listed, and dependency-check/deleted. | Enables precise cohort filtering and reporting. | Live UI + API |
| 175 | Placement configuration | Colleges persist target companies, readiness threshold, focus pillars, and notes. | Frames analytics around each institution's placement strategy. | Live UI + API |
| 176 | Cohort performance analytics | The backend returns assessed counts, average/best scores, category rollups, department comparison, percentile distribution, and student performance. | Demonstrates evidence-based comparison beyond simple activity totals. | Live UI + API |
| 177 | Cohort growth analytics | Historical score changes, activity, heatmaps, threshold progress, and related trends can be filtered by department/year. | Shows whether training and practice are producing movement. | Live UI + API |
| 178 | Cohort readiness analytics | Readiness distribution, zero-offer-risk roster, momentum, tier, and risk evidence are returned with insufficient-data handling. | Helps a TPO prioritize limited intervention time. | Live UI + API |
| 179 | Department comparison | Department averages, divergence, growth, readiness mix, practice adoption, and at-risk/ready counts are derived from tenant-scoped persisted data. | Reveals systemic gaps that individual reports cannot show. | Live UI + API |
| 180 | Student performance dossier | A TPO can retrieve one enrolled student's session, score, category, readiness, percentile, momentum, and history context. | Supports evidence-backed mentoring and intervention. | Live UI + API |
| 181 | Live analytics Command Centre | The authenticated parent loads `/org/my/command-centre`, then transfers the organization dataset into a sandboxed ECharts iframe; missing evidence remains unavailable instead of becoming demo data. | Provides the flagship multi-view institutional intelligence demonstration. | Live UI + API |
| 182 | Command Centre global filters | Department, readiness tier, time window, focus student, reset, and per-chart filters coordinate the analytics views. | Lets a TPO move from college-wide signal to a specific cohort or student. | Live UI |
| 183 | Command Centre executive view | AI season briefing, readiness constellation, risk watchlist, skill fingerprint, growth slope, distributions, department-skill grid, ROI/utilization, season trend, weekly activity, improvers, and engagement views are assembled from the live payload. | Demonstrates high-density decision support without hand-built sample values. | Live UI + API |
| 184 | Command Centre risk view | Flag reasons, at-risk department, momentum, inactivity, readiness pipeline, days inactive, sessions-to-target, trend, and weekly readiness views explain who requires attention. | Converts a risk count into an intervention queue and evidence trail. | Live UI + API |
| 185 | Command Centre skills view | Cohort averages/growth/shape, relevance, clarity, specificity, structure, technical-versus-communication, spreads, and weak-skill rankings are visualized when evidence exists. | Shows the institution exactly which capabilities require training. | Live UI + API |
| 186 | Command Centre student explorer | One student can be examined through quality dials, composure, pacing, topic coverage, trajectory, skill/cohort comparisons, percentile journey, session history, and readiness debrief. | Bridges cohort analytics to individual action. | Live UI + API |
| 187 | Command Centre session forensics | Interview journey, topics, answer outcomes, per-question score/time, follow-ups, session-length spread, and answer-versus-ideal evidence can be inspected. | Makes aggregate scores auditable down to the interview turn. | Live UI + API |
| 188 | Command Centre PDF export | The embedded analytics engine renders a report, transfers PDF bytes to the authenticated parent, and downloads them in the browser. | Gives management a portable view of the current filtered evidence. | Live UI |
| 189 | Live student leaderboard | A sandboxed scoreboard receives tenant data, supports department/year/tier/search filters, ranks readiness, and opens valid enrollment records. | Provides recognition and fast identification of top or struggling students. | Live UI + API |
| 190 | No-sample embedded analytics rule | Command Centre and scoreboard demo data load only under explicit standalone sample mode; authenticated embeds wait for live payloads. | Protects institutional trust by preventing fake students or scores from appearing. | Live internal |
| 191 | College report preview | Filters produce student count, average/best score, Career-access percentage, score distribution, top performers, needs-attention, and report rows. | Lets a TPO validate the report scope before exporting. | Live UI + API |
| 192 | College CSV export | The backend returns filtered CSV bytes, and the frontend checks status and content type before download. | Supports faculty/management workflows without silently downloading an HTML error page. | Live UI + API |
| 193 | Scheduled college reports | A TPO stores recipient, weekly/monthly cadence, filters, next run, and active state; a background worker claims due schedules, renders CSV, emails it, and records success/failure. | Demonstrates recurring reporting without manual exports. | Live UI + API |
| 194 | College billing ledger | The billing page shows current allocation, seats, expiry/renewal state, plan history, and payment history. | Gives a college transparent access and commercial context. | Live UI + API |
| 195 | College plan/seat request buttons | Current buttons show a five-second local acknowledgement but do not call an API, email anyone, or persist a request. | Must be disclosed in a demo so a visual acknowledgement is not mistaken for an operational workflow. | UI only |
| 196 | Organization admin profile | The college-admin profile combines administrator identity, organization code, plan/access, seat context, and useful links. | Confirms which institution and authority the current user is operating under. | Live UI + API |

## 9. Recruiter CRM, drives, interviews, communications, offers, training, and outcomes

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 197 | Recruiter company directory | TPOs create, search, filter, paginate, and open tenant-scoped recruiter companies with city, website, industry, stage, and repeat-recruiter context. | Replaces scattered recruiter spreadsheets with an operating system. | Live UI + API |
| 198 | Recruiter relationship stages | A company moves through validated relationship stages with a reason and status-history record. | Makes outreach progression measurable. | Live UI + API |
| 199 | Multiple recruiter contacts | A dossier stores multiple contacts with designation, email, phone, active/primary state. | Preserves the real network behind each recruiting company. | Live UI + API |
| 200 | Recruiter activity timeline | Calls, meetings, emails, requirements, and other typed interactions are recorded chronologically. | Gives any placement officer the complete relationship context. | Live UI + API |
| 201 | Recruiter follow-ups | TPOs create prioritized, due-dated next actions and complete them from the dossier/command context. | Prevents recruiting opportunities from being lost through missed follow-up. | Live UI + API |
| 202 | Internal company notes | Placement-team notes are stored separately from contact/activity records. | Supports internal context without exposing it as external communication. | Live UI + API |
| 203 | Recruiter pulse | Dashboard KPIs summarize company counts, stages, open/overdue follow-ups, and relationship activity. | Gives the TPO a quick view of recruitment-pipeline health. | Live UI + API |
| 204 | Placement drive creation | TPOs create a drive with company, role, location, dates, and initial lifecycle state. | Establishes the central placement opportunity record. | Live UI + API |
| 205 | Drive lifecycle state machine | Only legal next states are returned and accepted, with optional transition reasons and audit records. | Prevents impossible jumps and makes drive state trustworthy. | Live UI + API |
| 206 | Versioned eligibility rule trees | Rules support validated AND/OR/NOT groups and whitelisted fields/comparators; each change creates a reasoned version. | Makes eligibility flexible, explainable, and safe from arbitrary code/query injection. | Live UI + API |
| 207 | Fail-closed eligibility evaluation | Real persisted student fields are evaluated; missing required values fail eligibility rather than being guessed. | Prevents unqualified students being silently included. | Live API |
| 208 | Immutable eligibility snapshot | A drive can compute eligible/not-eligible counts and primary failure reasons against the current roster and rule version. | Lets a TPO test a rule before acting on it and preserve what was true at that time. | Live UI + API |
| 209 | Drive performance summary | Drive detail and dashboard expose counts, score/readiness evidence, progression, and explicit no-session states. | Connects opportunity design to the actual student pool. | Live UI + API |
| 210 | Drive audit trail | Creation, rule versions, snapshots, and transitions are recorded with actor/context. | Makes eligibility and publication decisions reviewable. | Live UI + API |
| 211 | Drive round definitions | A placement drive can have ordered interview rounds used for scheduling and results. | Models multi-stage recruiting processes accurately. | Live API |
| 212 | Placement interview scheduling | TPOs schedule a student, drive, round, date/time, and location, then inspect it in a filterable ledger. | Coordinates the real interview calendar. | Live UI + API |
| 213 | Attendance recording | Attendance state and context can be recorded before result processing. | Distinguishes non-attendance from performance failure. | Live UI + API |
| 214 | Placement interview lifecycle | Interviews expose legal state transitions rather than accepting arbitrary status changes. | Protects operational consistency. | Live UI + API |
| 215 | Internal result entry | A TPO records result, remarks, and related evidence before it is visible as published truth. | Separates data entry from official communication. | Live UI + API |
| 216 | Result review and publication | Results move through review and publication, individually or in a confirmed batch. | Prevents premature or unreviewed outcomes reaching students. | Live UI + API |
| 217 | Result CSV validate/commit | Imported rows are validated and previewed before valid results are committed. | Supports high-volume operations without silent partial corruption. | Live UI + API |
| 218 | Pending-result workbenches | Separate queues expose results awaiting entry and awaiting review. | Gives placement staff a daily actionable workload. | Live UI + API |
| 219 | Interview issue resolution | Operational issues are attached to an interview and resolved with a recorded explanation. | Keeps exceptions visible and auditable. | Live UI + API |
| 220 | Placement interview analytics | Summary metrics report interview/result progress and outcome distribution by drive/round context. | Gives TPOs a real recruiting-funnel view. | Live UI + API |
| 221 | Organization message composition | TPOs create subject/body messages from templates or custom text. | Centralizes placement communication. | Live UI + API |
| 222 | Segmented communication audience | Messages target all or filtered students by department, drive, selected membership, or other validated audience rules. | Prevents irrelevant blasts and demonstrates cohort-aware outreach. | Live UI + API |
| 223 | AI-assisted message drafting | A TPO supplies an instruction and receives a bounded subject/body draft for review before sending. | Saves time while keeping the human in control of communication. | Live UI + API |
| 224 | Message delivery ledger | Sent history stores audience, recipient count, per-recipient delivery/open/acknowledgement state, and failure context. | Shows whether important placement messages were actually received. | Live UI + API |
| 225 | Student placement inbox | Organization students see prioritized messages, open them, and acknowledge those requiring confirmation. | Completes the communication loop on the student side. | Live UI + API |
| 226 | Student-to-TPO issue channel | Students submit categorized issues and later see status and the placement-office response. | Creates a structured escalation route for offer, interview, and placement problems. | Live UI + API |
| 227 | Communication issue workbench | TPOs filter, inspect, respond to, resolve, and close student issues. | Prevents critical student cases from disappearing in informal chat. | Live UI + API |
| 228 | Placement seasons | TPOs create date-bounded placement seasons, list closed/current seasons, and close an active season. | Gives offers and outcomes a consistent reporting period. | Live UI + API |
| 229 | Offer ledger and creation | Offers link season, student, drive, company, role, location, employment/work mode, dates, and compensation. | Establishes a complete institutional offer record. | Live UI + API |
| 230 | Offer validation | Currency, dates, total/fixed compensation, organization ownership, and cross-domain links are validated. | Prevents financially or relationally impossible records. | Live API |
| 231 | Offer lifecycle state machine | Legal transitions, reasons, actor context, and immutable versions track the offer from draft through verification/publication/decision. | Keeps the most important placement outcome history trustworthy. | Live UI + API |
| 232 | Joining workflow | Joining states, reason, expected/actual date, evidence, verification, delay, and did-not-join handling are linked to the offer. | Distinguishes receiving an offer from actually joining. | Live UI + API |
| 233 | Did-not-join reason requirement | A did-not-join transition is rejected without an explanation. | Preserves the operational evidence needed to understand placement leakage. | Live API |
| 234 | Private offer/joining evidence | PDF documents are uploaded to a private bucket with bounded size and organization/offer/document paths. | Creates verifiable evidence without exposing offer letters publicly. | Live UI + API |
| 235 | Evidence verification and signed download | TPOs verify evidence and open it through a short-lived signed URL; verified evidence is required for the joined workflow. | Makes “verified placement” mean something concrete. | Live UI + API |
| 236 | Offer analytics dashboard | Verified, accepted, pending, declined, expiring, joining, funnel, company scorecard, and needs-attention metrics are calculated from records. | Gives management a complete offer-to-joining operating view. | Live UI + API |
| 237 | Placement outcome submission | Authorized users submit actual company outcome data for a candidate/session. | Closes the loop between readiness estimates and real hiring results. | Live API |
| 238 | Company calibration command | Authorized users can trigger recalculation of a company's probability parameters. | Demonstrates transparent, controlled learning from outcomes. | Live API |
| 239 | Training program creation | The API creates institution/season programs with taxonomy, goals, dates, and lifecycle state. | Provides the backend foundation for acting on identified skill gaps. | Live API |
| 240 | Training lifecycle and sessions | Programs transition through allowed states and receive scheduled training sessions. | Supports operational delivery, not only recommendations. | Live API |
| 241 | Versioned assessments | TPOs create assessments, add immutable versions/questions/configuration, and publish a version. | Provides an evidence source beyond mock interviews. | Live API |
| 242 | Readiness/intervention data model | Attendance, cohorts, enrollment, attempts, results, skill measurements, readiness snapshots, interventions, assignments, audit, and student-success events are persisted. | Shows the wider student-success platform behind interview analytics. | Live internal |
| 243 | First-party training/assessment UI boundary | No current Next.js route exposes the mounted training and assessment APIs end to end. | Must be stated accurately so API foundations are not presented as completed screens. | Live API |

## 10. Platform administration

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 244 | Platform overview console | The main admin page combines users, subscriptions, activity, launch offers, referrals, feedback, revenue, and support. | Gives operators one place to understand the entire service. | Live UI + API |
| 245 | User subscription analytics | Admins can search and inspect plan, access, usage, payment, referral, and activity context per user. | Supports customer-success and billing investigation. | Live UI + API |
| 246 | Launch-offer review queue | Pending grants can be approved or rejected, with atomic slot assignment and review timestamps. | Demonstrates controlled promotional access. | Live UI + API |
| 247 | Manual model/access grant workbench | An admin selects a user, plan/model, action, and value to apply a controlled grant. | Supports remediation without editing the database manually. | Live UI + API |
| 248 | Global feedback review | All submitted user feedback is available in the admin overview. | Closes the product-learning loop. | Live UI + API |
| 249 | College portfolio list | Platform administrators see organizations, status, seats, administrators, search/sort, and aggregate counts. | Demonstrates B2B customer operations at portfolio level. | Live UI + API |
| 250 | College detail control room | One route provides student list, analytics, billing, plan/all-access operations, payment records, and assigned admins for an organization. | Gives support/operations full institution context without cross-tenant ambiguity. | Live UI + API |
| 251 | Organization plan assignment | Platform admins assign a college plan, seat limit, dates, billing type, and commercial context. | Activates institutional access through an auditable workflow. | Live UI + API |
| 252 | Manual organization payment recording | Admins record college payments and associate them with organization allocations. | Supports invoiced/offline B2B commercial flows. | Live UI + API |
| 253 | Organization plan revocation | A plan can be revoked centrally with associated access recalculation. | Gives operations a safe offboarding/control path. | Live UI + API |
| 254 | College administrator assignment | Existing PrepVista accounts can be assigned to organizations, then enabled or disabled. | Demonstrates delegated institutional administration. | Live UI + API |
| 255 | Overlapping college-admin screens | `/admin/colleges` and `/admin/college-admins` both expose administrator assignment/enablement, with the latter as a narrower screen. | Must be disclosed as current UI duplication rather than counted as two different capabilities. | Live UI + API |

## 11. Production engineering, security, reliability, and deployment

| # | Feature headline | What the code provides | Why it must be demonstrated | Status |
|---:|---|---|---|---|
| 256 | FastAPI application factory | One production entry point configures lifecycle, middleware, routers, monitoring, and health endpoints. | Makes deployment behavior reproducible and testable. | Operations / QA |
| 257 | Typed environment configuration | Pydantic Settings loads, normalizes, and validates application, database, provider, billing, storage, email, rate-limit, and security values. | Turns configuration mistakes into startup errors with actionable messages. | Operations / QA |
| 258 | Production HTTPS enforcement | Public frontend/backend URLs and every production CORS origin must use HTTPS. | Prevents accidental plaintext production configuration. | Operations / QA |
| 259 | Explicit production hosts and origins | Wildcards are removed in production and least-privilege host/origin fallbacks are derived from validated public URLs. | Prevents Host-header injection and overly broad cross-origin access. | Operations / QA |
| 260 | Production secret validation | Production requires at least one LLM provider, a complete Razorpay credential set, sufficiently long JWT secret, and non-debug mode. | Prevents deployment that appears live but cannot securely deliver core features. | Operations / QA |
| 261 | Cross-field configuration checks | Database min/max, analytics-pool values, storage/request sizes, billing credentials, Redis pairs, Gmail credentials, and plan-limit drift are validated together. | Catches logical configuration errors before the first user request. | Operations / QA |
| 262 | Trusted Host middleware | Requests with unrecognized Host headers are rejected before application routing. | Protects absolute-link and proxy behavior. | Operations / QA |
| 263 | Least-privilege CORS | Only configured web origins receive CORS access; CORS wraps error responses as well as successful routes. | Ensures browsers see real API errors without opening the API to arbitrary sites. | Operations / QA |
| 264 | Request-body size enforcement | Middleware counts actual bytes and rejects payloads above the configured ceiling while preserving normal JSON/multipart requests. | Protects memory under malicious or accidental large uploads. | Operations / QA |
| 265 | GZip response compression | Responses above a minimum size are compressed while tiny health responses avoid unnecessary work. | Improves dashboard/report transfer efficiency. | Operations / QA |
| 266 | Backend nonce-based CSP | Each response receives a cryptographic script nonce plus HSTS, frame, MIME, referrer, permissions, and related security headers. | Demonstrates browser-level defense against script injection and clickjacking. | Operations / QA |
| 267 | Frontend security headers | Next.js emits HSTS, CSP, frame, MIME, referrer, permissions, and Razorpay-specific allow-list directives in production. | Protects the separate frontend deployment and payment flow. | Operations / QA |
| 268 | Uniform error contract | Database-not-ready, validation, HTTP, rate-limit, and unexpected failures return consistent JSON with a request ID. | Gives clients predictable recovery behavior and support a traceable incident key. | Operations / QA |
| 269 | PII-safe error logging | Email, phone, bearer tokens, JWTs, and other sensitive patterns are scrubbed before errors or capped tracebacks reach logs. | Protects resumes, answers, accounts, and tokens during incident diagnosis. | Operations / QA |
| 270 | Rate-limit header preservation | `Retry-After` and `X-RateLimit-*` values survive error translation and reach the frontend. | Lets clients retry responsibly rather than hammering the service. | Operations / QA |
| 271 | Structured production logs | Structlog emits JSON with level and ISO timestamp in production and readable console output in debug mode. | Makes Render logs searchable and machine-consumable. | Operations / QA |
| 272 | Sentry monitoring with scrubbing | Optional FastAPI Sentry integration removes request bodies, authorization/cookie data, and other sensitive fields before export. | Adds production observability without leaking candidate content. | Operations / QA |
| 273 | Atomic Redis rate limiting | Upstash Redis uses a Lua-backed sliding window for anonymous IP, authenticated user, and interview-session keys. | Prevents abuse consistently across processes. | Operations / QA |
| 274 | Safe rate-limit fallback | Redis timeout/connect failure falls back to a lock-protected in-memory limiter with bounded HTTP-client timeouts. | Keeps abuse controls working during a cache outage. | Operations / QA |
| 275 | Trusted-proxy IP resolution | Forwarded headers are accepted only from configured proxy ranges; other callers use the socket address. | Prevents attackers spoofing their client IP to bypass limits. | Operations / QA |
| 276 | Async PostgreSQL pool | A bounded asyncpg pool supplies timed acquisitions and guaranteed release through context managers. | Prevents indefinite hangs and leaked connections under load. | Operations / QA |
| 277 | Supabase connection-budget alignment | Render runs one async worker and a capped pool so total session-mode connections stay below the provider limit. | Directly prevents deployment loops caused by session-pool exhaustion. | Operations / QA |
| 278 | Dormant analytics-pool seam | Separate analytics-pool code remains available but is intentionally not initialized because current analytics use the main pool. | Documents future isolation capability without falsely claiming unused connections. | Operations / QA |
| 279 | Non-blocking startup retry | The web service binds early, retries database initialization/migrations every three seconds, and reports “starting” until ready. | Lets platform probes reach the service while transient database startup recovers. | Operations / QA |
| 280 | Readiness-gated traffic | `/health/ready` returns ready only after the database is initialized and queryable. | Prevents the deployment platform from routing full traffic to an unusable instance. | Operations / QA |
| 281 | Liveness and awake probes | Root, `/health`, `/health/awake`, and `/health/ready` expose distinct lightweight states. | Separates “process exists” from “database-backed app is ready.” | Operations / QA |
| 282 | Safe ordered migration runner | SQL files are applied in filename order and recorded in `schema_migrations`. | Makes schema evolution automatic and reproducible at startup. | Operations / QA |
| 283 | UTF-8 BOM-safe migrations | Migration files are read with `utf-8-sig`, removing an optional leading BOM before PostgreSQL execution. | Prevents the exact production `syntax error at or near \"\ufeff\"` failure. | Operations / QA |
| 284 | Transaction normalization | Complete outer transaction wrappers are removed and executed under the runner's controlled transaction, while incomplete/internal transaction text is preserved. | Prevents nested-transaction migration failures without rewriting valid SQL. | Operations / QA |
| 285 | Migration checksum/drift detection | SHA-256 is recorded for each migration; older rows are baselined and changed applied files raise a drift warning. | Makes accidental history edits visible. | Operations / QA |
| 286 | Migration file safety | Resolved paths must remain inside the migration directory, files above 10 MB are rejected, decoding is validated, and statement timeout is separated from normal queries. | Prevents traversal, oversized-file, encoding, and long-DDL failures. | Operations / QA |
| 287 | Migration integrity reconciliation | Later migrations repair/backfill historic rows before adding composite tenant and cross-domain foreign keys. | Allows safe production upgrades from earlier imperfect schema states. | Operations / QA |
| 288 | Background report scheduler | Startup creates the due-report loop and shutdown cancels it cleanly. | Gives scheduled exports a real worker lifecycle. | Operations / QA |
| 289 | Containerized production runtime | Python 3.12, application dependencies, Tesseract, Poppler, and LibreOffice are installed in the Docker image. | Ensures resume features available locally also exist in production. | Operations / QA |
| 290 | Gunicorn/Uvicorn process management | Gunicorn runs the ASGI app with timeout, keepalive, graceful timeout, preload, and stdout/stderr logging. | Provides a production process boundary rather than a development server. | Operations / QA |
| 291 | Render blueprint | Render declares the Docker web service, production environment, explicit host/CORS/storage/provider/billing variables, pool size, and readiness check. | Makes the backend deploy configuration version-controlled. | Operations / QA |
| 292 | Redundant Render heartbeats | Primary and backup cron services ping backend and frontend on offset schedules with parallel URL fallbacks, abort timeouts, jitter, exponential retry, and clear exit status. | Reduces cold starts and survives failure of one route or heartbeat schedule. | Operations / QA |
| 293 | Vercel awake cron | The frontend schedules a daily `/api/awake` call. | Adds a second deployment-specific availability mechanism. | Operations / QA |
| 294 | Resilient frontend API client | Requests include request IDs, timeouts, GET-only jittered retry, parsed errors, token refresh, and `cache: no-store` for authenticated data. | Makes normal network and authentication failures recoverable. | Live internal |
| 295 | Stale-while-revalidate cache | Read-heavy endpoints use bounded LRU caching, in-flight request deduplication, and capped background revalidation. | Improves perceived speed without unbounded memory or duplicate traffic. | Live internal |
| 296 | Mutation-aware cache invalidation | Authentication changes, purchases, deletions, and organization mutations clear the relevant cached paths. | Prevents stale UI after successful actions. | Live internal |
| 297 | AI provider abstraction | Typed messages, tool definitions/calls, usage, cost, finish reasons, streaming events, health, and normalized error classes support interchangeable model providers. | Makes provider changes observable and controlled. | Live internal |
| 298 | Dependency security pinning | Framework, multipart, JWT, PDF/image, Razorpay, and related packages are pinned to patched/reproducible versions. | Reduces known supply-chain and parser risk. | Operations / QA |
| 299 | Continuous integration gate | Pushes to `main` and pull requests compile/test/audit Python and install/audit/lint/typecheck/build the frontend. | Prevents known regressions and high-severity dependency findings from shipping unnoticed. | Operations / QA |
| 300 | Release-day staging smoke | A script performs real setup, first question, answer, repeat, timeout retries, early finish, report consistency, and PDF signature checks against a deployed environment. | Validates the complete critical interview journey after deployment. | Operations / QA |

## 12. Main-tree company simulation library — implemented but not routed

Everything in this section lives under `app/services/company_sim` and is covered by `tests/test_company_sim.py`, but no main router, frontend page, or deployed endpoint imports it. It must be described as a **tested library/demo**, not as a current production user feature.

| # | Feature headline | What the code provides | Why it is valuable to demonstrate when integrated | Status |
|---:|---|---|---|---|
| 301 | Eleven hand-modeled company blueprints | TCS, Infosys, Wipro, Cognizant, Accenture, Capgemini, HCLTech, Zoho, Amazon, Microsoft, and Google have structured round blueprints. | Shows a path from generic mocks to company-authentic preparation. | Tested library |
| 302 | Large company roster fallback | Tier-B archetype mappings and a directory described as 615 companies ensure an unknown named company can resolve to a usable archetype rather than dead-end. | Demonstrates scalable company coverage through data rather than custom code per company. | Tested library |
| 303 | Archetype blueprint factory | Mass-service, product, premium-product, analytics, core, and related archetypes materialize executable round structures. | Allows new companies to receive a coherent simulation quickly. | Tested library |
| 304 | Multi-round company session | A session orchestrates round order, gates, elimination, scoring, track progression, and final outcome. | Simulates the complete hiring process rather than one interview. | Tested library |
| 305 | Section timer engine | Round/section timing and expiry behavior are explicit. | Reproduces assessment-platform pressure. | Tested library |
| 306 | Negative-marking models | None, fixed, and threshold/free-wrong-answer policies are implemented. | Supports authentic aptitude/technical test scoring. | Tested library |
| 307 | Attempt navigation policies | Free revisit, locked-forward, and no-revisit rules control editing and navigation. | Reproduces company test-platform constraints. | Tested library |
| 308 | Company proctoring policies | Proctor events can flag or terminate according to blueprint, with student/TPO visibility separation. | Supports company-specific integrity behavior. | Tested library |
| 309 | Parametric aptitude generation | Deterministic math/reasoning templates generate correct, varied MCQs. | Expands question supply without static duplication. | Tested library |
| 310 | Executed pseudocode question generation | Pseudocode answer keys are computed rather than guessed, and options are deduplicated. | Protects technical-test correctness. | Tested library |
| 311 | Semantic item deduplication | Exact and cosine-near-duplicate questions are rejected within generated batches. | Keeps simulations fresh. | Tested library |
| 312 | Net-new round simulators | Coding, game aptitude, voice assessment, written communication, behavioral survey, work simulation, system design/bar-raiser, and hiring-committee patterns are registered. | Demonstrates breadth beyond conversational interviews. | Tested library |
| 313 | Voice delivery metrics | Company voice rounds calculate speaking rate and filler signals. | Extends company simulation into communication delivery. | Tested library |
| 314 | Company track/tier prediction | Gate results and attribute breakdown produce a company-specific predicted track, confidence, gaps, and actions. | Gives candidates a concrete company outcome target. | Tested library |
| 315 | Company-authentic report | Student and TPO reports render outcome, round timeline, attribute breakdown, integrity context, and coaching to dict/text/HTML. | Turns a multi-round simulation into actionable evidence. | Tested library |
| 316 | Platform visual skins | Company/archetype culture and strictness data select presentation/emphasis skins. | Makes simulations feel differentiated while keeping the engine data-driven. | Tested library |

## 13. Standalone `tpodashboard` reference prototypes

The `tpodashboard` directory contains 17 independent parts. None is imported by `app`, `frontend`, `tests`, deployment configuration, or the main runtime. Several ideas were later reimplemented in the main FastAPI/Next.js product, but these bundles themselves remain references.

| # | Prototype headline | What is present | Why it remains useful | Status |
|---:|---|---|---|---|
| 317 | Part 0 — Command Centre HTML | A standalone placement command-centre mockup. | Preserves the original visualization concept used to inform the live embedded dashboard. | Reference prototype |
| 318 | Part 1 — Multi-tenant placement foundation | A separate FastAPI/PostgreSQL design for institutions, academics, student import, Student 360, readiness contract, companies, drives, applications, interviews, offers, and a funnel. | Documents an alternative end-to-end placement-domain implementation and integration lessons. | Reference prototype |
| 319 | Part 2 — Companies and recruiters | A standalone Node/SQLite/Vite CRM with CRUD, duplicate detection, contacts/history, activities, follow-ups, relationship health, opportunities, command centre, audit, and tests. | Serves as the design source for the main recruiter CRM while explicitly documenting its standalone limitations. | Reference prototype |
| 320 | Part 3 — Eligibility engine | Pure AND/OR/NOT rule evaluation, validation, explanation, cohort summary, what-if simulation, versioned rules, snapshots, lifecycle, audit, and demos. | Provides focused eligibility-engine reasoning and test cases. | Reference prototype |
| 321 | Part 4 — Autonomous Engineer | An unrelated autonomous-software-engineer foundation with API/config/database/provider infrastructure; the actual autonomous agent is not built. | It is reusable engineering research, but it is not a PrepVista placement feature and must never be shown as one. | Reference prototype |
| 322 | Part 5 — Interviews and results centre | Scheduling, attendance, lifecycle, import, internal/reviewed/published results, round progression, analytics, events, audit, AI-safe contracts, UI, and tests. | Preserves the full results-centre design that informed the main placement-interview module. | Reference prototype |
| 323 | Part 6 — Offers, joining, and verified outcomes | Offer/joining state machines, multiple-offer policy, conflicts, evidence boundaries, outcome/KPI mapping, imports, funnel/timing, segments, scorecards, trends, digest, privacy-suppressed distribution, insights, and report. | Documents deep offer-to-joining policy and analytics, with an honest standalone truth table. | Reference prototype |
| 324 | Part 7 — Training, assessment, intervention, readiness | PostgreSQL/Drizzle reference services for programs, assessments, readiness, skill gaps, recommendations, interventions, effectiveness, cross-student overview, audit/events, and AI read tools. | Provides a deeper future implementation guide for the main API-only training/assessment foundation. | Reference prototype |
| 325 | Part 8 — Placement readiness intelligence | Readiness/missing-data/momentum/risk/skill-gap logic plus funnel, zero-offer risk, packages, drive conversion, eligibility quick wins, pacing, equity, offer holders, TPO action queue, and student/TPO demo UIs. | Captures advanced cohort-intelligence ideas and explicit data-sufficiency rules. | Reference prototype |
| 326 | Part 9 — Communication Center JSX | A seeded standalone TPO/student communication UI for overview, compose, templates, sent/failed, issues, analytics, inbox, acknowledgement, and issue reporting. | Preserves the interaction design; the current production communication pages use the main API instead. | Reference prototype |
| 327 | Part 10 — Reports and evidence vault | Evidence attachments, versioned metric definitions, immutable report snapshots, executive funnel/department/company/season comparison, data quality, and aggregate-only role boundaries. | Provides a governance-focused reporting design beyond the current report implementation. | Reference prototype |
| 328 | Part 11 — Administration/security/governance | Standalone auth, sessions, RBAC, tenant isolation, audit immutability, users/roles/policies, data quality, AI governance, static dashboard, and adversarial tests. | Serves as a security/governance reference, not the deployed admin stack. | Reference prototype |
| 329 | Part 12 — AI Placement Officer | Tool-grounded orchestration with provider abstraction, 43 registered tools, permission/safety/audit gates, evidence envelopes, context memory, cross-module reasoning, briefing, action confirmation, injection defense, PII minimization, tests, and static demo. | Defines a future conversational operating layer while honestly using mock service data in the standalone bundle. | Reference prototype |
| 330 | Part 13 — Proactive Placement Radar | Twenty-six signal types, detectors, event routing, priority, anomaly, deduplication, escalation, clustering, briefings, scheduled jobs, attention-centre UIs, and tests. | Provides a blueprint for proactive rather than query-only placement intelligence. | Reference prototype |
| 331 | Part 14 — Human-in-the-loop AI Action Engine | Propose, validate, preview, confirm, execute, audit, permission/policy/precondition gates, idempotency, stale revalidation, partial failures, automation rules, and red-team tests. | Defines how future AI actions can remain permission-first and human-approved. | Reference prototype |
| 332 | Part 15 — Forecasting and strategy engine | Two backtested forecast methods, confidence ranges, target gaps, isolated scenarios, opportunity/skill/company intelligence, explainable recommendations, RBAC, APIs/tools, and demos over synthetic repository data. | Provides a future planning/forecasting layer without claiming a live database or UI. | Reference prototype |
| 333 | Part 16 — Integration/hardening kit | Canonical events, idempotency/ordering, RBAC matrix, tenant checks, state machines, integrity checks, AI prepare-confirm-execute flow, fake-feature scanner, fixtures, and 43-check demo. | Supplies reconciliation patterns and an honesty scanner for future integration. | Reference prototype |

## 14. Research, content banks, generated documentation, and legacy artifacts

| # | Asset headline | What is present | Why it matters | Status |
|---:|---|---|---|---|
| 334 | `newfiles` interview content bank | Branch banks, departments, categories, competencies, roles, companies, difficulty/scoring/feedback/integrity/LLM configuration, blueprints, and question-family generators. | Preserves broad interview-content research, but no deployed module imports this folder. | Research / content |
| 335 | `newfiles2` role prompt library | Role rosters, template index, and prompt/knowledge files spanning software, data/AI, infrastructure, electronics, electrical, mechanical, civil, chemical, business, finance, design, sales, writing, and support. | Provides future role-specific content breadth; it is not live runtime data. | Research / content |
| 336 | Company simulation master dossier | `00_MASTER_DOSSIER.md` documents company profiles, blueprint schema, round simulators, skins, track prediction, content, roster scaling, and proposed integration. | Captures the product thesis and design rationale behind the unrouted company library. | Research / content |
| 337 | Company roster research | `02_COMPANY_ROSTER.md` supplies the named-company coverage strategy. | Supports data-driven expansion of company simulations. | Research / content |
| 338 | Product documentation set | `README.md`, `DOCUMENTATION.md`, app/frontend/scripts/tests docs, and `AUDIT.md` explain product, architecture, hardening, and prior verification. | Gives maintainers multiple perspectives, though this catalogue is the status-aware feature inventory. | Research / content |
| 339 | Market and college research | `MARKET_ANALYSIS.md`, college-lead/rank HTML files, and related research material support product strategy and outreach. | Useful commercially, but not a user-facing software capability. | Research / content |
| 340 | One-off extraction and migration utilities | AST/TypeScript extractors, signature dumps, chunk appenders, `clean*.py`, `translate.py`, `gen_migration.py`, and `test_queue.py` are hard-coded maintenance/build-time helpers. | They explain how code/docs/migrations were transformed or inspected, but they are not safe general-purpose production services. | Legacy / artifact |
| 341 | Legacy application files | The `legacy` directory and root historical HTML/image assets preserve earlier implementations/designs. | Useful for archaeology only; they must not be counted as current pages. | Legacy / artifact |
| 342 | Build/test/debug outputs | `pytest_output.log`, `test_results.txt`, `push_out.txt`, verify-output files, dumps, and snippet files are captured outputs. | Provide historical diagnostics but no executable product feature. | Legacy / artifact |
| 343 | Third-party browser vendors | ECharts, html2canvas, and jsPDF vendor assets power charts and client PDF export. | They enable the embedded analytics presentation but are third-party libraries, not independent PrepVista features. | Live internal |

## 15. Database migration coverage

This table accounts for every main migration and states the capability it introduces or reconciles.

| Migration | Feature/data responsibility |
|---|---|
| `001_initial_schema` | Core institutions, profiles, identity links, interview sessions/messages/evaluations/skills/quality, cohort snapshots, usage/funnel, billing/entitlements, referrals, feedback, reports, functions, RLS, and indexes. |
| `002_profile_referral` | Stable profile referral codes, normalized invitations, joined/reward state, uniqueness, and lookup indexes. |
| `003_interview_runtime` | Runtime state, client-request idempotency, difficulty, question plan/signatures/retries, and related indexes. |
| `004_free_evaluation` | Plan-specific evaluation metrics, classification, feedback, coaching, and richer per-question fields. |
| `005_user_activity` | Activity stats/events, output fingerprints, topic progress, RLS, and supporting performance behavior. |
| `006_plan_lifecycle` | Entitlement lifecycle, plan interview accounting, active-state refresh, RLS, and indexes. |
| `007_account_archive` | Minimal deleted-account archive, email hashing, pseudonymization/erasure functions, and privacy policies. |
| `008_public_growth` | Persisted public activity/growth metrics and milestones. |
| `009_launch_offer` | Launch-offer configuration, capacity/slots, grant queue/state, uniqueness, and expiry indexes. |
| `010_cascade_fixes` | Foreign-key cascade corrections and GDPR erasure behavior across existing records. |
| `011_revenue_analytics` | Per-user revenue/subscription analytics, update trigger, RLS, and reporting indexes. |
| `012_admin_bonus` | Profile admin-bonus metadata and auditable admin bonus grants. |
| `013_email_verification` | Hashed signup-code state, expiry/attempt/lock behavior, update trigger, RLS, and indexes. |
| `014_support_chat` | Support threads/messages, role/read/unread/notification/archive behavior, RLS, and queue indexes. |
| `015_report_sharing` | Share token, expiry, creation/view metadata, and sharing indexes on sessions. |
| `016_interview_types` | Interview type/target role/company fields and versionable interview-type definitions. |
| `017_college_organization` | Organizations, admins, departments, years, batches, students, access logs, plans, webhooks, payments, invites, cohort snapshots, and bridges to profiles/sessions. |
| `018_performance_indexes` | Query indexes for production organization, cohort, session, and analytics paths. |
| `019_answer_quality_flags` | Structured answer-quality flags and supporting integrity/quality records. |
| `020_question_evaluations_unique_turn` | One evaluation per session turn and duplicate cleanup/guarding. |
| `021_transcript_repair_audit` | Original/repaired transcript data and repair audit context. |
| `022_placement_calibration` | Real placement outcomes and per-company calibrated probability parameters. |
| `023_audio_audit_trail` | Interview audio-turn metadata, object paths, retention/review state, and indexes. |
| `024_college_placement_config` | Per-college target companies, readiness threshold, focus pillars, and notes. |
| `025_recruiter_companies` | Industries, companies, contacts, activities, follow-ups, notes, relationship history, and indexes. |
| `026_placement_drives` | Drives, eligibility rule versions, immutable snapshots, audit log, lifecycle/data indexes. |
| `027_placement_interviews` | Round executions, interviews, results, issues, audit, events, and result/operational indexes. |
| `028_offers_joining_placement` | Offers, versions, evidence documents, joining records, student outcomes, and institution offer policy. |
| `029_training_readiness` | Taxonomy, training, attendance/cohorts/enrollment, assessments/attempts/results, skill/readiness evidence, interventions, audit, and success events. |
| `030_org_communications` | Organization messages, per-recipient delivery/open/acknowledgement, and student issues/responses. |
| `031_training_and_drive_integrity` | Cross-domain and cross-tenant composite constraints for training, drives, interviews, offers, and related records. |
| `032_placement_seasons` | Placement seasons and safe season linkage/backfill for offer/reporting data. |
| `033_reconcile_org_student_integrity` | Repairs historic organization-student/session/evaluation links, handles legacy score-delta context safely, and restores integrity before constraints. |
| `034_payment_order_idempotency` | Checkout idempotency keys, provider-order reservation/reuse, receipts, and uniqueness. |
| `035_org_report_schedules` | Recurring organization report definitions, filter snapshot, next/last run, status, and worker-claim indexes. |

## 16. Primary test and verification coverage

| Test/verification area | What it protects |
|---|---|
| `test_50_questions_validation.py` | Grounding across plan, question-family, answer, and resume combinations. |
| `test_auth_identity.py` | Google/provider identity extraction and canonical profile linking. |
| `test_billing_purchase.py` | Checkout idempotency-key validation, reservation persistence, provider-order reuse, migration support, and frontend key transmission. |
| `test_command_centre_contract.py` | Real percentiles, score change, minimum evidence, configured labels, no fabricated skills/anatomy/history/students, tenant scope, and canonical columns. |
| `test_communications_contract.py` | Mounted routes, trimmed nonblank text, audience validation, and template validation. |
| `test_company_sim.py` | Blueprints, rules, proctoring, negative marking, navigation, every company run, simulators, outcome tracks, generation correctness/dedup, reports, and roster fallback. |
| `test_email_validation.py` | Normalization, deliverability, provider typos, disposable domains, and tier-isolated admin markers. |
| `test_grounded_questions.py` | Concrete Free/Pro/Career follow-ups across software and non-software resumes. |
| `test_hardening_regression.py` | Transcript-repair guards, question signatures/dedup, grounded-answer safety, score scaling, resume format/magic validation, audio-turn parsing, correction detection, and Redis-memory serialization. |
| `test_interview_logic.py` | Main interview/evaluator/session business logic and edge cases. |
| `test_migration_safety.py` | BOM removal, transaction stripping, offer/calibration separation, composite tenant constraints, season backfill, and integrity repair order. |
| `test_offers_contract.py` | Mounted authenticated offer routes, financial/date validation, and required did-not-join reason. |
| `test_placement_drives_rules.py` | Whitelisted persisted rule fields, valid Boolean trees, fail-closed missing values, real progression, and explicit no-session state. |
| `test_placement_readiness.py` | Pillar math, missing data, weighting, normalization, tiers, monotonic/bounded company probabilities, and adapters. |
| `test_production_contract.py` | Production hosts/origins, wildcard sanitization, namespaced debug, payment configuration, and actual-byte request limits. |
| `test_razorpay_webhook.py` | Exact raw-body signatures, required signatures/event IDs, retry responses, amount mismatch, and safe refund/renewal behavior. |
| `test_report_schedules.py` | Frontend action routes, strict scheduling, recurrence dates, launch-offer atomic review, worker/migration presence, and frontend/backend path agreement. |
| `test_support_contract.py` | Text-or-image requirement, image data-URI validation, and compressed JPEG acceptance. |
| `tests/conftest.py` and JSON fixtures | Deterministic environment/settings plus strong, thin, and non-software resume profiles shared by the primary suite. |
| GitHub Actions backend job | Python 3.12 setup, dependency install, compile, `pip-audit`, and full pytest. |
| GitHub Actions frontend job | Node 20 setup, `npm ci`, production dependency audit, zero-warning lint, TypeScript check, and production build. |
| `scripts/staging_smoke.py` | Real deployed interview setup through valid PDF report generation. |

Tests verify important contracts but do not prove that every production environment variable, external account, provider, bucket, webhook, DNS record, or live database contains correct values. Those remain deployment responsibilities.

## 17. Important current boundaries and known UI gaps

These facts are part of the feature inventory and must not be hidden during a demonstration or handoff:

1. The current interview setup picker advertises and accepts PDF in the UI, although the backend supports DOCX, DOC, and images.
2. The current live interview screen is voice/transcript driven and does not expose a manual text-answer box, even though the answer API transports text.
3. The landing-page Cookies link points to `/pricing`; there is no Cookies route.
4. The organization dashboard header search field is visual only and has no state, submit, filter, or navigation handler.
5. Organization billing plan and extra-seat request buttons show a local “request sent” acknowledgement but do not persist or notify anyone.
6. `/admin/colleges` and `/admin/college-admins` overlap in college-admin assignment/enablement.
7. `premium_override` can open the main `/admin` console, but college-management subroutes require full `is_admin`.
8. Five organization URLs are redirect-only compatibility paths, not independent modules.
9. Training and assessment have mounted backend APIs and schema but no complete current first-party frontend workflow.
10. Secure report sharing exists in the backend/client API layer, but the current report screen exposes Download PDF rather than a share action.
11. Company simulation is a substantial tested main-tree library, but it has no router/page integration and is not a live product path.
12. `tpodashboard`, `newfiles`, and `newfiles2` are not imported by the deployed application; they are reference, prototype, or content material.
13. `tpodashboard/part4` is an unrelated Autonomous Engineer project and is not a PrepVista feature.
14. Command Centre and Scoreboard authenticated embeds do not fall back to sample data. Sample data exists only for explicit standalone sample mode.
15. The Command Centre's “67 charts · 67 filters” text is a presentation badge; the actual source-implemented modules are the views described in items 181–187, and empty evidence stays empty.
16. No source-only review can guarantee external Razorpay, Supabase, Resend/Gmail, Groq/OpenAI, Deepgram, Redis, Render, Vercel, DNS, or storage-bucket configuration. The code validates and handles these integrations, while deployment must supply and verify the live credentials/resources.

## 18. Demonstration sequence that proves the connected product

The following sequence covers the highest-value live capabilities without presenting prototypes as production:

1. Create or sign in to an individual account; show verification/OAuth, role routing, and current plan/quota.
2. Upload a real PDF resume, select Auto or Difficult, and start the prefetched interview.
3. Answer by voice; request a clarification, allow one silence retry, then give a strong resume-grounded answer to show adaptive follow-up.
4. Finish and show content-versus-delivery feedback, readiness, company probabilities, per-question coaching, all evidence-backed report charts, and PDF download.
5. Return for a second session to show history, skill trends, and cross-session novelty.
6. Purchase Pro/Career through Razorpay in a configured non-production payment environment and show backend-verified entitlement activation.
7. Sign in as an organization student to show college-managed Career access and placement-office inbox/acknowledgement/issues.
8. Sign in as a college administrator; add/import students, configure departments/years/batches, grant access, and inspect the audit log.
9. Open the live Command Centre and Leaderboard, filter the real cohort, drill into a student, and export a report.
10. Create a recruiter company/contact/follow-up, create a drive and eligibility rule snapshot, schedule an interview, import/review/publish a result, send a segmented message, and track acknowledgement.
11. Create an offer, upload/verify evidence, progress offer and joining state, and show offer-to-joining analytics.
12. Sign in as platform admin to demonstrate organization/admin/plan/payment operations, launch-offer review, support, feedback, revenue, and LTV.
13. Show health/readiness, structured logs, CI, and staging smoke results as production evidence.
14. If company simulation or Parts 12–16 are shown, label them explicitly as tested/reference prototypes and explain the missing runtime integration.

## 19. Source ownership index

| Source area | Primary responsibility |
|---|---|
| `app/routers` | Mounted HTTP/WebSocket contracts and authorization boundaries. |
| `app/services` | Interviewing, evaluation, analytics, billing, readiness, storage, email, reporting, CRM support, and internal business rules. |
| `app/ai` | Provider-independent model types, interfaces, adapters, health, and errors. |
| `app/database/migrations` | PostgreSQL schema, data repair, constraints, RLS, indexes, and lifecycle evolution. |
| `app/middleware` | Error privacy, rate limiting, and backend security headers. |
| `app/main.py`, `app/config.py` | Lifecycle, route registration, health, production validation, and global product configuration. |
| `frontend/src/app` | Current public, candidate, student, college-admin, and platform-admin routes. |
| `frontend/src/components` | Shared navigation, theme, selectors, dialogs, support, branding, and chart infrastructure. |
| `frontend/src/lib` | API/auth/session/cache/types/theme/STT/legal integration. |
| `frontend/public` | Live embedded Command Centre/Scoreboard engines, explicit samples, and browser vendor assets. |
| `tests`, `.github/workflows/ci.yml` | Main regression, contract, security, dependency, type, lint, and build gates. |
| `scripts/staging_smoke.py` | Deployed critical-path verification. |
| `Dockerfile`, `render.yaml`, `frontend/vercel.json`, `frontend/next.config.ts` | Backend/frontend production packaging, runtime, availability, and security. |
| `tpodashboard` | Seventeen standalone reference/prototype parts. |
| `newfiles`, `newfiles2` | Unwired interview-content and role-template banks. |
| `legacy` and root historical artifacts | Archived designs, diagnostics, and research rather than current runtime features. |

This catalogue should be updated whenever a route is added, a backend-only feature receives a UI, a prototype is integrated, a migration changes the data contract, or any current boundary above is resolved.

## 20. Route coverage cross-check

### Current Next.js pages (45)

| Route group | Page routes | Feature coverage above |
|---|---|---|
| Public/auth | `/`, `/login`, `/auth/callback`, `/pricing`, `/referral/[code]`, `/privacy`, `/terms` | 2–7, 16–24, 133–155 |
| Individual/shared practice | `/dashboard`, `/interview/setup`, `/interview/[id]`, `/history`, `/analytics`, `/feedback`, `/profile`, `/settings`, `/report/[id]` | 34–35, 39–132, 155 |
| Organization student | `/student-dashboard`, `/student-dashboard/communications` | 9, 136, 225–226 |
| Organization admin | `/org-admin`, `/org-admin/students`, `/org-admin/students/[id]`, `/org-admin/departments`, `/org-admin/years-batches`, `/org-admin/analytics/[[...slug]]`, `/org-admin/communications`, `/org-admin/leaderboard`, `/org-admin/placement-config`, `/org-admin/companies`, `/org-admin/companies/[id]`, `/org-admin/drives`, `/org-admin/interviews`, `/org-admin/offers`, `/org-admin/access-control`, `/org-admin/reports`, `/org-admin/billing`, `/org-admin/profile` | 158–243 |
| Platform admin | `/admin`, `/admin/colleges`, `/admin/college-admins`, `/admin/colleges/[id]` | 244–255 |
| Redirect-only compatibility | `/org-admin/action-engine`, `/org-admin/ai-officer`, `/org-admin/forecast-strategy`, `/org-admin/placement-radar`, `/org-admin/system-hardening` | 15 and boundary 8 |

### Main FastAPI route families

| Mounted route family | Capability coverage above |
|---|---|
| `/auth/*` | Account status, signup verification, signup/login/OAuth, refresh, onboarding, current user — 16–29. |
| `/interviews/*` | Setup, answer, finish, terminate, violation — 39–90. |
| `/reports/*` | Report, PDF, share, shared report — 113–116. |
| `/dashboard/*` | Dashboard, public growth, sessions, deletion, skills — 3–4, 117–120, 140, 153. |
| `/billing/*` | Order, verify, switch, webhook, status, sync — 137–151. |
| `/account/*` | Account deletion/archive — 36. |
| `/support/*`, `/admin/support/*` | User and platform support threads — 13, 156–157. |
| `/admin/*`, `/admin/grants/*` | Platform overview, launch review, access grants — 37, 152, 244–248. |
| `/referrals/*` | Personal/public referral and reservation queue — 6, 153–154. |
| `/feedback/*` | User submission/history and admin visibility — 155, 248. |
| `/events/*` | Product funnel telemetry — 4. |
| `/org/admin/*` | Platform organization, admin, analytics, billing, access, and export operations — 38, 159, 167, 244–255. |
| `/org/my/dashboard`, `/org/my/analytics*`, `/org/my/command-centre`, `/org/my/leaderboard` | College dashboard, performance, growth, readiness, reports, Command Centre, leaderboard — 158, 176–193. |
| `/org/my/students*`, `/org/my/departments*`, `/org/my/years*`, `/org/my/batches*`, `/org/my/access-*`, `/org/my/billing` | College roster, academic structure, access, audit, billing — 161–175, 194. |
| `/org/my/placement-config` | College targets/readiness configuration — 175. |
| `/org/my/companies*`, `/org/my/followups*` | Recruiter CRM and follow-up operations — 197–203. |
| `/org/my/drives*` | Drive lifecycle, rules, eligibility snapshots — 204–210. |
| `/org/my/placement-interviews*` | Rounds, schedule, attendance, results, publication, issues, analytics — 211–220. |
| `/org/my/offers*` | Seasons, offers, joining, documents, analytics — 228–236. |
| `/org/my/messages*`, `/org/my/draft`, `/org/my/memberships`, `/org/my/inbox*`, `/org/my/issues*` | TPO/student communications and issues — 221–227. |
| `/api/outcomes/*` | Placement outcomes and calibration — 237–238. |
| `/api/tpo/training/*` | Training programs and sessions — 239–240, 243. |
| `/api/tpo/assessments/*` | Assessment creation/version/publication — 241–243. |
| `/org/my/health*` | AI provider health — 88. |
| `/ws/stt/*`, `/api/stt/transcribe` | Server speech-to-text — 62–65. |
| `/`, `/health`, `/health/awake`, `/health/ready` | Liveness, awake, and database readiness — 279–281. |

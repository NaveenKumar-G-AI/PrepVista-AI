import os

frontend_content = r"""# PrepVista Frontend Documentation

*A comprehensive product documentation breaking down the Next.js frontend architecture into clear, founder-level insights.*

---

## `app/page.tsx` & `app/login/page.tsx` — The Public Face
### What this code really is
These files constitute the public-facing landing and conversion sequence. They handle the "unauthenticated" state of the platform, driving users toward signup.

### Core purpose
1. **Communicates value:** The landing page clearly articulates the product offering: resume-based AI interview practice for early-career candidates.
2. **Drives conversion:** Features like the `LaunchOfferBanner` and dynamic waveforms trigger visual interest and urgency.
3. **Frictionless Entry:** The login page supports both simple email codes and Google OAuth.

### What makes this code strong
* **Suspense Boundaries:** Uses Next.js `Suspense` correctly to handle dynamic URL queries (like `?code=`) without breaking the static build of the surrounding page, ensuring instantaneous load times.

---

## `app/interview/[id]/page.tsx` — The Real-Time Interview Chamber
### What this code really is
This is the most complex UI component in the application. It acts as the visual and auditory client for the live mock interview simulation.

### Core purpose
1. **Audio/Video orchestration:** It hooks into the Web Speech API and MediaPipe (for camera/face tracking) to handle the actual back-and-forth of the interview.
2. **State Management:** Flawlessly transitions between 'INIT', 'USER_SPEAKING', and 'AI_SPEAKING' states so the user never feels lost.
3. **Integrity Monitoring:** Continuously tracks face stability (e.g., `FACE_MISSING_WARNING_FRAMES`) to enforce strict proctoring logic, warning the user if they look away or leave the frame.

### What makes this code strong
* **Client-side Audio Pruning:** Contains `LIVE_TRANSCRIPT_RULES` and pronunciation fixes right in the UI, fixing known STT glitches *before* the backend ever sees them. This makes the UI feel instantly responsive.

---

## `lib/api.ts` & `lib/auth-context.tsx` — The Data Pipeline
### What this code really is
These files are the central nervous system connecting the React UI to the Python backend. 

### Core purpose
1. **Centralized Fetching:** Replaces naked `fetch()` calls with a single `ApiClient` that automatically handles bearer tokens and JSON parsing.
2. **Global Auth State:** Uses React Context (`useAuth`) to keep the user's logged-in status and subscription plan available universally.
3. **Type Safety:** Defines exact TypeScript interfaces (`ApiUser`, `ApiReferralSummary`) mirroring the FastAPI models.

### What makes this code strong
* **Single Source of Truth:** A component anywhere in the tree can call `useAuth().user` and instantly know if the user is a Free or Pro tier, preventing layout judder or mismatched UI states.

---

## `components/SupportChatWidget.tsx` \& `app/admin/page.tsx` — The Feedback Loop
### What this code really is
The infrastructure for customer success. One side lives in the user dashboard, the other in the hidden admin God-mode.

### Core purpose
1. **In-app Support:** Users can instantly chat with founders while seeing their remaining quotas.
2. **VIP Dashboards:** Founders can immediately view user data (`ApiAdminOverview`), clear limits, approve launch offers, or reply to chats.

### What makes this code strong
* **Zero-context switching:** By building support chat directly into the core portal, founders don't have to jump to external tools (like Intercom) to see who a user is and what plan they are on.

"""

tests_content = r"""# PrepVista Tests Documentation

*A breakdown of the automated test suite ensuring platform stability.*

---

## `test_50_questions_validation.py` \& `test_grounded_questions.py` — The AI Assertions
### What this code really is
This is a massive, deterministic validation suite. It forces the generative AI engine to prove its consistency across 50 different variations of resumes and question families.

### Core purpose
1. **Bans Hallucinations:** Prevents the AI from outputting vague placeholders like "that project" or "your work there."
2. **Validates Grounding:** Asserts `_is_grounded(question)` by strictly demanding that generated questions match precise nouns found in the provided mock resumes.
3. **Cross-plan verify:** Checks Free, Pro, and Career prompts simultaneously to ensure no tier breaks entirely.

### What makes this code strong
* **AI Unit Testing:** It treats LLM outputs not as "magic text" but as structured data that must pass rigid deterministic assertions before deployment.

---

## `test_interview_logic.py` \& `test_email_validation.py` — Business Logic Sentinels
### What this code really is
Unit tests covering the non-AI, core business state-machines (scoring math, routing, email blocks).

### Core purpose
1. **Math Verification:** Ensures `compute_final_score` scales perfectly, proving the backend will never output an impossible dashboard score.
2. **Growth Protection:** Verifies that disposable domains or fake emails route to standard decline paths (`TEMPORARY_EMAIL_ERROR_MESSAGE`).

### What makes this code strong
* **Mock-free isolation:** Primarily tests the pure functions (`_ai_backend_resume_quality`, `normalize_difficulty_mode`) natively, meaning tests run in less than a second.

"""

scripts_content = r"""# PrepVista Scripts Documentation

*A breakdown of the automation and deployment tools.*

---

## `staging_smoke.py` — The Pre-Flight Checklist
### What this code really is
A specialized Python client script used by DevOps/Founders to simulate a furious, end-to-end user interview without having to click through the frontend.

### Core purpose
1. **Headless simulation:** Runs a full mock interview against the `PREPVISTA_BASE_URL` API from cold start to finish.
2. **Rapid regressions:** Asserts the database and routes are healthy after a deployment.

### What makes this code strong
* **Time to resolution:** Allows the founder to deploy the backend and verify the entire complex AI pipeline is working in about 5 seconds via terminal.

"""

with open("c:\\prepforme\\frontend_documentation.md", "w", encoding="utf-8") as f:
    f.write(frontend_content)

with open("c:\\prepforme\\tests_documentation.md", "w", encoding="utf-8") as f:
    f.write(tests_content)
    
with open("c:\\prepforme\\scripts_documentation.md", "w", encoding="utf-8") as f:
    f.write(scripts_content)

print("Markdown files generated successfully.")

# PrepVista Tests Documentation

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


import os

chunk = r"""
## `app/services/analytics.py` — The Progress Engine

### What this code really is
This file is the analytics and coaching intelligence layer. It takes finished interview evaluation data and turns it into clear skill insights, beginner-friendly coaching, persistent progress tracking, and reusable dashboard intelligence.

### Core purpose
1. **Converts raw data into insights:** Transforms question-by-question scoring into category-based performance signals (like "Communication" or "Technical Depth").
2. **Generates personal coaching:** Builds structured, direct feedback paragraphs instructing users exactly how to improve before their next session.
3. **Builds persistent skill snapshots:** Aggregates and saves skill rows to the database so progress can be plotted across a timeline.
4. **Maintains historical continuity:** Acts as a backfill agent to rebuild analytics for older interviews if the database schema ever drops or misses a save.

### What makes this code strong
* **Beginner-focused product thinking:** It doesn’t just show numbers; it writes "Do this next" advice that directly improves user capability.
* **Separation of delivery and content:** It breaks apart *what* you say from *how* you say it, yielding a much more realistic simulation score.

### Final impression of this code
This code is the **brain behind PrepVista’s progress system**. It elevates the platform from a simple chatbot simulator to a dedicated growth platform.

---

## `app/services/auth_identity.py` — Multi-Channel Login Manager

### What this code really is
This service acts as the central clearinghouse for identities, allowing PrepVista to merge disparate login methods (like email/OTP and Google OAuth) into one single, unified user account.

### Core purpose
1. **Maps foreign IDs to canonical profiles:** Ensures that if a user signs up via email and later logs in with Google, they still see the same dashboard.
2. **Extracts normalized identities:** Parses deeply nested Supabase metadata to find a clean email and provider string, no matter how the login occurred.
3. **Maintains the link table:** Automatically upserts the link between auth tokens and the platform's core `users` table.

### What makes this code strong
* **Frictionless Onboarding:** By seamlessly stitching together different auth methods behind the scenes, it prevents the dreaded "Account already exists with this email" error that causes massive user drop-off.

### Final impression of this code
This is the **user unification layer**. It handles the messy reality of multi-device, multi-provider logins cleanly, meaning the rest of the application never has to worry about *how* someone logged in.

---

## `app/services/evaluator.py` — The Master Rubric AI

### What this code really is
This file is the massive, highly-tuned grading engine. It takes the raw, unstructured interaction between a human and an LLM and maps it against strict rubrics to provide deterministic, fair scoring.

### Core purpose
1. **Drives per-question evaluation:** Analyzes a user's answer against the exact target angle the question was testing, scoring technical depth and communication separately.
2. **Maintains Tier Fairness:** Implements different "strictness" models (Free vs. Pro/Career) while ensuring that Free users never feel unfairly punished by advanced technical rubrics.
3. **Extracts structured strengths:** Pulls out specific quotes or "grounding facts" from the user's answer to prove *why* a certain score was given.
4. **Calculates deterministic finals:** Bypasses LLM math hallucination by strictly aggregating final scores natively in standard Python math logic.

### What makes this code strong
* **Extreme Semantic Guardrails:** It possesses dozens of heuristic fallbacks (like `_is_low_value_strength` and `_looks_too_generic_for_question`), aggressively filtering out instances where the fundamental AI evaluator is too vague or generic.
* **Math Safety:** Because the final percentage score is compiled deterministically by this code rather than the LLM, the scoring cannot hallucinate and break the dashboard.

### Final impression of this code
This code is the **academic integrity of the platform**. It tames the probabilistic chaos of GPT-style models and forces them to act like a strict, consistent, and highly predictable college professor.

---

## `app/services/interviewer.py` — The AI Conductor

### What this code really is
This file governs the "living" aspect of the mock interview. It acts as the prompt engineer, the conversation flow-manager, and the memory controller for the AI interviewer.

### Core purpose
1. **Builds smart live prompts:** Generates the highly specific context prompt for the LLM on every turn, injecting the user's resume, prior answers, and the target question family.
2. **Prevents robot-looping:** Uses memory extraction (`_derive_redundant_followup_families`) to legally block the AI from asking the same question twice or digging into topics the candidate already thoroughly covered.
3. **Humanizes the tone:** Normalizes and shapes the final AI text response, stripping out weird punctuation or robotic introductions so it feels like a real conversation.

### What makes this code strong
* **Answer-Led Adaptation:** It reads the candidate's last answer, picks out concrete facts, and anchors the next question to those facts (`_build_answer_anchor_summary`). This makes the AI feel like it's genuinely listening rather than just reading down a rigid list.
* **Duplicate Defense:** It employs advanced semantic signature tracking (`_question_signature`) to physically prevent the LLM from asking synonymous questions.

### Final impression of this code
This code provides the **illusion of life**. It takes a raw LLM inference API and wraps it in so much conversational awareness and memory management that the end user forgets they are talking to a machine.

---

## `app/services/history_retention.py` & `app/services/funnel_tracking.py` — Data Lifecycle & Insights

### What these codes really do
These files handle backend data pruning and product-led telemetry, ensuring the database stays clean while product decisions stay informed.

### Core purpose
1. **Enforces plan retention limits:** Automatically prunes old interview histories when users exceed the storage limits defined by their subscription tier (Free vs. Pro).
2. **Tracks high-signal conversion events:** Captures anonymous and authenticated funnel actions for growth analysis, fully bypassing external script blockers.

### What makes this code strong
* **Privacy by Design:** It actively deletes user recordings and history that sit outside of paid retention bounds, lowering server bloat and remaining compliant with data minimalization principles.

### Final impression of this code
These two services represent **platform maturity**. They ensure the application manages its data overhead responsibly while still yielding the intelligence the business needs to grow.
"""

with open("c:\\prepforme\\app_documentation.md", "a", encoding="utf-8") as f:
    f.write("\n" + chunk)
print("Chunk 3 appended successfully")

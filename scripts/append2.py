import sys
text = """
## Core Services (`app/services/`)

### `app/services/analytics*.py` (incl. `analytics_cohort.py`, `analytics_student.py`)
**Level:** Core Intelligence
This suite of files forms the analytics and progress engine. It converts raw interview scoring data into visualizable metrics, category-based performance signals, and percentile rankings. It generates personalized, actionable feedback instructing students exactly how to improve, and builds aggregated dashboards for B2B cohorts.

### `app/services/auth_identity.py`
**Level:** Auth Unification
This service acts as the central clearinghouse for user identities. It seamlessly merges disparate login methods (like email OTP and Google OAuth) into a unified canonical user profile, preventing duplicate accounts and friction during login.

### `app/services/email_service.py` & `app/services/email_validation.py`
**Level:** Communications & Security
These services handle outgoing transactional emails and aggressive input validation. They verify that emails are structurally sound, block known fake or disposable domains, and integrate with SMTP or Gmail APIs to deliver verification codes safely without getting marked as spam.

### `app/services/evaluator*.py` (incl. `evaluator_feedback.py`, `evaluator_grounding.py`, `evaluator_scoring.py`)
**Level:** Master Rubric AI
This massive evaluation engine grades unstructured candidate answers against strict rubrics. It assesses technical depth and communication separately, applies tiered strictness (Free vs. Pro), extracts quotes to prove why a score was given (grounding), and calculates deterministic percentage scores to prevent LLM hallucination.

### `app/services/funnel_tracking.py`
**Level:** Product Telemetry
This service captures back-end conversion events and funnel progression (like plan upgrades and signups). It formats and sanitizes event metadata to be consumed by external analytics platforms, providing deep product-led growth insights without frontend ad-blocker interference.

### `app/services/groq_client.py` & `app/services/llm.py`
**Level:** AI Vendor Integration
These files manage the high-performance connections to external LLM providers (primarily Groq and OpenAI). `groq_client.py` implements advanced resiliency patterns including circuit breakers, token bucket rate limiting, and API key rotation to ensure the AI never goes down due to vendor rate limits.

### `app/services/history_retention.py` & `app/services/quota.py`
**Level:** Plan Enforcement
These services act as the strict ledger of consumption. They enforce 30-day billing lifecycles, manage usage limits (e.g., 3 interviews per month for Free tier), and automatically prune old interview histories that fall outside of a user's paid retention boundaries to save database costs.

### `app/services/interviewer*.py` (incl. `interviewer_question_engine.py`, `interviewer_helpers.py`, `interviewer_templates.py`)
**Level:** The AI Conductor
This logic block controls the "living" aspect of the mock interview. It generates dynamic contextual prompts, enforces question coverage based on the user's resume, builds semantic signatures to prevent repeat questions, and humanizes the final AI text response so it feels conversational rather than robotic.

### `app/services/launch_offer.py`
**Level:** Marketing Logic
This lightweight service tracks time-bound promotional logic (like a 24-hour launch offer). It parses timestamps and determines if a user is still eligible for a discounted checkout, enforcing urgency accurately on the backend.

### `app/services/manual_signup_verification.py`
**Level:** User Acquisition
This file provides a highly reliable, synchronous fallback for sending email verification codes via the Gmail API if standard SMTP services fail or are misconfigured. It acts as a safety net ensuring users can always sign up and receive their OTPs.

### `app/services/plan_access.py`
**Level:** Access Control
This service validates active subscriptions against their expiration dates. It maps database rows to operational tiers (Free, Pro, Career) and seamlessly handles tier downgrades or expirations, securely locking premium features.

### `app/services/prompts*.py`
**Level:** Psychological Architecture
These files hold the master instructions that dictate the personality, tone, and strictness of the underlying LLM. They combine user resumes, target roles, and session history into a single structured prompt, forcing the AI to output parseable JSON format.

### `app/services/public_growth.py`
**Level:** Growth Mechanics
This service extracts vanity metrics (like "1,000+ Frontend Developers practicing") directly from live database activity. It normalizes terms to feed real-time, trustworthy social proof data back to the unauthenticated landing page.

### `app/services/razorpay_service.py`
**Level:** Revenue Integration
This acts as the bridge to the Razorpay payment gateway. It initializes the SDK, handles the creation of secure server-side orders, and processes asynchronous webhooks, ensuring zero dropped payments.

### `app/services/referrals.py`
**Level:** Viral Growth
Handles the logic for generating unique referral URLs and tracking invite attributions. It enforces referral limits (so users cannot farm unlimited credits) and acts as the backend for the platform's organic growth engine.

### `app/services/report_*.py` (incl. `report_builder.py`, `report_generator.py`, `report_render.py`)
**Level:** PDF Export Engine
This suite converts ephemeral digital interviews into concrete, professional PDF documents. Using standard layout libraries, it styles text, creates structured rubric tables, and generates physical proof of performance that premium users can share with mentors or recruiters.

### `app/services/resume_parser.py`
**Level:** Data Ingestion
This file takes unstructured PDF resumes and converts them into actionable data points. It safely extracts text, defends against prompt injection within the PDF, and automatically determines the user's target industry/role to personalize their first interview immediately.

### `app/services/session_prefetch.py`
**Level:** UX Optimization
This advanced service predicts and pre-generates the first interview question asynchronously while the user is still navigating the setup screens. It ensures that the moment the user clicks "Start Interview", the AI is already waiting with an answer, dropping latency to zero.

### `app/services/technical_taxonomy.py`
**Level:** Classification
This file provides the static mapping or logic for categorizing various technical skills (e.g., matching React to Frontend, Docker to DevOps). It helps the analytics engine group random skills into meaningful core competencies.

### `app/services/transcript.py`
**Level:** Voice Intelligence Recovery
This service acts as a middleware between raw Speech-to-Text output and the AI evaluator. It cleans up stuttering (e.g., "um", "uh"), collapses stretched words, and uses contextual heuristics to recover technical terms that a poor microphone might have misheard, ensuring users are graded fairly.

### `app/services/user_activity.py`
**Level:** Analytics
Tracks raw user activity logs, enabling the business to see MAU (Monthly Active Users) and DAU metrics. It is a fundamental piece of the platform's engagement monitoring.

### `app/services/__init__.py`
**Level:** Python Package
Designates the services directory as a Python package.
"""
with open(r'C:\Users\ADMIN\.gemini\antigravity-ide\brain\07430001-d606-46f6-99b7-aeadc94d58a6\full_codebase_documentation.md', 'a', encoding='utf-8') as f:
    f.write(text)

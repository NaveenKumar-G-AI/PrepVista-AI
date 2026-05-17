import os

chunk = r"""
## `app/routers/auth.py` — Identity Gateway

### What this code really is
This file manages the entire authentication journey. It is the bridge between the custom Next.js frontend and the Supabase Auth backend, handling everything from email-code signups to OAuth linking and JWT token refreshing.

### Core purpose
1. **Validates signups rigorously:** Rejects fake, undeliverable, or temporary emails to keep the userbase high-quality.
2. **Manages One-Time Codes (OTP):** Drives the password-less onboarding flow, dropping the friction of password memory.
3. **Connects Google OAuth:** Handles social login flows seamlessly, matching Google logins to existing profiles when emails overlap.
4. **Maintains sessions:** Automatically refreshes expiring access tokens so the user is never abruptly logged out in the middle of a session.

### What makes this code strong
* **High-friction rejection:** By actively blocking known disposable email providers, it stops bot farms from eating up trial credits or polluting the database.
* **Service Role safety:** It uses elevated service role keys strictly when necessary (like deleting bad accounts) while relying on secure client JWTs for standard flows.

### Final impression of this code
This is the **doorway to the product**. It handles security and user identity elegantly without keeping passwords in the local database, offering a modern, password-less entry point that maximizes signup conversion while minimizing fraud.

---

## `app/routers/dashboard.py` — The Command Center

### What this code really is
This file powers the primary user interface after login. It gathers an individual user's complete history—past interviews, performance stats, and current subscription plan—and serves it in a single fast request.

### Core purpose
1. **Aggregates usage:** Counts how many interviews a user has completed and retrieves their historic scores to plot progress over time.
2. **Exposes skill breakdown:** Fetches the persistent skill graphs (derived by the analytics engine) to show exactly where the user is improving or struggling.
3. **Provides data sovereignty:** Allows users to bulk-delete or single-delete their past interview sessions to comply with data privacy and fresh-start requests.

### What makes this code strong
* **Payload Density:** Instead of forcing the frontend to make 5 different API calls to build the dashboard, this endpoint compiles all necessary contextual data into one highly efficient payload.
* **Aggressive Caching:** It utilizes the backend database connections effectively to query and return heavy metrics quickly.

### Final impression of this code
The dashboard router is the **retention engine**. It transforms raw interview data into a persistent progression system, ensuring that users see immediate, quantifiable value from the time they invest in the platform.

---

## `app/routers/interviews.py` — The Core Simulation Loop

### What this code really is
This file is the beating heart of the PrepVista product. It controls the real-time, back-and-forth mock interview loop between the human user and the AI agent. 

### Core purpose
1. **Safeguards session state:** Validates that an interview is legally active before accepting answers, preventing ghost submissions or duplicate requests.
2. **Handles answer submissions:** Accepts user audio/text answers, records the time taken, and requests the next question from the AI Interviewer service.
3. **Protects against network drops:** Implements idempotency caching, meaning if a user's internet flickers and they submit an answer twice, the backend safely returns the cached next question without double-charging their quota or confusing the AI.
4. **Polices behavior:** Registers and handles proctoring violations (e.g., leaving the browser tab) to maintain testing integrity.

### What makes this code strong
* **Idempotent resilience:** The `_cache_client_response` logic guarantees that poor network conditions don't destroy a perfect interview session.
* **Decoupled execution:** It offloads the heavy AI evaluation tasks to background processes (`background_tasks.add_task`), ensuring the API responds to the user instantly instead of hanging while waiting for the LLM.

### Final impression of this code
This is the most **mission-critical synchronization code** in the app. It makes the complex process of talking to an AI feel as instantaneous, reliable, and fault-tolerant as talking to a real human.

---

## `app/routers/billing.py` — Revenue Operations

### What this code really is
This file connects PrepVista to Razorpay, handling the critical lifecycle of plan purchases, payment verifications, and subscription state changes.

### Core purpose
1. **Initiates transactions:** Generates secure Razorpay order IDs required to launch the front-end checkout UI.
2. **Verifies revenue locally:** Validates Razorpay payment cryptographic signatures server-side before ever granting premium access.
3. **Responds to Webhooks:** Listens for asynchronous payment confirmations from Razorpay so users get their upgrades even if they close their browser during checkout.

### What makes this code strong
* **Cryptographic Trust:** Never trusts the client. It forces absolute signature validation (`verify_razorpay_payment`) so nobody can fake a successful payment.
* **Atomic Plan Switching:** Allows paying users to seamlessly switch between tiers (e.g., from Tech to PM) without accidental double-billing.

### Final impression of this code
This code guarantees that **product monetization is airtight**. It protects the company's revenue stream from fraud while ensuring legitimate paying customers get instant, reliable access to their premium tools.

---

## `app/routers/admin.py` & `app/routers/admin_support.py` — Platform God-Mode

### What this code really is
These files provide the administrative oversight and customer support backend. Only authorized founder/admin accounts can cross this boundary.

### Core purpose
1. **Support Chat Plugin:** Allows the admin to pull active user threads and insert live responses directly into a user's dashboard chat widget.
2. **Global Overviews:** Aggregates top-level metrics on users, feedback flags, and launch-offer distribution.
3. **Override Limits:** Empowers admins to manually reset quotas or grant specific subscription tiers to resolve customer service issues directly.

### What makes this code strong
* **Absolute Gatekeeping:** Protects all endpoints behind a rigid `require_admin` dependency that forces an exact email match, ignoring all other credentials.

### Final impression of this code
This is the **customer success operating system**. It allows the team to resolve bugs, monitor product health, and provide hands-on, VIP support without ever needing to touch a database console directly.
"""

with open("c:\\prepforme\\app_documentation.md", "a", encoding="utf-8") as f:
    f.write("\n" + chunk)
print("Chunk 2 appended successfully")

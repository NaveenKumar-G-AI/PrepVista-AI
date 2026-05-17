# PrepVista Scripts Documentation

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


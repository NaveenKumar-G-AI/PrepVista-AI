# CodeForge Evaluation Engine

A real, tested reference implementation of the coding-evaluation +
diagnosis + evidence + feedback pipeline described in the CodeForge AI
brief.

**Read `docs/CODEFORGE_FINAL_REPORT.md` first** — it explains why this is
a standalone build rather than an integration (there is no host
repository in this environment), and gives an honest IMPLEMENTED /
PARTIAL / NOT IMPLEMENTED breakdown per capability.

## Quick start

```bash
pip install -r requirements.txt
python3 -m pytest -v                 # 56 tests, real execution + real HTTP
python3 -m uvicorn app.main:app --reload
```

Open `frontend/index.html` in a browser (or serve it — see
`frontend/README.md`) for a working reference UI against the real API.

`POST /attempts` returns fast with deterministic results only; diagnosis,
evidence, skill updates, and feedback run in the background (Phase 35) —
poll `GET /attempts/{attempt_id}` and check `analysis_status`. See
`docs/CODEFORGE_API.md`.

To enable live AI (diagnosis, feedback, explanation evaluation, complexity
reasoning), set exactly one of `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, or
`GEMINI_API_KEY` as a real environment variable before starting the
server. Without one, everything correctly falls back to
`AI_EVALUATION_PENDING` rather than fabricating output — see
`docs/CODEFORGE_AI_EVALUATION.md`.

## Docs

- `CODEFORGE_EVALUATION_ARCHITECTURE.md` — pipeline + module map + frontend/reporting
- `CODEFORGE_EVIDENCE_ENGINE.md`
- `CODEFORGE_DIAGNOSIS_ENGINE.md`
- `CODEFORGE_FEEDBACK_ENGINE.md`
- `CODEFORGE_SKILL_MODEL.md`
- `CODEFORGE_AI_EVALUATION.md` — what's actually wired to a live model call
- `CODEFORGE_SECURITY.md` — includes role-based access for management reports
- `CODEFORGE_TESTING.md` — includes how the frontend was verified without a browser
- `CODEFORGE_API.md`
- `CODEFORGE_DATABASE.md`
- `CODEFORGE_FINAL_REPORT.md` — truth table + all 8 real bugs found + how to run/verify everything
- `../frontend/README.md` — the reference UI's design rationale and verification method

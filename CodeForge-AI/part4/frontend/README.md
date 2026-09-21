# CodeForge reference frontend (Phase 38)

A single self-contained `index.html` — no build step, no framework,
vanilla JS calling the real API via `fetch()`. This is what "integrate
with the existing CodeForge coding workspace" becomes when there is no
existing workspace to integrate with (see the top-level
`docs/CODEFORGE_FINAL_REPORT.md` §1): a real, working reference UI
against the real API contract, not a mockup.

## Design

The one thing this system does differently from a generic judge UI is
that it never presents an inference as a fact. The UI's signature element
carries that through: every claim — a complexity estimate, a diagnosis
observation, a feedback line — is tagged with where it came from
(`OBSERVED` / `INFERRED` / `ESTIMATED` / `AI_GENERATED` /
`AI_EVALUATION_PENDING`), styled as small provenance chips rather than
buried in prose. That's grounded in the actual brief (Phase 11's
observation/inference split, Phase 8's OBSERVED/INFERRED/ESTIMATED
labels), not a decorative add-on.

## Run it

```bash
# 1. Start the real API (from the project root)
python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Open frontend/index.html directly in a browser (file:// is fine —
#    it's a static file that talks to the API over fetch()), or serve it:
python3 -m http.server 5500 --directory frontend
```

Enter the API's base URL and a student ID on the connect screen. It calls
`POST /dev/token` to mint a session — see the loud warning in
`app/auth.py` and `main.py`'s `/dev/token` route about why that endpoint
must never exist in a real deployment; it's a stand-in for a real login
flow this sandbox doesn't have.

## How this was actually verified

No visual browser was available in the environment this was built in.
Two independent checks were run instead, both real, neither simulated:

1. `node --check` on the extracted `<script>` contents — syntax only.
2. `drive_frontend.mjs` (this directory) — loads `index.html` into a real
   jsdom DOM with `runScripts: "dangerously"`, wires in Node's real
   `fetch`, and drives it exactly like a user would: fills the connect
   form, clicks buttons, waits for the real polling loop, and inspects
   the rendered HTML — against an actual running instance of the API,
   not a mock. This caught a real bug (`GET /challenges` sorting
   `difficulty` alphabetically, which put `ADVANCED` before `EASY`) that
   a syntax check alone would never have found.

To re-run it:
```bash
cd frontend
npm install          # installs jsdom into node_modules (not shipped in this package)
# in another terminal: python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8899
node drive_frontend.mjs
```

**What this does NOT prove:** actual visual layout, real-browser
rendering quirks, or a human clicking through it. `node_modules/` is
excluded from this package — reinstall with `npm install` to re-run the
driver. The `.gitignore`-equivalent exclusion is intentional: it's a
27MB dev dependency for a testing harness, not part of the shipped page.

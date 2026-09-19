# Question policy

`app/services/data/interview_questions.json` is the versioned seed catalog.
Pydantic validates each definition, enabled state, family and safe wording.
All 31 requested families are represented. Questions have separate primary,
situational and closing types; live instances add FOLLOWUP and an anchor ID.

The supplied transformation brief contains examples, not the referenced full HR
master bank. Seed source is explicitly `transformation-brief-examples`; no claim
is made that the missing master bank was imported. Edit JSON to version/disable
an intent without changing orchestration code; restart workers to refresh cache.

Blueprints select eligible families for the chosen mode, role, department,
duration and current plan allowance. An internship requires an internship
signal. ML requires relevant role/department context. Salary/offer questions
require an explicit offer-stage signal and appropriate mode. Custom categories
are validated. Opening and closing are always reserved. Project defense may
repeat PROJECT with distinct subfamilies; other modes select distinct families.

The planner follows stable blueprint priority among remaining primary slots.
It does not claim to implement a calibrated weighted ranking model. Role-based
technical intents cover backend, frontend, full stack, data analysis/engineering,
ML, GenAI, cloud/DevOps, security, QA and embedded work. Company/JD questions
refer to supplied context without asserting company facts or crawling URLs.

Known recent question signatures choose alternate wording where available.
This is exact signature novelty, not semantic deduplication or a guarantee of
unlimited novel sessions. Difficulty labels adapt to observed textual signals;
advanced difficulty-specific question calibration remains future work.

# CodeForge Source Allowlist

Status: **BEHAVIORAL REFERENCE ONLY — NOT A COPY LICENSE**

This allowlist narrows engineering review. It does not override the provenance blocker. Any Phase 1B implementation must be clean-room unless permission is established.

## Candidate behavioral references

| Relative path | SHA-256 | Intended concept |
|---|---|---|
| `src/parsers/ir.ts` | `863258b971c5d98851fad210c4b69bc1dbb476af4aa655ccb843f17c1e02d5ac` | Language-neutral normalized IR |
| `src/engine/correctness/classify.ts` | `98a445b93003cf1b3c69e30431e5767e0fb42d26386362c0b627ea97252d54c1` | Evidence-only verdict |
| `src/engine/correctness/confidence.ts` | `4a367a960ff9ba2ddde6fd5c2fae93a48488b4bfa6ba07d51ee296a9b13568d1` | Confidence reasons |
| `src/engine/correctness/regression.ts` | `55e1a15590464619799548f0a5844c5899b5d4726d0b76cf59cae84464232d20` | Before/after delta |
| `src/engine/correctness/requirementCoverage.ts` | `5d5326d163af110bb3eb2106a5a89de5582758b67ee38a19246141da5ec382b6` | Tagged requirement coverage |
| `src/engine/quality/config.ts` | `d7b95a259d0edd435e9d8043bce9d68f1f5c1af8dad08f3f2f95de428943d4ed` | Versioned rule weights |
| `src/engine/quality/rules.ts` | `fa206d6d100e92737b22eb74aeaae6a1b2f1c447bfc260402f8eff472796e484` | Deterministic quality findings |
| `src/engine/quality/scoring.ts` | `c2055da538f11f0d91b1acbda427381db709ba498fb12d6a0b3b00b388aec30a` | Deterministic score aggregation |
| `src/engine/understanding/engine.ts` | `6c0aaf0b7be1e6230773ed465ad322abed89ae5bd0a739883f392f2ba3ec23a8` | Probe/evidence concepts |
| `src/engine/debugging/stateMachine.ts` | `6c72d507d14ca18e0272159b75496b4a53317550d64bacf5af49c7ed0c335987` | Debugging workflow concepts only |
| `src/engine/debugging/skillModel.ts` | `c5ecef00a2c303f3df60495dc0a5d207226d873cfb6b24073cb87a0e47564c79` | Debugging dimensions |
| `src/engine/mastery.ts` | `e19b11904ab80b50f7ecbfda200fd973d32715f947df30d1df38bc9ba37dcbbf` | Evidence weighting/gates |
| `src/engine/gap/analyzer.ts` | `8a8a912a740bcecbd2b098ec038786c9dffdf4d31d443d2a6934936d31ac9c26` | Unknown-aware gap concepts |
| `src/engine/adaptive/selector.ts` | `dd3663c7b483392267ec5538de9082964ab22501071709407da604b6b077d956` | NBA objective concepts |
| `src/engine/adaptive/pathState.ts` | `cc8990d892be581ac8237c75df8e881d984c4c95fdfaa4df6a34d1595dc21698` | Versioned learning path state |
| `src/engine/complexity/index.ts` | `2f38588415ad0c8ab7a235064d0188e25268d2c38f0a2631b9b0a6e8571c9826` | Static complexity evidence |
| `src/engine/reasoning/verifiers.ts` | `e4393fe821e4d7772169dd2e777cc7abdb2fadb7c50d90f6f791c9e459805646` | Claim verification concepts |
| `src/engine/consistency/index.ts` | `f82cb82f2f715b7b8734249bee367111bea9b30f068f1ccc63002520f966e699` | Cross-signal contradiction concepts |
| `src/engine/review/engine.ts` | `7deddb4b115f357c04f7c5b0b36be3f7807f612aa7f157f7d709e361b65eb7ae` | Review scheduling concepts |

## Explicit exclusions

All other files are excluded, especially `node_modules/`, `dist/`, `.git/`, databases, archives, generated output, frontend assets, migrations, server/API/auth code, repositories, AI providers, report/PDF code, local process providers, sandbox runners, validation executors, readiness engine, and signal normalizer. `src/domain/types.ts` and `src/config/index.ts` are not allowed wholesale; Phase 1B must define minimal PrepVista-owned contracts and configuration.

Forbidden production dependency classes are `express`, `pg`, `better-sqlite3`, `jsonwebtoken`, `jose`, `pdfkit`, Node process/filesystem/network modules, AI providers, repositories, HTTP routes, and execution runners. A static boundary test must fail if a technical-engine module imports one of them.

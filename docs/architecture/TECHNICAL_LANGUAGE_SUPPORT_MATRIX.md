# Technical Language Support Matrix

Status: **NON-EXECUTING Phase 1A design**

| Language | Correctness evidence ingestion | Static quality | Complexity hints | Understanding/debugging prompts | User-code execution |
|---|---|---|---|---|---|
| Python 3 | Planned from trusted external results | Planned V1 | Planned V1, bounded/heuristic | Planned V1 | Not supported |
| JavaScript (ES2022) | Planned from trusted external results | Planned V1 | Planned V1, bounded/heuristic | Planned V1 | Not supported |
| TypeScript 5 | Planned from trusted external results | Planned V1 after parser validation | Planned V1, bounded/heuristic | Planned V1 | Not supported |
| Java 17 | Contract reserved | Deferred | Deferred | Generic text-only until parser exists | Not supported |
| C++17 | Contract reserved | Deferred | Deferred | Generic text-only until parser exists | Not supported |
| SQL | Not supported in V1 | Deferred | Not applicable | Deferred | Not supported |

“Supported” never means sandbox execution. V1 may analyze text/IR and consume signed results from a future separately approved execution system. Parse failures return `UNSUPPORTED_SYNTAX` or `INCONCLUSIVE`, never a guessed score. Language and parser versions are stored on every artifact/result.


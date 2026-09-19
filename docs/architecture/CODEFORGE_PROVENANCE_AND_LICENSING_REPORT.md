# CodeForge Provenance and Licensing Report

Status: **BLOCKED FOR VERBATIM REUSE**  
Assessment date: 2026-09-07  
Scope: the untracked `CodeForge-AI/` snapshot only

## Finding

The snapshot does not establish a legally usable source provenance chain. It has no nested Git metadata, origin URL, commit identifier, author/copyright owner, `LICENSE`, `COPYING`, or `NOTICE` file. `CodeForge-AI/README.md` contains only a heading and the word `MIT`. That is not a complete MIT grant and does not identify the copyright holder. `CODEBASE_FEATURE_CATALOG.md` identifies an audited local folder (`C:\CodeForge-AI\unified`), not an original repository.

Several part documents say they were designed without a live repository or reference implementation. Those statements describe development context; they do not establish ownership or permission.

| Required provenance field | Evidence | Result |
|---|---|---|
| Original repository URL | None in Git metadata, README, or package metadata | Unknown |
| Original commit/tag | None | Unknown |
| Author/copyright holder | None | Unknown |
| Full license grant | No license file; one-word README claim only | Not established |
| Permission to integrate | None | Not established |
| Third-party copied code | No source banners found; absence is not proof | Unknown |
| Dependency declarations | npm lockfile present and integrity-pinned | Established for packages, not authored source |

## Required classification

No authored CodeForge component is currently **SAFE TO REUSE** verbatim.

| Class | Components | Rule |
|---|---|---|
| SAFE TO REUSE | None of the authored snapshot | Requires verified origin, owner, commit, and applicable license text first |
| REIMPLEMENT FROM SPECIFICATION | Correctness classification, deterministic quality rules, understanding probes, debugging state, mastery/gap/adaptive concepts, complexity/reasoning/consistency/review concepts | Treat behavior and public concepts as requirements; write new PrepVista-owned code without copying expression, comments, names, or structure |
| REQUIRES PERMISSION | Every authored `.ts`, `.js`, SQL, UI, document, and test file if copied or adapted | Obtain written ownership/license proof before verbatim or derivative reuse |
| DO NOT USE | CodeForge server/auth, repositories/database, frontend, AI providers, PDF/report stack, local process/sandbox/execution code, readiness implementation, signal normalizer | Conflicts with PrepVista boundaries, contains unsafe execution or wrong semantics, or duplicates canonical systems |

## Dependency-license inventory

Lockfile: `package-lock.json` SHA-256 `4dba0b994e0e9825d5ab636d2db46e41575576d4f7aa9e0290c9ec7080623a22`. The lock contains 424 package entries: MIT 355, ISC 26, Apache-2.0 11, BSD-3-Clause 6, BSD-2-Clause 6, MPL-2.0 12, Python-2.0 1, BlueOak-1.0.0 1, 0BSD 1, compound expressions 3, and unknown 2. These are metadata counts, not a completed legal review. MPL and unknown entries require file-level review before distribution. An SBOM plus bundled license texts/notices is required if any dependency enters production.

All 16 direct runtime packages resolve with MIT metadata: `@types/jsonwebtoken@9.0.10`, `@types/pdfkit@0.17.6`, `@types/pino@7.0.4`, `@types/pino-http@5.8.4`, `better-sqlite3@9.6.0`, `compression@1.8.1`, `cors@2.8.6`, `express@4.22.2`, `helmet@7.2.0`, `jose@5.10.0`, `jsonwebtoken@9.0.3`, `pdfkit@0.20.2`, `pg@8.23.0`, `pino@10.3.1`, `pino-http@11.0.0`, and `zod@3.25.76`. Direct development packages resolve as MIT except `typescript@5.9.3` (Apache-2.0). Package metadata still requires verification against distributed license texts.

## Evidence needed to clear the blocker

Provide the original repository URL, immutable commit SHA, author/owner identity, complete license file at that commit, and written confirmation that all submitted content may be used commercially. Then run a source-to-origin hash/diff check and dependency notice review. Until all five checks pass, Phase 1B may only create clean-room PrepVista implementations from the approved specifications and tests.

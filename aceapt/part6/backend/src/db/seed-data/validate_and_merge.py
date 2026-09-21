"""
Question Quality Pipeline (spec section 47/48), run at build time.

Structural Validation -> Answer Presence Validation -> Quality Gate -> questions.json

This is intentionally a real gate: if any question fails, the script exits
non-zero and questions.json is NOT (re)written, so a broken question can
never silently reach the assessment pool. It is the static-content
equivalent of what services/questionQualityService.ts does at runtime for
any question added later (e.g. AI-assisted authoring, per section 54 - AI may
help draft a question, but this deterministic gate decides if it's usable).
"""
import json
import sys
from collections import Counter

VALID_DOMAINS = {"QUANTITATIVE", "LOGICAL", "VERBAL"}
VALID_TOPICS = {
    "ARITHMETIC", "ALGEBRA", "DATA_INTERPRETATION",
    "ANALYTICAL_REASONING", "PATTERNS_SERIES", "GRAMMAR", "READING_COMPREHENSION",
}
VALID_DIFFICULTIES = {"EASY", "MEDIUM", "MEDIUM_PLUS", "HARD"}


def validate(all_questions):
    ids_seen = set()
    errors = []
    for q in all_questions:
        qid = q.get("id", "<missing id>")
        if qid in ids_seen:
            errors.append(f"{qid}: duplicate question id")
        ids_seen.add(qid)
        if q.get("domain") not in VALID_DOMAINS:
            errors.append(f"{qid}: invalid domain {q.get('domain')!r}")
        if q.get("topic") not in VALID_TOPICS:
            errors.append(f"{qid}: invalid topic {q.get('topic')!r}")
        if q.get("difficulty") not in VALID_DIFFICULTIES:
            errors.append(f"{qid}: invalid difficulty {q.get('difficulty')!r}")
        options = q.get("options", [])
        if len(options) < 4:
            errors.append(f"{qid}: fewer than 4 options")
        opt_ids = [o["id"] for o in options]
        if len(opt_ids) != len(set(opt_ids)):
            errors.append(f"{qid}: duplicate option ids")
        opt_texts = [o["text"] for o in options]
        if len(opt_texts) != len(set(opt_texts)):
            errors.append(f"{qid}: duplicate option text (ambiguous correct answer)")
        if q.get("correctOptionId") not in opt_ids:
            errors.append(f"{qid}: correctOptionId does not match any option id")
        if not q.get("explanation", "").strip():
            errors.append(f"{qid}: missing explanation")
        if not isinstance(q.get("expectedTimeSeconds"), (int, float)) or q["expectedTimeSeconds"] <= 0:
            errors.append(f"{qid}: invalid expectedTimeSeconds")
        if not q.get("skill", "").strip():
            errors.append(f"{qid}: missing skill tag")
    return errors


def main():
    with open("templated_questions.json") as f:
        templated = json.load(f)
    with open("handauthored_questions.json") as f:
        handauthored = json.load(f)

    all_questions = templated + handauthored
    errors = validate(all_questions)

    if errors:
        print(f"QUALITY GATE FAILED - {len(errors)} question(s) rejected:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Quality gate passed: {len(all_questions)} questions are HEALTHY.")
    print("By topic:   ", dict(Counter(q["topic"] for q in all_questions)))
    print("By difficulty:", dict(Counter(q["difficulty"] for q in all_questions)))
    print("By domain:  ", dict(Counter(q["domain"] for q in all_questions)))

    with open("questions.json", "w") as f:
        json.dump(all_questions, f, indent=2)
    print("Wrote questions.json (this is what db/seed.ts loads).")


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
from pathlib import Path

from app.db import get_conn

SEED_PATH = Path(__file__).parent / "challenges" / "seed_challenges.json"


def load_seed_data() -> None:
    conn = get_conn()
    data = json.loads(SEED_PATH.read_text())

    for s in data["students"]:
        conn.execute(
            "INSERT OR IGNORE INTO students (student_id, display_name, track) VALUES (?,?,?)",
            (s["student_id"], s["display_name"], s["track"]),
        )

    for p in data["skill_prerequisites"]:
        conn.execute(
            "INSERT OR IGNORE INTO skill_prerequisites (skill_id, requires_skill_id) VALUES (?,?)",
            (p["skill_id"], p["requires_skill_id"]),
        )

    for c in data["challenges"]:
        conn.execute(
            """INSERT OR IGNORE INTO challenges
               (challenge_id, challenge_version, title, role, skill_id, subskill_id,
                difficulty, language, description, starter_code, prompts_explanation, is_seed)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,1)""",
            (c["challenge_id"], c["challenge_version"], c["title"], c.get("role"),
             c["skill_id"], c.get("subskill_id"), c["difficulty"], c["language"],
             c["description"], c.get("starter_code"), c.get("prompts_explanation")),
        )
        for t in c["tests"]:
            conn.execute(
                """INSERT OR IGNORE INTO challenge_tests
                   (test_id, challenge_id, challenge_version, is_hidden, input_data, expected_output, ordinal)
                   VALUES (?,?,?,?,?,?,?)""",
                (t["test_id"], c["challenge_id"], c["challenge_version"], int(t["is_hidden"]),
                 t["input_data"], t["expected_output"], t["ordinal"]),
            )
    conn.commit()

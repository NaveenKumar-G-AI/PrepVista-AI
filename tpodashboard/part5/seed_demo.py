"""
DEMO / TEST SEED ONLY. Per section 75 of the spec, fixtures like this
must never run against a production institution — this script exists
so the module can be exercised and demoed standalone. It uses Python's
`random` with a fixed seed purely to generate plausible demo names; no
random generation of this kind exists anywhere in the interviews/*
production code paths (those are 100% real computed queries — verified
in PART5_REPORT.md's synthetic-data sweep).
"""

import random
import uuid
from datetime import datetime, timedelta, timezone

from interviews.db import init_db, get_conn
from interviews.enums import (InterviewStatus, AttendanceStatus, ResultValue, ResultSource,
                               PublicationState, RoundExecutionStatus, IssueType)
from interviews import scheduling, results as results_module, import_pipeline

random.seed(42)

FIRST_NAMES = ["Aditi", "Rahul", "Priya", "Arun", "Sneha", "Vikram", "Divya", "Karthik", "Meera", "Suresh",
               "Ananya", "Rohit", "Kavya", "Nikhil", "Pooja", "Sanjay", "Lakshmi", "Varun", "Ishita", "Manoj",
               "Deepa", "Arjun", "Nisha", "Ravi", "Swathi", "Harish", "Preethi", "Ajay", "Radha", "Kiran"]
LAST_NAMES = ["Kumar", "Sharma", "Reddy", "Iyer", "Nair", "Rao", "Menon", "Pillai", "Gupta", "Verma"]
DEPARTMENTS = ["Computer Science", "Information Technology", "Electronics & Communication"]


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


def run(fresh=True):
    init_db(fresh=fresh)
    inst_id = "inst_sit"
    season_id = "season_2026"

    with get_conn() as conn:
        conn.execute("INSERT INTO institutions (id, name) VALUES (?, ?)", (inst_id, "Sample Institute of Technology"))

        # ---- roster (upstream stub — represents Part 1) ----
        students = []
        for i in range(30):
            dept = DEPARTMENTS[i % 3]
            batch = "2026" if i % 4 != 0 else "2027"
            reg_no = f"{batch[2:]}{dept[:2].upper()}{i+1:03d}"
            sid = f"stu_{i+1:03d}"
            name = f"{FIRST_NAMES[i]} {LAST_NAMES[i % len(LAST_NAMES)]}"
            conn.execute("INSERT INTO students (id, institution_id, register_no, name, department, batch) VALUES (?,?,?,?,?,?)",
                         (sid, inst_id, reg_no, name, dept, batch))
            readiness = round(random.uniform(45, 95), 1)
            conn.execute("INSERT INTO readiness_scores_stub (student_id, readiness_score, mock_interview_score) VALUES (?,?,?)",
                         (sid, readiness, round(readiness + random.uniform(-8, 8), 1)))
            students.append({"id": sid, "reg_no": reg_no, "name": name, "dept": dept})

        # ---- drive + rounds (upstream stub — represents Parts 2/3) ----
        drive_id = "drive_solstice"
        conn.execute("INSERT INTO drives (id, institution_id, season_id, company_name, role_title) VALUES (?,?,?,?,?)",
                     (drive_id, inst_id, season_id, "Solstice Robotics", "Graduate Software Engineer"))
        source_rounds = [("sr_apt", 1, "Aptitude"), ("sr_tech", 2, "Technical"), ("sr_hr", 3, "HR")]
        for rid, seq, name in source_rounds:
            conn.execute("INSERT INTO source_rounds (id, drive_id, sequence, name) VALUES (?,?,?,?)", (rid, drive_id, seq, name))

        # applications (upstream stub — represents Part 4): all 30 shortlisted for Technical
        for s in students:
            conn.execute("INSERT INTO applications (id, drive_id, student_id, status) VALUES (?,?,?,?)",
                         (f"app_{s['id']}", drive_id, s["id"], "SHORTLISTED"))

        # round_executions (Part-5-owned; section 17)
        now = _now()
        round_execs = {}
        for rid, seq, name, status, planned in [
            ("re_apt", 1, "Aptitude", RoundExecutionStatus.COMPLETED.value, (now - timedelta(days=5)).isoformat()),
            ("re_tech", 2, "Technical", RoundExecutionStatus.IN_PROGRESS.value, now.isoformat()),
            ("re_hr", 3, "HR", RoundExecutionStatus.PLANNED.value, None),
        ]:
            conn.execute(
                "INSERT INTO round_executions (id, drive_id, source_round_id, sequence, status, planned_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (rid, drive_id, f"sr_{'apt' if seq==1 else 'tech' if seq==2 else 'hr'}", seq, status, planned, _iso(now), _iso(now)))
            round_execs[name] = rid

    tech_round = round_execs["Technical"]

    # ---- interviews for the Technical round ----
    offsets_past = [-6.0, -5.5, -5.0, -4.5, -4.0, -3.5, -3.0, -2.75, -2.5, -2.25, -2.0, -1.75,
                     -1.5, -1.25, -1.0, -0.9, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3]  # 22 already occurred
    offsets_later_today = [2.0, 4.0, 6.0]     # 3 upcoming later today
    offsets_tomorrow = [26.0, 28.0, 30.0]     # 3 tomorrow
    offsets_cancelled = [-1.1, 8.0]           # 2 cancelled (one past, one future)

    all_offsets = offsets_past + offsets_later_today + offsets_tomorrow + offsets_cancelled
    assert len(all_offsets) == 30

    interview_ids = []
    for s, offset in zip(students, all_offsets):
        sched = _now() + timedelta(hours=offset)
        iid = scheduling.create_interview(
            institution_id=inst_id, season_id=season_id, drive_id=drive_id,
            application_id=f"app_{s['id']}", student_id=s["id"], round_execution_id=tech_round,
            scheduled_at_iso=_iso(sched), timezone_name="Asia/Kolkata", duration_minutes=45,
            mode="ONLINE", location=None,
            meeting_reference=f"https://meet.example.edu/interview/{s['id']}",
            instructions="Join 10 minutes early with your ID card visible.",
            actor="seed_script",
        )
        interview_ids.append((iid, s, offset))

    # cancel the two cancellation-slot interviews
    cancelled_ids = [iid for iid, s, off in interview_ids if off in offsets_cancelled]
    for iid in cancelled_ids:
        scheduling.cancel_interview(iid, actor="tpo_admin_1", reason="Recruiter rescheduled the drive.")

    # Re-apply real attendance distribution to the 22 past (non-cancelled) interviews.
    past_ids = [iid for iid, s, off in interview_ids if off in offsets_past]
    attendance_plan = (["PRESENT"] * 19) + (["LATE"] * 1) + (["ABSENT"] * 1) + (["EXCUSED"] * 1)
    random.shuffle(attendance_plan)
    for iid, att in zip(past_ids, attendance_plan):
        scheduling.record_attendance(iid, AttendanceStatus(att), actor="tpo_admin_1")

    completed_ids = [iid for iid, att in zip(past_ids, attendance_plan) if att in ("PRESENT", "LATE")]  # 20 of them

    # ---- direct TPO result entry for 8 of the 20 completed ----
    direct_plan = (["PASS"] * 4) + (["FAIL"] * 3) + (["HOLD"] * 1)
    direct_ids = completed_ids[:8]
    for iid, res in zip(direct_ids, direct_plan):
        results_module.enter_result(iid, ResultValue(res), remarks="Entered from panel scoresheet.", actor="tpo_admin_1")

    # publish 2 of the direct entries now (1 PASS, 1 FAIL) so the import step below can hit a genuine conflict
    review = results_module.review_batch(drive_id, tech_round, actor="tpo_admin_1")
    early_publish_ids = [direct_ids[0], direct_ids[4]]  # first PASS, first FAIL
    results_module.publish(early_publish_ids, actor="tpo_admin_1")

    # ---- CSV import for the remaining 12 completed-without-result ----
    remaining_ids = completed_ids[8:]  # 12 ids
    assert len(remaining_ids) == 12
    reg_lookup = {s["id"]: s["reg_no"] for s in students}
    # map interview_id -> student register_no
    with get_conn() as conn:
        interview_to_regno = {}
        for iid in remaining_ids:
            row = conn.execute("SELECT student_id FROM interviews WHERE id = ?", (iid,)).fetchone()
            interview_to_regno[iid] = reg_lookup[row["student_id"]]

    import_results_plan = (["PASS"] * 5) + (["FAIL"] * 5) + (["HOLD"] * 2)
    csv_lines = ["Register Number,Name,Company,Role,Round,Result,Remarks"]
    for iid, res in zip(remaining_ids, import_results_plan):
        reg = interview_to_regno[iid]
        csv_lines.append(f"{reg},,Solstice Robotics,Graduate Software Engineer,Technical,{res},Recruiter panel feedback")

    # duplicate row
    dup_reg = interview_to_regno[remaining_ids[0]]
    csv_lines.append(f"{dup_reg},,Solstice Robotics,Graduate Software Engineer,Technical,{import_results_plan[0]},duplicate row")

    # unknown student row
    csv_lines.append("99XX999,,Solstice Robotics,Graduate Software Engineer,Technical,PASS,unrecognized register number")

    # genuine conflict row: the already-published FAIL student, but the file says PASS
    with get_conn() as conn:
        pub_fail_student = conn.execute("SELECT student_id FROM interviews WHERE id = ?", (early_publish_ids[1],)).fetchone()["student_id"]
    conflict_reg = reg_lookup[pub_fail_student]
    csv_lines.append(f"{conflict_reg},,Solstice Robotics,Graduate Software Engineer,Technical,PASS,late correction from recruiter")

    csv_text = "\n".join(csv_lines)

    rows = import_pipeline.parse_csv(csv_text)
    preview = import_pipeline.validate_import(rows, inst_id, drive_id, tech_round)
    commit = import_pipeline.commit_import(preview, actor="tpo_admin_2")

    # ---- one interview issue + one reschedule request on an upcoming interview ----
    upcoming_ids = [iid for iid, s, off in interview_ids if off in offsets_later_today]
    upcoming_student_ids = []
    with get_conn() as conn:
        for iid in upcoming_ids:
            upcoming_student_ids.append(conn.execute("SELECT student_id FROM interviews WHERE id = ?", (iid,)).fetchone()["student_id"])

    issue_id_1 = scheduling.report_issue(upcoming_ids[0], upcoming_student_ids[0], IssueType.CANNOT_ACCESS_LINK,
                                          "Meeting link returns a 404.", actor=upcoming_student_ids[0])
    issue_id_2 = scheduling.report_issue(upcoming_ids[1], upcoming_student_ids[1], IssueType.SCHEDULING_CONFLICT,
                                          "Clashes with another company's interview.", actor=upcoming_student_ids[1])
    scheduling.resolve_issue(issue_id_1, actor="tpo_admin_1", resolution_notes="Sent corrected link by email.")
    scheduling.request_reschedule(upcoming_ids[2], upcoming_student_ids[2], "Family emergency.", actor=upcoming_student_ids[2])

    # a couple of students confirm attendance for their upcoming interview
    scheduling.student_confirm(upcoming_ids[0], upcoming_student_ids[0], actor=upcoming_student_ids[0])

    # ---- second small drive purely to demonstrate repeated_non_advancement (section 48) ----
    # Picks a student whose Technical-round result is FAIL (direct_ids[6] is fixed-FAIL by
    # construction and is NOT the interview used in the conflict-correction demo above), and
    # gives them a prior, unrelated drive with 2 more published, non-passing outcomes.
    with get_conn() as conn:
        repeat_student_id = conn.execute(
            "SELECT student_id FROM interviews WHERE id = ?", (direct_ids[6],)
        ).fetchone()["student_id"]
        repeat_student = next(s for s in students if s["id"] == repeat_student_id)
    drive2_id = "drive_brightpath"
    with get_conn() as conn:
        conn.execute("INSERT INTO drives (id, institution_id, season_id, company_name, role_title) VALUES (?,?,?,?,?)",
                     (drive2_id, inst_id, season_id, "BrightPath Analytics", "Associate Analyst"))
        conn.execute("INSERT INTO source_rounds (id, drive_id, sequence, name) VALUES (?,?,?,?)", ("sr_bp1", drive2_id, 1, "Technical"))
        conn.execute("INSERT INTO source_rounds (id, drive_id, sequence, name) VALUES (?,?,?,?)", ("sr_bp2", drive2_id, 2, "HR"))
        conn.execute("INSERT INTO round_executions (id, drive_id, source_round_id, sequence, status, planned_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                     ("re_bp1", drive2_id, "sr_bp1", 1, "COMPLETED", None, _iso(_now()), _iso(_now())))
        conn.execute("INSERT INTO round_executions (id, drive_id, source_round_id, sequence, status, planned_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                     ("re_bp2", drive2_id, "sr_bp2", 2, "COMPLETED", None, _iso(_now()), _iso(_now())))
        conn.execute("INSERT INTO applications (id, drive_id, student_id, status) VALUES (?,?,?,?)",
                     (f"app_bp_{repeat_student['id']}", drive2_id, repeat_student["id"], "SHORTLISTED"))
    old_iid = scheduling.create_interview(
        institution_id=inst_id, season_id=season_id, drive_id=drive2_id, application_id=f"app_bp_{repeat_student['id']}",
        student_id=repeat_student["id"], round_execution_id="re_bp1",
        scheduled_at_iso=_iso(_now() - timedelta(days=20)), timezone_name="Asia/Kolkata", duration_minutes=30,
        mode="ON_CAMPUS", location="Placement Cell, Room 2", actor="seed_script",
    )
    scheduling.record_attendance(old_iid, AttendanceStatus.PRESENT, actor="tpo_admin_1")
    results_module.enter_result(old_iid, ResultValue.FAIL, remarks="Prior drive, did not advance.", actor="tpo_admin_1")
    results_module.review_batch(drive2_id, "re_bp1", actor="tpo_admin_1")
    results_module.publish([old_iid], actor="tpo_admin_1")

    old_iid_2 = scheduling.create_interview(
        institution_id=inst_id, season_id=season_id, drive_id=drive2_id, application_id=f"app_bp_{repeat_student['id']}",
        student_id=repeat_student["id"], round_execution_id="re_bp2",
        scheduled_at_iso=_iso(_now() - timedelta(days=12)), timezone_name="Asia/Kolkata", duration_minutes=30,
        mode="ON_CAMPUS", location="Placement Cell, Room 2", actor="seed_script",
    )
    scheduling.record_attendance(old_iid_2, AttendanceStatus.PRESENT, actor="tpo_admin_1")
    results_module.enter_result(old_iid_2, ResultValue.HOLD, remarks="Prior drive, second round, not advanced further.", actor="tpo_admin_1")
    results_module.review_batch(drive2_id, "re_bp2", actor="tpo_admin_1")
    results_module.publish([old_iid_2], actor="tpo_admin_1")
    return {
        "institution_id": inst_id, "drive_id": drive_id, "round_execution_id": tech_round,
        "students": students, "interview_ids": [iid for iid, s, off in interview_ids],
        "direct_entry_ids": direct_ids, "early_published_ids": early_publish_ids,
        "import_preview_summary": preview["summary"], "import_commit": commit,
        "review_summary": review, "remaining_ids": remaining_ids,
        "repeat_student": repeat_student, "csv_text": csv_text,
        "upcoming_ids": upcoming_ids, "cancelled_ids": cancelled_ids,
    }


if __name__ == "__main__":
    ctx = run()
    print("Seed complete.")
    print("institution_id:", ctx["institution_id"])
    print("drive_id:", ctx["drive_id"])
    print("import summary:", ctx["import_preview_summary"])

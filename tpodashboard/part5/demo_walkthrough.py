"""
End-to-end narrated walkthrough — this is the "section 77 final
regression" run. Every number printed below comes from a real query
against the seeded SQLite database via the actual service/analytics/
results layer; nothing here is hand-typed output.
"""
import json

import seed_demo
from interviews import services, results as results_module, analytics, ai_contract, events, audit, import_pipeline
from interviews.enums import Role, ResultValue
from interviews.security import AccessDeniedError


def line(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


ctx = seed_demo.run(fresh=True)
inst = ctx["institution_id"]
drive = ctx["drive_id"]
rnd = ctx["round_execution_id"]

line("1. TPO OVERVIEW (section 23) — right after seeding")
print(json.dumps(services.get_tpo_overview(inst), indent=2))

line("2. RESULTS PENDING WORKBENCH (section 42) — sample of 3")
pending = services.get_pending_results(inst)
print(f"{len(pending)} interviews with no published result yet.")
for p in pending[:3]:
    print(f"  - {p['student_name']} ({p['register_no']}) — {p['company_name']} {p['round_name']}, "
          f"waiting {p['days_waiting']}d, interview_status={p['interview_status']}")

line("3. REVIEWING the remaining internal results (section 33)")
review = results_module.review_batch(drive, rnd, actor="tpo_admin_1")
print(json.dumps(review, indent=2))

line("4. PUBLISH PREVIEW then PUBLISH (sections 34-35, 69)")
all_technical_ids = [iv["id"] for iv in services.get_tpo_interview_list(inst, round_execution_id=rnd, limit=100)]
preview = results_module.publish_preview(all_technical_ids)
print("Preview:", {k: v for k, v in preview.items() if not k.endswith("_ids")})
publish_result = results_module.publish(preview["ready_ids"], actor="tpo_admin_1")
print(f"Published {len(publish_result['published'])} results just now "
      f"(plus 2 published earlier during seeding) — {len(publish_result['skipped_not_reviewed'])} skipped (not reviewed).")

line("5. ROUND PROGRESSION (sections 37-38)")
progression = results_module.round_progression(drive, rnd)
print(f"{progression['eligible_count']} students now eligible for the HR round.")
print("First 5:", [s["name"] for s in progression["students"][:5]])

line("6. THE CONFLICT ROW FROM THE IMPORT — TPO resolves it (sections 32, 40)")
# Re-run validation on the same CSV just to show the conflict record clearly.
rows = import_pipeline.parse_csv(ctx["csv_text"])
preview2 = import_pipeline.validate_import(rows, inst, drive, rnd)
conflict = preview2["conflict"][0]
print("Conflict detected:", json.dumps(conflict, indent=2))
conflicted_interview_id = [iv["id"] for iv in services.get_tpo_interview_list(inst, round_execution_id=rnd, limit=100)
                            if iv["register_no"] == conflict["register_no"]][0]
print("Existing published result:", results_module.get_current_result(conflicted_interview_id)["result"])
correction_id = results_module.correct_result(
    conflicted_interview_id, ResultValue.PASS_,
    reason="Recruiter sent a corrected result file after the panel re-scored the candidate.",
    actor="tpo_admin_1",
)
print("Corrected + auto-republished. New current result:",
      results_module.get_current_result(conflicted_interview_id)["result"])
print("Full version history for this interview:")
for v in results_module.result_history(conflicted_interview_id):
    print(f"  v{v['version']}: {v['result']} (source={v['result_source']}, state={v['publication_state']}, "
          f"reason={v.get('correction_reason')})")

line("7. STUDENT VIEW — three different outcomes (section 36)")
sample = services.get_tpo_interview_list(inst, round_execution_id=rnd, limit=100)
by_result = {}
for iv in sample:
    r = results_module.get_current_result(iv["id"])
    if r and r["publication_state"] == "PUBLISHED_TO_STUDENT":
        by_result.setdefault(r["result"], []).append(iv)

for outcome in ("PASS", "FAIL", "HOLD"):
    if by_result.get(outcome):
        iv = by_result[outcome][0]
        student_view = services.get_result(iv["id"], Role.STUDENT, iv["student_id"], inst)
        print(f"\n  {iv['student_name']} ({iv['register_no']}) opens PrepVista:")
        print(f"    {iv['company_name']} — {iv['round_name']} Interview")
        print(f"    Status: {student_view['interview_status']}")
        print(f"    Result shown to student: {student_view['result']}")

line("8. SECURITY — the 'change the ID in the URL' attack (section 60)")
victim_iv = sample[0]
attacker_student_id = sample[1]["student_id"]
try:
    services.get_result(victim_iv["id"], Role.STUDENT, attacker_student_id, inst)
    print("  !! FAILED TO BLOCK — this would be a critical bug.")
except AccessDeniedError as e:
    print(f"  Blocked as expected: {e}")

line("9. ANALYTICS (sections 44-48) — all real, computed from the seeded data")
print("Attendance:", json.dumps(analytics.attendance_summary(inst, drive), indent=2))
print("\nResult rates (published only):", json.dumps(analytics.result_rates(drive, rnd, published_only=True), indent=2))
print("\nRound conversion:", json.dumps(analytics.round_conversion(drive), indent=2))
print("\nTurnaround:", json.dumps(analytics.result_turnaround(drive), indent=2))
print("\nBy department:", json.dumps(analytics.department_breakdown(drive), indent=2))
print("\nBy batch:", json.dumps(analytics.batch_breakdown(drive), indent=2))
print("\nReadiness vs outcome (section 45 — note the gating):")
print(json.dumps(analytics.readiness_vs_outcome(inst), indent=2))
print("\nRepeated non-advancement pattern (section 48):")
repeated = analytics.repeated_non_advancement(inst)
print(json.dumps(repeated, indent=2))

line("10. AI INSIGHT CONTRACT (sections 51-53) — never a decision, always a nudge")
if pending:
    print(json.dumps(ai_contract.build_result_pending_insight(pending[0], pending[0]["days_waiting"]), indent=2))
issues = services.get_interview_issues(inst, open_only=True)
if issues:
    print(json.dumps(ai_contract.build_issue_insight(issues[0]), indent=2))
if repeated:
    print(json.dumps(ai_contract.build_pattern_insight(repeated), indent=2))

line("11. AUDIT TRAIL for the corrected interview (section 55)")
for entry in audit.trail_for("interview_result", correction_id):
    print(f"  {entry['at']}  {entry['actor']:<14} {entry['action']:<20} reason={entry.get('reason')}")

line("12. RECENT EVENTS (section 54) — last 8")
for e in events.recent(8):
    print(f"  {e['at']}  {e['event_type']}")

line("DONE — no exceptions. This is the full section-77 regression path end to end.")

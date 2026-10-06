import sys

with open("app/main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if "from app.services.report_schedules import run_report_schedule_loop" in line:
        new_lines.append("from app.services.deletion_worker import run_deletion_worker_loop\n")
    if "app.state.report_schedule_task = asyncio.create_task(run_report_schedule_loop())" in line:
        new_lines.append("        app.state.deletion_worker_task = asyncio.create_task(run_deletion_worker_loop())\n")

with open("app/main.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

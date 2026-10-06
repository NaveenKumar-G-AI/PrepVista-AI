import sys

with open("app/main.py", "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line == "from app.services.deletion_worker import run_deletion_worker_loop\n":
        new_lines.append("            from app.services.deletion_worker import run_deletion_worker_loop\n")
    elif line == "        app.state.deletion_worker_task = asyncio.create_task(run_deletion_worker_loop())\n":
        new_lines.append("            app.state.deletion_worker_task = asyncio.create_task(run_deletion_worker_loop())\n")
    else:
        new_lines.append(line)

with open("app/main.py", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

import sys

with open("PREPVISTA_OLD_PUSH_DEPLOYMENT_PRECHECK.md", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "- [ ] Verify PostgreSQL PITR (Point-In-Time Recovery) is enabled and active in the Supabase/Database Dashboard.",
    "- [ ] MANDATORY: Verify PostgreSQL automated backups are enabled and PITR (Point-In-Time Recovery) is active in the provider dashboard. Deployment is BLOCKED until backup frequency and retention are verified."
)

if "Cron Health Verification" not in content:
    content += "\n### 10. Cron Monitoring\n- [ ] Run `python check_cron.py` to verify pg_cron jobs are active and check run history for failures.\n"

with open("PREPVISTA_OLD_PUSH_DEPLOYMENT_PRECHECK.md", "w", encoding="utf-8") as f:
    f.write(content)

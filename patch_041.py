import sys

with open("app/database/migrations/041_cron_role_hardening.sql", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "-- 2. Grant necessary privileges to prepvista_worker",
    "-- 2. Grant necessary privileges to prepvista_worker\nGRANT USAGE ON SCHEMA public TO prepvista_worker;"
)

with open("app/database/migrations/041_cron_role_hardening.sql", "w", encoding="utf-8") as f:
    f.write(content)

import sys

with open("app/database/connection.py", "r", encoding="utf-8") as f:
    content = f.read()

old_warning = 'logger.warning(\n                    "migration_content_changed_since_apply"'

if old_warning in content:
    content = content.replace(
        'logger.warning(\n                    "migration_content_changed_since_apply"',
        'logger.error(\n                    "MIGRATION_LEDGER_INCOMPATIBLE"\n                )\n                raise Exception("MIGRATION_LEDGER_INCOMPATIBLE")\n                logger.warning(\n                    "migration_content_changed_since_apply"'
    )
    with open("app/database/connection.py", "w", encoding="utf-8") as f:
        f.write(content)

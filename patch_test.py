import sys
import re

with open("tests/test_production_contract.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    '"DATABASE_URL": "postgresql://user:password@example.invalid:5432/db",',
    '"DATABASE_URL": "postgresql://user:password@example.invalid:5432/db?sslmode=require",'
)

with open("tests/test_production_contract.py", "w", encoding="utf-8") as f:
    f.write(content)

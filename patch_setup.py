import sys

with open("setup_runtime_role.py", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace(
    "await conn.execute(\"CREATE ROLE prepvista_runtime WITH LOGIN PASSWORD 'runtime_pass';\")",
    "await conn.execute(\"CREATE ROLE prepvista_runtime WITH LOGIN PASSWORD 'runtime_pass';\")\n    await conn.execute(\"DROP ROLE IF EXISTS prepvista_worker;\")\n    await conn.execute(\"CREATE ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;\")"
)

with open("setup_runtime_role.py", "w", encoding="utf-8") as f:
    f.write(content)

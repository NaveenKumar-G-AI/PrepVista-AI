"""LOCAL DEVELOPMENT ONLY. 
For production deployment, the backend uses `python -m app.deployment.start` 
which automatically handles roles and migrations safely.
"""

import asyncio
import asyncpg
import os

async def main():
    migration_url = os.environ.get("MIGRATION_DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    conn = await asyncpg.connect(migration_url)
    
    # Create role
    await conn.execute("DROP ROLE IF EXISTS prepvista_runtime;")
    await conn.execute("CREATE ROLE prepvista_runtime WITH LOGIN PASSWORD 'runtime_pass';")
    await conn.execute("DROP ROLE IF EXISTS prepvista_worker;")
    await conn.execute("CREATE ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
    await conn.execute("GRANT CONNECT ON DATABASE postgres TO prepvista_runtime;")
    await conn.execute("GRANT USAGE ON SCHEMA public TO prepvista_runtime;")
    await conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prepvista_runtime;")
    await conn.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prepvista_runtime;")
    
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

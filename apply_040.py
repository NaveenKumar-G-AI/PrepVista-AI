import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    with open('app/database/migrations/040_runtime_role_rls_hardening.sql') as f:
        sql = f.read()
    await c.execute(sql)
    
    # ensure it's recorded
    await c.execute("INSERT INTO schema_migrations (version) VALUES ('040') ON CONFLICT DO NOTHING")
    await c.close()
    print("Applied 040")

asyncio.run(r())

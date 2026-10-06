import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    tables = await c.fetch("SELECT relname FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace")
    print("ALL TABLES:", [t['relname'] for t in tables])
    await c.close()

asyncio.run(r())

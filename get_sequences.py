import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    seqs = await c.fetch("SELECT relname FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace")
    print("SEQUENCES:", [s['relname'] for s in seqs])
    await c.close()

asyncio.run(r())

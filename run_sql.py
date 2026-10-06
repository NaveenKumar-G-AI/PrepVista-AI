import asyncio
from asyncpg import connect
import sys

async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    for q in sys.argv[1:]:
        print(f"Executing: {q}")
        await c.execute(q)
    await c.close()
asyncio.run(r())

import asyncio
from asyncpg import connect
async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    await c.execute('ALTER ROLE prepvista_runtime BYPASSRLS')
    await c.close()
asyncio.run(r())

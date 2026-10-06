import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres')
    try:
        await c.execute('SELECT * FROM secret_future_table')
        print("FAIL: able to read future table")
    except Exception as e:
        print("PASS: blocked from future table -", type(e).__name__)
    await c.close()

asyncio.run(r())

import asyncio
from asyncpg import connect
async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    await c.execute("INSERT INTO profiles (id, full_name, email) VALUES ('11111111-1111-1111-1111-111111111111', 'Test', 'test@example.com') ON CONFLICT DO NOTHING")
    await c.close()
asyncio.run(r())

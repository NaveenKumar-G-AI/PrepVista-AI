import asyncio
from app.config import get_settings
from asyncpg import connect

async def run():
    settings = get_settings()
    print("Connecting to:", settings.DATABASE_URL)
    conn = await connect(settings.DATABASE_URL)
    user = await conn.fetchval("SELECT current_user")
    print("Connected as:", user)
    await conn.close()

asyncio.run(run())

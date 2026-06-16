import asyncio
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import DatabaseConnection

async def test():
    async with DatabaseConnection() as conn:
        print("--- GRANTS ---")
        grants = await conn.fetch("SELECT id, email, status FROM launch_offer_grants")
        for g in grants:
            print(dict(g))
            
        print("--- SETTINGS ---")
        settings = await conn.fetch("SELECT * FROM launch_offer_settings")
        for s in settings:
            print(dict(s))
            
        print("--- PROFILES COUNT ---")
        print(await conn.fetchval("SELECT COUNT(*) FROM profiles"))

if __name__ == "__main__":
    asyncio.run(test())

import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    objects = await c.fetch("""
        SELECT c.relname, c.relkind 
        FROM pg_class c JOIN pg_roles r ON c.relowner = r.oid 
        WHERE r.rolname = 'prepvista_runtime'
    """)
    print("OWNED OBJECTS:", [o['relname'] for o in objects])
    await c.close()

asyncio.run(r())

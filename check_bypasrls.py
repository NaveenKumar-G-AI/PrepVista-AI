import asyncio
from asyncpg import connect

async def run():
    conn = await connect('postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres')
    
    count = await conn.fetchval("SELECT count(*) FROM profiles")
    print(f"Profiles count with BYPASSRLS: {count}")
    
    su_conn = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    await su_conn.execute("ALTER ROLE prepvista_runtime NOBYPASSRLS")
    print("Disabled BYPASSRLS")
    
    conn2 = await connect('postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres')
    count_no_rls = await conn2.fetchval("SELECT count(*) FROM profiles")
    print(f"Profiles count WITHOUT BYPASSRLS: {count_no_rls}")
    
    await su_conn.execute("ALTER ROLE prepvista_runtime BYPASSRLS")
    print("Restored BYPASSRLS")
    
    await su_conn.close()
    await conn.close()
    await conn2.close()

asyncio.run(run())

import asyncio
from asyncpg import connect

async def run():
    # 1. Turn off BYPASSRLS globally
    su_conn = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    await su_conn.execute("ALTER ROLE prepvista_runtime NOBYPASSRLS")
    print("Disabled global BYPASSRLS")
    
    # 2. Add an explicit policy for prepvista_runtime
    await su_conn.execute("CREATE POLICY runtime_all ON profiles FOR ALL TO prepvista_runtime USING (true) WITH CHECK (true)")
    print("Added prepvista_runtime explicit policy on profiles")
    
    # 3. Test read
    conn = await connect('postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres')
    count = await conn.fetchval("SELECT count(*) FROM profiles")
    print(f"Profiles count WITHOUT BYPASSRLS but WITH EXPLICIT POLICY: {count}")
    
    # Cleanup
    await su_conn.execute("DROP POLICY runtime_all ON profiles")
    await su_conn.execute("ALTER ROLE prepvista_runtime BYPASSRLS")
    await su_conn.close()
    await conn.close()

asyncio.run(run())

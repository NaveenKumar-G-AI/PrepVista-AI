import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    
    # Create role
    await conn.execute("DROP ROLE IF EXISTS prepvista_runtime;")
    await conn.execute("CREATE ROLE prepvista_runtime WITH LOGIN PASSWORD 'runtime_pass';")
    await conn.execute("DROP ROLE IF EXISTS prepvista_worker;")
    await conn.execute("CREATE ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;")
    await conn.execute("GRANT CONNECT ON DATABASE postgres TO prepvista_runtime;")
    await conn.execute("GRANT USAGE ON SCHEMA public TO prepvista_runtime;")
    await conn.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO prepvista_runtime;")
    await conn.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO prepvista_runtime;")
    
    await conn.close()
    
    # Test as runtime role
    runtime_conn = await asyncpg.connect("postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres")
    
    # Should work
    await runtime_conn.execute("SELECT 1;")
    print("SELECT 1 works.")
    
    # Should fail
    try:
        await runtime_conn.execute("CREATE TABLE this_should_fail (id INT);")
        print("ERROR: Was able to create table!")
    except Exception as e:
        print("DDL Blocked as expected:", type(e).__name__)
        
    await runtime_conn.close()

if __name__ == '__main__':
    asyncio.run(main())

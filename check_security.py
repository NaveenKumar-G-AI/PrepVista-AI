import asyncio
from asyncpg import connect

async def run():
    conn = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    
    print('--- ROLE INFO ---')
    role = await conn.fetchrow("SELECT rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'prepvista_runtime'")
    if role:
        print(dict(role))
    else:
        print("Role not found!")
    
    print('\n--- RLS TABLES ---')
    rls_tables = await conn.fetch("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relkind = 'r' AND relnamespace = 'public'::regnamespace AND relrowsecurity = true")
    for t in rls_tables:
        print(dict(t))
        
    print('\n--- POLICIES ---')
    policies = await conn.fetch("SELECT tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public'")
    for p in policies:
        print(dict(p))

asyncio.run(run())

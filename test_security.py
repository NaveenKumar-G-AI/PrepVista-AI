import asyncio
from asyncpg import connect

async def r():
    c = await connect('postgresql://prepvista_runtime:runtime_pass@127.0.0.1:55322/postgres')
    
    # 1. DDL
    try:
        await c.execute("CREATE TABLE ddl_test (id int);")
        print("FAIL: DDL allowed")
    except Exception as e:
        print("PASS: DDL blocked -", type(e).__name__)
        
    # 2. Schema migrations modification
    try:
        await c.execute("INSERT INTO schema_migrations (version) VALUES ('999')")
        print("FAIL: migrations insert allowed")
    except Exception as e:
        print("PASS: migrations insert blocked -", type(e).__name__)

    # 3. Privilege Escalation
    try:
        await c.execute("ALTER ROLE prepvista_runtime BYPASSRLS")
        print("FAIL: privilege escalation allowed")
    except Exception as e:
        print("PASS: privilege escalation blocked -", type(e).__name__)

    await c.close()

asyncio.run(r())

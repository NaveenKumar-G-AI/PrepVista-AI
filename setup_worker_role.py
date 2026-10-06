import asyncio
from asyncpg import connect

async def setup():
    c = await connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    try:
        await c.execute("CREATE ROLE prepvista_worker WITH NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS")
        print("Role prepvista_worker created successfully.")
    except Exception as e:
        print(f"Role creation failed (or exists): {e}")
    finally:
        await c.close()

if __name__ == "__main__":
    asyncio.run(setup())

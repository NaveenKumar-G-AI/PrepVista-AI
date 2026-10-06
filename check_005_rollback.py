import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    try:
        rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE tablename LIKE 'user_activity%'")
        print("user_activity tables:", [r['tablename'] for r in rows])
    except Exception as e:
        print(f"Error: {e}")
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

import asyncio
import asyncpg
import json

async def main():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    try:
        tables = await conn.fetch("""
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename IN (
                'profiles', 'interview_sessions', 'question_evaluations', 
                'organization_students', 'schema_migrations'
            )
        """)
        print(f"Found {len(tables)} application tables: {[t['tablename'] for t in tables]}")
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

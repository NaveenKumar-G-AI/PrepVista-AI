import asyncio
import asyncpg
import sys
import json
from app.services.rubric_contract import build_preflight_queries

async def main():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    try:
        # Pre-requisite: we need the tables to exist to run the queries, 
        # but the schema doesn't exist yet!
        # Ah, the instructions say "execute the same READ-ONLY preflight logic".
        # But if we try to run it on a fresh DB, it will fail because tables don't exist.
        # Let's check if the tables exist first.
        eval_q, skill_q = build_preflight_queries()
        
        tables = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
        tablenames = [t['tablename'] for t in tables]
        
        if 'question_evaluations' not in tablenames:
            print("Target fresh. Creating temporary tables to test preflight logic...")
            await conn.execute("CREATE TABLE question_evaluations (rubric_category TEXT)")
            await conn.execute("CREATE TABLE skill_scores (category TEXT)")
            await conn.execute("INSERT INTO question_evaluations (rubric_category) VALUES ('invalid_test_category')")
            
        print("Running preflight...")
        try:
            eval_rows = await conn.fetch(eval_q)
            skill_rows = await conn.fetch(skill_q)
            print("Preflight Evaluation query result:", [r['rubric_category'] for r in eval_rows])
            print("Preflight Skill query result:", [r['category'] for r in skill_rows])
        except Exception as e:
            print(f"Error executing preflight: {e}")
            
        if 'question_evaluations' not in tablenames:
            await conn.execute("DROP TABLE question_evaluations")
            await conn.execute("DROP TABLE skill_scores")

    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

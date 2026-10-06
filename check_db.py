import asyncio
from dotenv import load_dotenv
load_dotenv()

from app.database.connection import DatabaseConnection, init_db_pool
from app.config import get_settings

async def main():
    settings = get_settings()
    await init_db_pool(settings.DATABASE_URL)
    async with DatabaseConnection() as conn:
        # Get an active organization
        org = await conn.fetchrow("SELECT id FROM organizations LIMIT 1")
        if not org:
            print("No orgs found")
            return
        
        org_id = org["id"]
        print(f"Org ID: {org_id}")
        
        # Check students
        students = await conn.fetch("SELECT id, user_id FROM organization_students WHERE organization_id = $1 AND status = 'active'", org_id)
        print(f"Students count: {len(students)}")
        
        for s in students[:2]:
            user_id = s["user_id"]
            sessions = await conn.fetch("SELECT id, state, final_score, organization_id FROM interview_sessions WHERE user_id = $1", user_id)
            print(f"User {user_id}: {len(sessions)} sessions")
            for sess in sessions:
                print(f"  Session {sess['id']} | state={sess['state']} | final_score={sess['final_score']} | org_id={sess['organization_id']}")

if __name__ == "__main__":
    asyncio.run(main())

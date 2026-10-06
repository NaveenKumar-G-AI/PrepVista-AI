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
        student = await conn.fetchrow("SELECT id, user_id FROM organization_students WHERE organization_id = $1 AND status = 'active' LIMIT 1", org_id)
        if not student:
            print("No student found")
            return
            
        user_id = student["user_id"]
        print(f"User {user_id}")
        
        # Insert a dummy session
        new_session = await conn.fetchrow(
            """INSERT INTO interview_sessions
               (user_id, plan, difficulty_mode, resume_text, resume_summary, 
                question_plan, duration_planned_seconds, proctoring_mode, access_token)
               VALUES ($1, 'free', 'standard', '', '{}', '[]', 600, 'none', 'dummy_token')
               RETURNING id, organization_id, created_at""",
            user_id
        )
        print(f"Created session: {new_session['id']} | org_id: {new_session['organization_id']}")
        
        # Clean up
        await conn.execute("DELETE FROM interview_sessions WHERE id = $1", new_session['id'])

if __name__ == "__main__":
    asyncio.run(main())

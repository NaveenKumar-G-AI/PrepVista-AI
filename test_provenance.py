import asyncio
import uuid
import asyncpg
from datetime import datetime, timezone, timedelta

from app.services.assistance_evidence import resolve_provenance
# Connect to DB
async def test_provenance():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    
    # Create user
    user_id = str(uuid.uuid4())
    await conn.execute("INSERT INTO profiles (id, email, full_name, plan) VALUES ($1, $2, $3, 'free')", user_id, f"test_{user_id[:8]}@example.com", "Test User")
    
    # Create session
    session_id = str(uuid.uuid4())
    access_token = str(uuid.uuid4())
    await conn.execute("INSERT INTO interview_sessions (id, user_id, interview_type, plan, difficulty_mode, resume_text, access_token) VALUES ($1, $2, 'resume_based', 'free', 'auto', 'test resume', $3)", session_id, user_id, access_token)
    
    instance = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Function to insert assistance
    async def insert_assistance(atype, generated_at, viewed_at=None):
        ev_id = str(uuid.uuid4())
        req_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO interview_assistance_event 
            (id, session_id, user_id, turn_number, question_instance_id, assistance_type, assistance_level, generated_content, generated_at, viewed_at, request_id, question_text)
            VALUES ($1, $2, $3, 1, $4, $5, 1, '{"content": "hint"}', $6, $7, $8, 'Q?')
        """, ev_id, session_id, user_id, instance, atype, generated_at, viewed_at, req_id)
        return ev_id

    try:
        # A. viewed before answered_at -> HINT_ASSISTED
        await insert_assistance("hint", now - timedelta(minutes=5), now - timedelta(minutes=4))
        prov_A = await resolve_provenance(conn, session_id, instance, user_id, now)
        print("A. viewed before answered_at:", prov_A)
        
        # B. viewed after answered_at
        instance_B = str(uuid.uuid4())
        await insert_assistance("hint", now - timedelta(minutes=5), now + timedelta(minutes=1))
        prov_B = await resolve_provenance(conn, session_id, instance_B, user_id, now)
        print("B. viewed after answered_at:", prov_B)
        
        # C. generated but never viewed
        instance_C = str(uuid.uuid4())
        await insert_assistance("hint", now - timedelta(minutes=5), None)
        prov_C = await resolve_provenance(conn, session_id, instance_C, user_id, now)
        print("C. generated but never viewed:", prov_C)
        
        # D. hint + guidance viewed before answer
        instance_D = str(uuid.uuid4())
        await insert_assistance("hint", now - timedelta(minutes=5), now - timedelta(minutes=4))
        await insert_assistance("answer_guidance", now - timedelta(minutes=3), now - timedelta(minutes=2))
        prov_D = await resolve_provenance(conn, session_id, instance_D, user_id, now)
        print("D. hint + guidance viewed before answer:", prov_D)

    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(test_provenance())

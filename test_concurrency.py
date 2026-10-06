import asyncio
import uuid
import logging
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database.connection import pool_init, pool_close
import asyncpg
from datetime import datetime, timezone, timedelta

logging.basicConfig(level=logging.INFO)

async def test_concurrency():
    # Setup DB Pool
    await pool_init()
    
    # Create test data
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    user_id = str(uuid.uuid4())
    await conn.execute("INSERT INTO profiles (id, email, full_name, plan) VALUES ($1, $2, $3, 'free')", user_id, f"test_{user_id[:8]}@example.com", "Test User")
    
    session_id = str(uuid.uuid4())
    access_token = str(uuid.uuid4())
    await conn.execute("INSERT INTO interview_sessions (id, user_id, interview_type, plan, difficulty_mode, resume_text, access_token) VALUES ($1, $2, 'resume_based', 'free', 'auto', 'test resume', $3)", session_id, user_id, access_token)
    
    req_id_same = str(uuid.uuid4())
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Same-answer concurrency
        payload = {
            "text": "This is an answer",
            "durationSeconds": 15,
            "requestId": req_id_same,
            "endAfterAnswer": False
        }
        
        # Fire two concurrent
        res = await asyncio.gather(
            client.post(f"/interviews/{session_id}/answer", json=payload, headers={"Authorization": f"Bearer {access_token}"}),
            client.post(f"/interviews/{session_id}/answer", json=payload, headers={"Authorization": f"Bearer {access_token}"})
        )
        print("SAME-ANSWER CONCURRENCY RESPONSES:", [r.status_code for r in res])
        print("BODIES:", [r.json() for r in res])
        
    await conn.close()
    await pool_close()

if __name__ == "__main__":
    asyncio.run(test_concurrency())

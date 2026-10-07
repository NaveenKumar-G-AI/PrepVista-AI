import re

with open('app/routers/interviews_session.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Add get_session endpoint at the bottom
get_session_code = """

@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: UserProfile = Depends(get_current_user),
):
    _validate_session_id(session_id)
    async with DatabaseConnection() as conn:
        session = await conn.fetchrow(
            \"\"\"SELECT id as session_id, access_token, plan, difficulty_mode, 
                      total_turns as max_turns, duration_seconds, proctoring_mode, candidate_name,
                      state
               FROM interview_sessions WHERE id = $1 AND user_id = $2\"\"\",
            session_id, user.id
        )
        if not session:
            raise HTTPException(404, "Session not found")
            
        policy = await conn.fetchrow("SELECT enabled FROM interview_assistance_policy WHERE session_id = $1", session_id)
        
        return {
            **dict(session),
            "assistance_enabled": policy["enabled"] if policy else False
        }
"""

if "def get_session(" not in content:
    with open('app/routers/interviews_session.py', 'a', encoding='utf-8') as f:
        f.write(get_session_code)
        
print("Added get_session endpoint")

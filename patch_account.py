import re

with open('app/routers/account.py', 'r') as f:
    content = f.read()

# Add imports
imports = '''from fastapi import BackgroundTasks
import json
from app.services.storage_cleanup import parse_and_delete_storage_path

async def _run_deletion_saga(request_id: int, auth_user_ids: list[str], storage_paths: list[str]):
    import asyncio
    from app.database.connection import DatabaseConnection
    
    # Auth deletion
    results = await asyncio.gather(*[_safe_delete_auth_user(aid) for aid in auth_user_ids])
    failed_auth = [(aid, exc) for aid, exc in results if exc is not None]
    
    async with DatabaseConnection() as conn:
        if failed_auth:
            await conn.execute("UPDATE account_deletion_requests SET status = 'FAILED', last_error = \, updated_at = NOW() WHERE id = \", request_id, f"Auth fail: {failed_auth}")
            return
        await conn.execute("UPDATE account_deletion_requests SET status = 'AUTH_DELETED', updated_at = NOW() WHERE id = \", request_id)

    # Storage deletion
    storage_results = await asyncio.gather(*[parse_and_delete_storage_path(p) for p in storage_paths])
    failed_storage = [p for p, success in zip(storage_paths, storage_results) if not success]

    async with DatabaseConnection() as conn:
        if failed_storage:
            await conn.execute("UPDATE account_deletion_requests SET status = 'FAILED', last_error = \, updated_at = NOW() WHERE id = \", request_id, f"Storage fail: {failed_storage}")
            return
        await conn.execute("UPDATE account_deletion_requests SET status = 'COMPLETED', updated_at = NOW() WHERE id = \", request_id)
'''

content = content.replace('from fastapi import APIRouter, Depends, HTTPException', 'from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks')
content = content.replace('async def _safe_delete_auth_user', imports + '\nasync def _safe_delete_auth_user')

# Replace delete_account
new_delete = '''@router.delete("/me")
async def delete_account(background_tasks: BackgroundTasks, user: UserProfile = Depends(get_current_user)):
    """Delete the current user's live account data and archive minimal identity."""
    if user.premium_override:
        raise HTTPException(
            status_code=403,
            detail="Admin accounts cannot be deleted from the product UI.",
        )

    async with DatabaseConnection() as conn:
        profile = await conn.fetchrow(
            """SELECT full_name, email
               FROM profiles
               WHERE id = """,
            user.id,
        )
        linked_auth_user_ids = await list_auth_user_ids_for_profile(conn, user.id)

        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found.")

        auth_user_ids = linked_auth_user_ids or [user.id]

        logger.info(
            "account_delete_initiated",
            user_id=user.id,
            email=profile["email"],
            auth_user_count=len(auth_user_ids),
        )

        audio_paths_res = await conn.fetch(
            "SELECT interview_audio_turns.audio_object_path FROM interview_audio_turns JOIN interview_sessions ON interview_sessions.id = interview_audio_turns.session_id WHERE interview_sessions.user_id =  AND interview_audio_turns.audio_object_path IS NOT NULL", user.id
        )
        pdf_paths_res = await conn.fetch("SELECT pdf_file_path FROM reports WHERE user_id =  AND pdf_file_path IS NOT NULL", user.id)
        support_paths_res = await conn.fetch("SELECT attachment_url FROM support_messages WHERE user_id =  AND attachment_url IS NOT NULL", user.id)
        resume_paths_res = await conn.fetch("SELECT resume_file_path FROM interview_sessions WHERE user_id =  AND resume_file_path IS NOT NULL", user.id)
        
        paths = []
        paths.extend(r["audio_object_path"] for r in audio_paths_res)
        paths.extend(r["pdf_file_path"] for r in pdf_paths_res)
        paths.extend(r["attachment_url"] for r in support_paths_res)
        paths.extend(r["resume_file_path"] for r in resume_paths_res)

        async with conn.transaction():
            request_id = await conn.fetchval(
                "INSERT INTO account_deletion_requests (user_id, email, auth_user_ids, storage_paths, status) VALUES (, , , ::jsonb, 'REQUESTED') RETURNING id",
                user.id, profile["email"], auth_user_ids, json.dumps(paths)
            )

            await conn.execute(
                """DELETE FROM launch_offer_grants
                   WHERE user_id = 
                     AND status = ANY(::text[])""",
                user.id,
                ["pending", "rejected"],
            )
            await conn.execute(
                """INSERT INTO old_user (user_id, full_name, email)
                   VALUES (, , )
                   ON CONFLICT (email) DO NOTHING""",
                user.id,
                profile["full_name"],
                profile["email"],
            )
            await conn.execute(
                "DELETE FROM profiles WHERE id = ",
                user.id,
            )
            await conn.execute("UPDATE account_deletion_requests SET status = 'DB_DELETED' WHERE id = ", request_id)

    background_tasks.add_task(_run_deletion_saga, request_id, auth_user_ids, paths)

    try:
        async with DatabaseConnection() as conn:
            await refresh_public_growth_metrics(conn)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "account_delete_metrics_refresh_failed",
            user_id=user.id,
            error=str(exc),
        )

    logger.info("account_deleted", user_id=user.id, email=profile["email"])
    return {
        "status": "deleted",
        "message": "Your account and interview data were deleted successfully.",
    }
'''

content = re.sub(r'@router\.delete\("/me"\).*?return \{\n        "status": "deleted",\n        "message": "Your account and interview data were deleted successfully.",\n    }', new_delete, content, flags=re.DOTALL)

# Re-fix the $1, $2 issue
content = content.replace('\', '').replace('\', '')

with open('app/routers/account.py', 'w') as f:
    f.write(content)

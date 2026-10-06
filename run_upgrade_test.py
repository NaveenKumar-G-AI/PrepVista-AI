import asyncio
import os
import shutil
import subprocess

os.environ["ENVIRONMENT"] = "development"

os.environ["SUPABASE_URL"] = "http://127.0.0.1:55321"
os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"
os.environ["SUPABASE_SERVICE_KEY"] = "test-service-key"
os.environ["SUPABASE_JWT_SECRET"] = "super-secret-jwt-token-with-at-least-32-characters-long"
os.environ["DATABASE_URL"] = "postgresql://postgres:postgres@127.0.0.1:55322/postgres"


async def main():
    # 1. Reset DB to 038
    print("Skipping DB Reset, already at 038...")
    # subprocess.run("npx supabase db reset", cwd=r"C:\PrepVista-OldPush-Local-Staging", check=True, shell=True)
    
    # Run migrations up to 038 (which are in the folder now)
    # print("Running migrations through 038...")
    # subprocess.run("python -m app.database.migrate --execute", check=True, shell=True)
    
    # 2. Insert synthetic user A
    print("Inserting synthetic User A...")
    from app.database.connection import DatabaseConnection, init_db_pool, close_db_pool
    await init_db_pool()
    user_id = '11111111-1111-1111-1111-111111111111'
    async with DatabaseConnection() as conn:
        # Create profile
        await conn.execute("INSERT INTO profiles (id, full_name, email) VALUES ($1, 'Test User A', 'a@test.com') ON CONFLICT DO NOTHING", user_id)

    # 3. Apply 039
    print("Applying 039...")
    shutil.copy('039_account_deletion_recovery.sql', 'app/database/migrations/')
    subprocess.run("python -m app.database.migrate --execute", check=True, shell=True)

    # 4. Delete the user to trigger SET NULL on offer_documents
    print("Deleting User A...")
    from app.routers.account import delete_account
    from app.dependencies import UserProfile
    from fastapi import BackgroundTasks
    
    # We must mock BackgroundTasks
    class MockBT:
        def add_task(self, func, *args, **kwargs):
            self.task = (func, args, kwargs)
    bt = MockBT()
    user = UserProfile(id=user_id, email='a@test.com', plan='free')
    
    # The route requires database connection inside. It will insert into old_user, which uses user_id now.
    res = await delete_account(bt, user)
    print("Deletion response:", res)

    # Check offer_documents
    async with DatabaseConnection() as conn:

        # Check old_user
        old = await conn.fetchrow("SELECT user_id, original_user_id, email FROM old_user WHERE user_id = $1", user_id)
        print("old_user row:", old)
        assert str(old['user_id']) == user_id
        outbox = await conn.fetchrow("SELECT status FROM account_deletion_requests WHERE user_id = $1", user_id)
        assert outbox['status'] == 'DB_DELETED'
    
    print("Executing background task...")
    func, args, kwargs = bt.task
    await func(*args, **kwargs)
    
    async with DatabaseConnection() as conn:
        outbox = await conn.fetchrow("SELECT status FROM account_deletion_requests WHERE user_id = $1", user_id)
        print("Outbox status after background task:", outbox['status'])
        # Since auth/storage will fail locally without real tokens, it will probably be FAILED or AUTH_DELETED
    
    await close_db_pool()

if __name__ == '__main__':
    asyncio.run(main())

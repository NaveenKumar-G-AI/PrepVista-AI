import asyncio
import asyncpg

async def main():
    conn = await asyncpg.connect('postgresql://postgres:postgres@127.0.0.1:55322/postgres')
    
    user_id = await conn.fetchval("INSERT INTO profiles (id, full_name, email) VALUES (gen_random_uuid(), 'Test User', 'test@example.com') RETURNING id")
    print('Profile created:', user_id)
    
    await conn.execute("INSERT INTO old_user (user_id, full_name, email) VALUES (, 'Test User', 'test@example.com')", user_id)
    print('Old user inserted with user_id:', user_id)
    
    await conn.execute("DELETE FROM profiles WHERE id = ", user_id)
    print('Profile deleted')
    
    row = await conn.fetchrow("SELECT full_name, email, email_hash FROM old_user WHERE user_id = ", user_id)
    print('Old user row after delete:', dict(row) if row else None)
    
    await conn.execute("DELETE FROM old_user WHERE user_id = ", user_id)

asyncio.run(main())

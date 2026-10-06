import asyncio
import asyncpg
import sys
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str

async def main():
    try:
        conn = await asyncpg.connect(Settings().DATABASE_URL)
        
        # Check if last_seen_at exists on profiles
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                  AND table_name = 'profiles' 
                  AND column_name = 'last_seen_at'
            );
        """)
        
        if not exists:
            print("PREFLIGHT: ACTION REQUIRED - profiles.last_seen_at is missing. The 017b bootstrap will create it. (MISSING_REQUIRED_COLUMN)")
            return
            
        print("PREFLIGHT: OK - profiles.last_seen_at exists and is COMPATIBLE.")
            
    except Exception as e:
        print(f"PREFLIGHT ERROR: {e}")
        sys.exit(1)
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

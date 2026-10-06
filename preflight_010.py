import asyncio
import asyncpg
import sys
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    
async def main():
    try:
        conn = await asyncpg.connect(Settings().DATABASE_URL)
        
        # Check if function exists
        exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT 1 FROM pg_proc p
                JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = 'public' 
                  AND p.proname = 'fn_set_updated_at'
            );
        """)
        
        if not exists:
            print("PREFLIGHT: ACTION REQUIRED - fn_set_updated_at function is missing. The 009b bootstrap will create it. (MISSING_PREREQUISITE)")
            return
            
        # Check signature (returns TRIGGER)
        return_type = await conn.fetchval("""
            SELECT t.typname
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            JOIN pg_type t ON p.prorettype = t.oid
            WHERE n.nspname = 'public' 
              AND p.proname = 'fn_set_updated_at'
        """)
        
        if return_type != 'trigger':
            print(f"PREFLIGHT: FATAL - fn_set_updated_at exists but returns {return_type}, expected trigger. (INCOMPATIBLE_PREREQUISITE)")
            sys.exit(1)
            
        print("PREFLIGHT: OK - fn_set_updated_at exists and is COMPATIBLE.")
            
    except Exception as e:
        print(f"PREFLIGHT ERROR: {e}")
        sys.exit(1)
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import asyncpg
import sys
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    
async def main():
    try:
        conn = await asyncpg.connect(Settings().DATABASE_URL)
        
        # Check if table exists
        table_exists = await conn.fetchval("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'user_plan_entitlements'
            );
        """)
        
        if not table_exists:
            print("PREFLIGHT: OK - Table doesn't exist yet (fresh DB)")
            return
            
        # Check column
        col_type = await conn.fetchval("""
            SELECT data_type FROM information_schema.columns 
            WHERE table_name = 'user_plan_entitlements' AND column_name = 'plan_id'
        """)
        
        if col_type is None:
            print("PREFLIGHT: ACTION REQUIRED - plan_id column is missing. The 005b bootstrap will create it.")
        elif col_type == 'text':
            print("PREFLIGHT: OK - plan_id column exists and is TEXT (already compatible).")
        else:
            print(f"PREFLIGHT: FATAL - plan_id exists but is {col_type}, expected text. INCOMPATIBLE.")
            sys.exit(1)
            
    except Exception as e:
        print(f"PREFLIGHT ERROR: {e}")
        sys.exit(1)
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

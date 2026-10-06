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
                WHERE table_name = 'old_user'
            );
        """)
        
        if not table_exists:
            print("PREFLIGHT: ACTION REQUIRED - old_user table is missing. The 006b bootstrap will create it. (MISSING_PREREQUISITE)")
            return
            
        # Check columns
        columns = await conn.fetch("""
            SELECT column_name, data_type FROM information_schema.columns 
            WHERE table_name = 'old_user'
        """)
        
        col_dict = {r['column_name']: r['data_type'] for r in columns}
        
        expected_cols = {
            'id': 'integer',
            'original_user_id': 'uuid',
            'user_id': 'uuid',
            'full_name': 'text',
            'email': 'text',
            'email_hash': 'text',
            'deletion_reason': 'text',
            'archived_at': 'timestamp with time zone',
            'metadata': 'jsonb'
        }
        
        missing = []
        incompatible = []
        
        for col, expected_type in expected_cols.items():
            if col not in col_dict:
                missing.append(col)
            elif col_dict[col] != expected_type:
                incompatible.append(f"{col} (expected {expected_type}, got {col_dict[col]})")
                
        if missing or incompatible:
            if missing:
                print(f"PREFLIGHT: FATAL - old_user table exists but is missing columns: {missing}. (INCOMPATIBLE_PREREQUISITE)")
            if incompatible:
                print(f"PREFLIGHT: FATAL - old_user table exists but has incompatible column types: {incompatible}. (INCOMPATIBLE_PREREQUISITE)")
            sys.exit(1)
            
        print("PREFLIGHT: OK - old_user table exists and is COMPATIBLE.")
            
    except Exception as e:
        print(f"PREFLIGHT ERROR: {e}")
        sys.exit(1)
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())

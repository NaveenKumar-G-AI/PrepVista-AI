import asyncio
import os
from supabase import create_client, Client

os.environ["ENVIRONMENT"] = "development"
os.environ["SUPABASE_URL"] = "http://127.0.0.1:55321"
os.environ["SUPABASE_SERVICE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

async def test_auth():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    supabase: Client = create_client(url, key)
    
    # Create user
    try:
        res = supabase.auth.admin.create_user({
            "email": "test-synthetic@example.com",
            "password": "password123",
            "email_confirm": True
        })
        user_id = res.user.id
        print("Created Auth user:", user_id)
        
        # Verify it exists
        user_check = supabase.auth.admin.get_user_by_id(user_id)
        print("User exists:", user_check.user.email)
        
        # Delete user
        supabase.auth.admin.delete_user(user_id)
        print("Deleted Auth user:", user_id)
        
        # Verify it's gone
        try:
            supabase.auth.admin.get_user_by_id(user_id)
            print("ERROR: User still exists!")
        except Exception as e:
            print("User successfully gone:", e)
            
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    asyncio.run(test_auth())

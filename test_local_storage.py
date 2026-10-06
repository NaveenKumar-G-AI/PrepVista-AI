import asyncio
import os
from supabase import create_client, Client

os.environ["SUPABASE_URL"] = "http://127.0.0.1:55321"
os.environ["SUPABASE_SERVICE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

async def test_storage():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    supabase: Client = create_client(url, key)
    
    bucket_name = "test_bucket"
    
    try:
        supabase.storage.create_bucket(bucket_name)
    except Exception as e:
        pass
        
    try:
        res = supabase.storage.from_(bucket_name).upload("test_folder/test.txt", b"hello world")
        print("Uploaded:", res)
        
        # Verify it exists
        files = supabase.storage.from_(bucket_name).list("test_folder")
        print("Files:", files)
        
        # Delete
        supabase.storage.from_(bucket_name).remove(["test_folder/test.txt"])
        print("Deleted file")
        
        # Verify it's gone
        files = supabase.storage.from_(bucket_name).list("test_folder")
        print("Files after delete:", files)
            
    except Exception as e:
        print("Failed:", e)

if __name__ == "__main__":
    asyncio.run(test_storage())

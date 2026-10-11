import asyncio
import os
import sys

# Ensure this path matches the actual codebase imports if needed
from app.database.bootstrap import run_bootstrap

async def run_concurrent(count):
    tasks = [asyncio.create_task(run_bootstrap()) for _ in range(count)]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for i, res in enumerate(results):
        if isinstance(res, Exception):
            import traceback
            traceback.print_exception(type(res), res, res.__traceback__)
            sys.exit(1)

if __name__ == "__main__":
    os.environ["ENVIRONMENT"] = "development"
    os.environ["PREPVISTA_IGNORE_MISSING_CRON"] = "1"
    os.environ["SUPABASE_URL"] = "http://localhost:54321"
    os.environ["SUPABASE_ANON_KEY"] = "dummy"
    os.environ["SUPABASE_SERVICE_KEY"] = "dummy"
    os.environ["SUPABASE_JWT_SECRET"] = "dummy_secret_with_at_least_32_characters_!"
    os.environ["FRONTEND_URL"] = "http://localhost:3000"
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    asyncio.run(run_concurrent(count))

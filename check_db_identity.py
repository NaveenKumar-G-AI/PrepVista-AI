import asyncio
import asyncpg
import json
import socket

async def main():
    conn = await asyncpg.connect("postgresql://postgres:postgres@127.0.0.1:55322/postgres")
    try:
        identity = await conn.fetchrow("""
            SELECT 
                current_database() as db_name,
                current_user as c_user,
                session_user as s_user,
                version() as server_version,
                inet_server_addr() as server_addr,
                inet_server_port() as server_port,
                inet_client_addr() as client_addr,
                to_regprocedure('auth.uid()') as auth_uid_proc
        """)
        print(json.dumps(dict(identity), default=str, indent=2))
    finally:
        await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

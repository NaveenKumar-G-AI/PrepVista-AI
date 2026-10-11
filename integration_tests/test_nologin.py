import pytest
import asyncpg
import urllib.parse
try:
    from scripts.audit_049_fixture import h
except Exception:
    pytest.skip("Historical nologin audit fixture unavailable", allow_module_level=True)
    h = None

@pytest.mark.asyncio
async def test_direct_login_denied_for_runtime():
    # Attempt to connect directly as prepvista_runtime instead of postgres
    runtime_dsn = h.DSN.replace('postgres@', 'prepvista_runtime@')
    
    with pytest.raises(asyncpg.exceptions.InvalidAuthorizationSpecificationError):
        await asyncpg.connect(runtime_dsn)

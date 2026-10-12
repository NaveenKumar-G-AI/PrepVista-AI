"""
Shared pytest setup for the PrepVista test suite.

Several pure helpers we regression-test (resume validation, audit retention,
etc.) call ``get_settings()``, whose Settings model has a handful of required
fields (Supabase keys + DATABASE_URL). In CI we have no real secrets and want
the unit suite to run without a database or network, so we seed harmless dummy
values for exactly those required fields *before* the app is imported.

Tests deliberately replace ambient deployment values so a developer's
production configuration or machine-wide variables cannot make a unit test
contact a real service or fail nondeterministically.
"""

import os
import socket
import sys

import pytest

_REQUIRED_TEST_ENV = {
    # Not production: relaxes the config's HTTPS/CORS production guards so the
    # ambient .env's localhost URLs don't fail Settings validation under pytest.
    "ENVIRONMENT": "development",
    "PREPVISTA_DEBUG": "false",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_KEY": "test-service-key",
    "SUPABASE_JWT_SECRET": "test-jwt-secret-padded-to-thirty-two-plus-chars",
    "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
}

for _key, _value in _REQUIRED_TEST_ENV.items():
    # Unit tests must never inherit production credentials or machine-wide
    # values (Windows tooling may define DEBUG to a non-boolean like "release").
    os.environ[_key] = _value

for _key in ('MIGRATION_DATABASE_URL', 'PG_QUAL_DSN', 'PREPVISTA_IGNORE_MISSING_CRON'):
    os.environ.pop(_key, None)


@pytest.fixture(autouse=True)
def block_external_connections(monkeypatch):
    """Backend unit tests must never contact production or other live services."""
    def blocked(*args, **kwargs):
        raise AssertionError("Live network connections are disabled in backend unit tests.")

    original_connect = socket.socket.connect
    socketpair_code = getattr(socket.socketpair, "__code__", None)

    def guarded_connect(sock, address):
        # Windows implements asyncio's internal wake-up socketpair through a
        # loopback connect. Allow that exact stdlib caller, no DB/HTTP callers.
        if socketpair_code is not None and sys._getframe(1).f_code is socketpair_code:
            return original_connect(sock, address)
        return blocked()

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(socket, "getaddrinfo", blocked)

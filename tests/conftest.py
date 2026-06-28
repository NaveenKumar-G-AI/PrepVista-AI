"""
Shared pytest setup for the PrepVista test suite.

Several pure helpers we regression-test (resume validation, audit retention,
etc.) call ``get_settings()``, whose Settings model has a handful of required
fields (Supabase keys + DATABASE_URL). In CI we have no real secrets and want
the unit suite to run without a database or network, so we seed harmless dummy
values for exactly those required fields *before* the app is imported.

``setdefault`` means a real environment (a developer's .env, or CI secrets if
ever provided) always wins — we only fill the gaps so importing app.config
never fails during a pure unit run.
"""

import os

_REQUIRED_TEST_ENV = {
    # Not production: relaxes the config's HTTPS/CORS production guards so the
    # ambient .env's localhost URLs don't fail Settings validation under pytest.
    "ENVIRONMENT": "development",
    "SUPABASE_URL": "https://test.supabase.co",
    "SUPABASE_ANON_KEY": "test-anon-key",
    "SUPABASE_SERVICE_KEY": "test-service-key",
    "SUPABASE_JWT_SECRET": "test-jwt-secret-padded-to-thirty-two-plus-chars",
    "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
}

for _key, _value in _REQUIRED_TEST_ENV.items():
    os.environ.setdefault(_key, _value)

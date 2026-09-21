// Runs before every test file (see vitest.config.ts setupFiles) so the app
// and db modules see these values the very first time they're imported.
process.env.DATABASE_PATH = ':memory:';
process.env.NODE_ENV = 'test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.JWT_SECRET = '';
process.env.DEFAULT_TENANT_ID = 'test-tenant';
process.env.AI_API_KEY = '';

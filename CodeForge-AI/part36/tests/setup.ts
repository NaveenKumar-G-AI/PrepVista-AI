// Runs before every test file is imported, so src/config/env.ts (which
// parses process.env at module-load time) always sees a complete,
// zero-infrastructure configuration — no real Postgres/Redis/JWT
// secret/AI key required to run the test suite.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_PROVIDER = 'memory';
process.env.CACHE_PROVIDER = 'memory';
process.env.QUEUE_PROVIDER = 'memory';
process.env.AI_PROVIDER = 'none';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-please-change';
process.env.JWT_ISSUER = process.env.JWT_ISSUER || 'codeforge-test';
process.env.USE_MOCK_INTEGRATIONS = 'true';

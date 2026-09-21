process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.PORT = '4099';
process.env.ANTHROPIC_API_KEY = ''; // keep AI adapter in its "unavailable" branch for deterministic tests

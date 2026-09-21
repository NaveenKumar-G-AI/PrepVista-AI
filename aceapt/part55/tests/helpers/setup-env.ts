import 'dotenv/config';

process.env.VITEST = 'true';
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

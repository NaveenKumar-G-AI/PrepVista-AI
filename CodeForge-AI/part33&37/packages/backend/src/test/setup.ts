// Backend test setup
import { vi } from 'vitest';

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.AI_PROVIDER = 'anthropic';
process.env.AI_API_KEY = 'test-ai-key';
process.env.NODE_ENV = 'test';

// Mock console methods to reduce noise
const originalConsole = { ...console };
beforeAll(() => {
  console.log = vi.fn();
  console.warn = vi.fn();
  console.error = vi.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});
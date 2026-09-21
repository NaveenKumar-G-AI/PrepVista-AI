import type { Config } from 'drizzle-kit';
import 'dotenv/config';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: (process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, ''),
  },
} satisfies Config;

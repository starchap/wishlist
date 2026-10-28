import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './libs/shared/database/src/lib/schema.ts',
  out: './libs/shared/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    // Neon best practice: prefer unpooled connection for schema migrations/DDL when available
    url: (process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL)!
  }
});

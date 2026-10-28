import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './lib/schema';

let _db: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Returns the singleton Drizzle ORM instance wired to Neon Serverless HTTP driver.
 * Best practice for Next.js Server Components/Actions & Render.com with Neon pooled connections.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) {
    return _db;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required for Neon Postgres');
  }
  const sql = neon(connectionString);
  _db = drizzle(sql, { schema });
  return _db;
}

export * from './lib/schema';

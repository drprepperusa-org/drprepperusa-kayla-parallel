/**
 * @file server/db/knex.ts
 * @description Knex.js database connection factory.
 *
 * - Dev: SQLite (file-based, zero config)
 * - Production: PostgreSQL (DATABASE_URL env var)
 *
 * Connection pooling is handled automatically by Knex.
 */

import Knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildKnexConfig(): Knex.Knex.Config {
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const databaseUrl = process.env['DATABASE_URL'];

  if (nodeEnv === 'production' || (databaseUrl && databaseUrl.startsWith('postgres'))) {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
    return {
      client: 'pg',
      connection: databaseUrl,
      pool: { min: 2, max: 10 },
      migrations: {
        directory: path.join(__dirname, 'migrations'),
        extension: 'ts',
        tableName: 'knex_migrations',
      },
    };
  }

  // SQLite for development / test
  const dbPath =
    databaseUrl?.startsWith('sqlite://') ? databaseUrl.replace('sqlite://', '') :
    databaseUrl ?? path.join(__dirname, '../../dev.sqlite3');

  return {
    client: 'better-sqlite3',
    connection: { filename: dbPath },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      extension: 'ts',
      tableName: 'knex_migrations',
    },
    pool: { min: 1, max: 1 }, // SQLite is single-connection
  };
}

let _db: Knex.Knex | null = null;

/**
 * Get (or lazily create) the shared Knex database instance.
 * Call once at server startup; reuse throughout.
 */
export function getDb(): Knex.Knex {
  if (!_db) {
    _db = Knex(buildKnexConfig());
  }
  return _db;
}

/**
 * Destroy the database connection (for graceful shutdown / tests).
 */
export async function destroyDb(): Promise<void> {
  if (_db) {
    await _db.destroy();
    _db = null;
  }
}

/**
 * Replace the database instance (test isolation — inject an in-memory DB).
 */
export function setDb(instance: Knex.Knex): void {
  _db = instance;
}

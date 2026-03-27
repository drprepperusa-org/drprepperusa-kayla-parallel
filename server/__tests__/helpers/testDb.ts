/**
 * @file server/__tests__/helpers/testDb.ts
 * @description In-memory SQLite test database helper.
 *
 * Creates a fresh in-memory SQLite DB with migrations applied.
 * Call createTestDb() in beforeEach/beforeAll; call db.destroy() in afterEach/afterAll.
 */

import Knex from 'knex';
import path from 'path';
import { fileURLToPath } from 'url';
import { setDb } from '../../db/knex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createTestDb(): Promise<Knex.Knex> {
  const db = Knex({
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../db/migrations'),
      extension: 'ts',
      loadExtensions: ['.ts'],
      tableName: 'knex_migrations',
    },
    pool: { min: 1, max: 1 },
  });

  await db.migrate.latest();
  setDb(db);
  return db;
}

export async function destroyTestDb(db: Knex.Knex): Promise<void> {
  await db.destroy();
}

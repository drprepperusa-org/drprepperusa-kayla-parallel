/**
 * @file server/db/migrate.ts
 * @description Run database migrations on startup.
 *
 * Usage:
 *   npx tsx server/db/migrate.ts          # Run pending migrations
 *   npx tsx server/db/migrate.ts rollback # Rollback last batch
 */

import { getDb } from './knex.js';

const command = process.argv[2] ?? 'latest';

const db = getDb();

try {
  if (command === 'rollback') {
    const [batchNo, log] = await db.migrate.rollback();
    console.log(`Rolled back batch ${batchNo}:`, log);
  } else {
    const [batchNo, log] = await db.migrate.latest();
    if (log.length === 0) {
      console.log('Database already up to date.');
    } else {
      console.log(`Ran migrations (batch ${batchNo}):`, log);
    }
  }
  await db.destroy();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  await db.destroy();
  process.exit(1);
}

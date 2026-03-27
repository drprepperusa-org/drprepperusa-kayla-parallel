/**
 * Migration 002: billing_settings table
 * Stores global billing settings (prep cost, package cost per oz, sync freq).
 * One row per client_id (NULL = global default).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('billing_settings', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());

    // NULL client_id = global settings
    table.string('client_id', 255).nullable().unique();

    // Q7 billing fields
    table.decimal('prep_cost', 10, 3).notNullable().defaultTo(0);
    table.decimal('package_cost_per_oz', 10, 3).notNullable().defaultTo(0);

    // Sync frequency (minutes): 5, 10, 30, 60
    table.integer('sync_frequency_min').notNullable().defaultTo(5);

    // Auto-void after N days (NULL = disabled)
    table.integer('auto_void_after_days').nullable();

    // Timestamps
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // Seed global default row
  await knex('billing_settings').insert({
    client_id: null,
    prep_cost: 0,
    package_cost_per_oz: 0,
    sync_frequency_min: 5,
    auto_void_after_days: null,
  }).onConflict('client_id').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('billing_settings');
}

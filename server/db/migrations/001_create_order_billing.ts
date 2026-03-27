/**
 * Migration 001: order_billing table
 * Stores one billing record per order (upsert on recalculate).
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('order_billing', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table.string('order_id', 255).notNullable();

    table.string('client_id', 255).nullable();

    // Cost inputs
    table.decimal('shipping_cost', 10, 2).notNullable().defaultTo(0);
    table.decimal('prep_cost', 10, 2).notNullable().defaultTo(0);
    table.decimal('package_cost', 10, 2).notNullable().defaultTo(0);
    table.integer('carrier_markup_percent').notNullable().defaultTo(0);
    table.decimal('markup_amount', 10, 2).notNullable().defaultTo(0);

    // Totals
    table.decimal('subtotal', 10, 2).notNullable().defaultTo(0);
    table.decimal('total_cost', 10, 2).notNullable().defaultTo(0);

    // Audit
    table.text('breakdown').nullable();
    table.string('rounding_method', 20).defaultTo('bankers');

    // Status
    table.boolean('voided').notNullable().defaultTo(false);
    table.timestamp('voided_at', { useTz: true }).nullable();

    // Timestamps
    table.timestamp('calculated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Constraint: one billing record per order
    table.unique(['order_id']);
  });

  // Indexes
  await knex.schema.table('order_billing', (table) => {
    table.index(['order_id'], 'idx_order_billing_order_id');
    table.index(['client_id'], 'idx_order_billing_client_id');
    table.index(['calculated_at'], 'idx_order_billing_calculated_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('order_billing');
}

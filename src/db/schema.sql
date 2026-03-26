-- Phase 3 Week 3: Database Schema for Billing Persistence
-- Q7 (DJ, LOCKED): "Billing should be stored in database"
--
-- Migrations:
--   001_create_order_billing.sql  → order_billing table
--   002_create_billing_settings.sql → billing_settings table

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: order_billing
-- Stores one billing record per order (upsert on recalculate).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_billing (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              VARCHAR(255) NOT NULL,
  client_id             VARCHAR(255),

  -- Cost inputs
  shipping_cost         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  prep_cost             DECIMAL(10, 2) NOT NULL DEFAULT 0,
  package_cost          DECIMAL(10, 2) NOT NULL DEFAULT 0,
  carrier_markup_percent INT NOT NULL DEFAULT 0,
  markup_amount         DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Totals
  subtotal              DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_cost            DECIMAL(10, 2) NOT NULL DEFAULT 0,

  -- Audit
  breakdown             TEXT,
  rounding_method       VARCHAR(20) DEFAULT 'bankers',

  -- Status
  voided                BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at             TIMESTAMP WITH TIME ZONE,

  -- Timestamps
  calculated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Constraint: one billing record per order
  UNIQUE (order_id)
);

-- Indexes for query patterns:
--   - Lookup by order (primary key path)
--   - List by client (for billing list page)
--   - Filter by date range (for billing export)
CREATE INDEX IF NOT EXISTS idx_order_billing_order_id     ON order_billing(order_id);
CREATE INDEX IF NOT EXISTS idx_order_billing_client_id    ON order_billing(client_id);
CREATE INDEX IF NOT EXISTS idx_order_billing_calculated_at ON order_billing(calculated_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: billing_settings
-- Stores global billing settings (prep cost, package cost per oz, sync freq).
-- One row per client_id (NULL = global default).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS billing_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL client_id = global settings (applies to all clients without own row)
  client_id             VARCHAR(255) UNIQUE,

  -- Q7 billing fields
  prep_cost             DECIMAL(10, 3) NOT NULL DEFAULT 0.000,
  package_cost_per_oz   DECIMAL(10, 3) NOT NULL DEFAULT 0.000,

  -- Sync frequency (minutes): 5, 10, 30, 60
  sync_frequency_min    INT NOT NULL DEFAULT 5
    CHECK (sync_frequency_min IN (5, 10, 30, 60)),

  -- Auto-void after N days (NULL = disabled)
  auto_void_after_days  INT,

  -- Timestamps
  created_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Seed global default row
INSERT INTO billing_settings (client_id, prep_cost, package_cost_per_oz, sync_frequency_min)
VALUES (NULL, 0.000, 0.000, 5)
ON CONFLICT (client_id) DO NOTHING;

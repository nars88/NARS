-- ============================================================
-- IraqOrder – PostgreSQL Schema (Supabase)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUMS ────────────────────────────────────────────────────
CREATE TYPE order_status AS ENUM (
  'Pending',
  'Confirmed',
  'Shipped',
  'Delivered',
  'Canceled'
);

CREATE TYPE iraq_province AS ENUM (
  'Baghdad',
  'Basra',
  'Nineveh',
  'Erbil',
  'Sulaymaniyah',
  'Duhok',
  'Kirkuk',
  'Anbar',
  'Diyala',
  'Babil',
  'Karbala',
  'Najaf',
  'Wasit',
  'Maysan',
  'Dhi_Qar',
  'Muthanna',
  'Qadisiyyah',
  'Saladin',
  'Halabja',
  'Unknown'
);

-- ─── ORDERS TABLE ─────────────────────────────────────────────
CREATE TABLE orders (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Customer info
  customer_name     TEXT          NOT NULL,
  phone_number      TEXT          NOT NULL
    CONSTRAINT valid_iraqi_phone
      CHECK (phone_number ~ '^(\+964|0)(77|78|79|75)\d{8}$'),

  -- Location
  province          iraq_province NOT NULL DEFAULT 'Unknown',
  full_address      TEXT,

  -- Product details stored as JSONB for flexibility
  -- Expected shape:
  -- [{ "name": "...", "size": "XL", "color": "أحمر", "quantity": 2, "unit_price": 25000 }]
  product_details   JSONB         NOT NULL DEFAULT '[]',

  -- Financials
  total_price       NUMERIC(12,0),           -- Iraqi Dinar, no decimals needed
  delivery_fee      NUMERIC(12,0) DEFAULT 0,

  -- Status workflow
  order_status      order_status  NOT NULL DEFAULT 'Pending',

  -- AI provenance
  original_raw_text TEXT          NOT NULL,
  ai_confidence     SMALLINT      CHECK (ai_confidence BETWEEN 0 AND 100),
  ai_model          TEXT,                    -- e.g. 'claude-sonnet-4-20250514'

  -- Metadata
  employee_id       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── AUTO-UPDATE updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── INDEXES ──────────────────────────────────────────────────
CREATE INDEX idx_orders_status        ON orders(order_status);
CREATE INDEX idx_orders_province      ON orders(province);
CREATE INDEX idx_orders_phone         ON orders(phone_number);
CREATE INDEX idx_orders_created_at    ON orders(created_at DESC);
CREATE INDEX idx_orders_employee      ON orders(employee_id);
-- GIN index for JSONB product search
CREATE INDEX idx_orders_products_gin  ON orders USING GIN (product_details);

-- ─── ROW-LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Employees can only see orders they created
CREATE POLICY "employees_own_orders"
  ON orders FOR ALL
  USING (employee_id = auth.uid());

-- Admins (role = 'admin' in JWT claims) can see everything
CREATE POLICY "admins_all_orders"
  ON orders FOR ALL
  USING (
    (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── AUDIT LOG (optional but recommended) ────────────────────
CREATE TABLE order_audit_log (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  old_status  order_status,
  new_status  order_status,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note        TEXT
);
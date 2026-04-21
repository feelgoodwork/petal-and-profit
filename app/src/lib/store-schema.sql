-- Petal & Profit — Per-store database schema.
-- Idempotent: safe to apply against a fresh or existing store DB. Any ALTER
-- columns use IF NOT EXISTS so partially-initialized DBs can be re-run.

CREATE TABLE IF NOT EXISTS vendors (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,
  invoice_type      TEXT NOT NULL DEFAULT 'unknown',
  extraction_method TEXT NOT NULL DEFAULT 'claude_vision',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id                SERIAL PRIMARY KEY,
  vendor_id         INTEGER NOT NULL REFERENCES vendors(id),
  file_path         TEXT NOT NULL,
  file_name         TEXT NOT NULL,
  invoice_number    TEXT,
  invoice_date      TEXT,
  subtotal          REAL,
  tax               REAL,
  total             REAL,
  extraction_method TEXT,
  extraction_status TEXT DEFAULT 'pending',
  raw_extraction    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_items (
  id              SERIAL PRIMARY KEY,
  receipt_id      INTEGER NOT NULL REFERENCES receipts(id),
  line_number     INTEGER,
  item_code       TEXT,
  description     TEXT NOT NULL,
  unit_type       TEXT,
  quantity        REAL,
  unit_price      REAL,
  line_total      REAL,
  discount_pct    REAL,
  is_flower       INTEGER DEFAULT 1,
  price_basis     TEXT DEFAULT 'unknown',
  stems_per_unit  REAL,
  cost_per_stem   REAL,
  notes           TEXT,
  review_status   TEXT DEFAULT 'pending',
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flower_catalog (
  id             SERIAL PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  category       TEXT,
  base_type      TEXT,
  notes          TEXT
);

CREATE TABLE IF NOT EXISTS flower_aliases (
  id         SERIAL PRIMARY KEY,
  flower_id  INTEGER NOT NULL REFERENCES flower_catalog(id),
  alias      TEXT NOT NULL,
  vendor_id  INTEGER REFERENCES vendors(id),
  confidence REAL DEFAULT 1.0,
  UNIQUE(alias, vendor_id)
);

CREATE TABLE IF NOT EXISTS recipe_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  source_file TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES recipe_categories(id),
  name        TEXT NOT NULL,
  sell_price  REAL NOT NULL,
  container   TEXT,
  notes       TEXT,
  image_url   TEXT,
  categories  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id               SERIAL PRIMARY KEY,
  recipe_id        INTEGER NOT NULL REFERENCES recipes(id),
  ingredient_name  TEXT NOT NULL,
  flower_id        INTEGER REFERENCES flower_catalog(id),
  quantity         REAL,
  unit             TEXT DEFAULT 'stem',
  is_foliage       INTEGER DEFAULT 0,
  match_status     TEXT DEFAULT 'pending',
  match_confidence REAL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredient_costs (
  id                   SERIAL PRIMARY KEY,
  flower_id            INTEGER NOT NULL REFERENCES flower_catalog(id),
  vendor_id            INTEGER REFERENCES vendors(id),
  unit_cost            REAL NOT NULL,
  cost_per             TEXT DEFAULT 'stem',
  source_line_item_id  INTEGER REFERENCES line_items(id),
  invoice_date         TEXT,
  parsed_date          DATE,
  is_current           BOOLEAN DEFAULT false,
  stem_size_cm         INTEGER,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profitability_snapshots (
  id                  SERIAL PRIMARY KEY,
  recipe_id           INTEGER NOT NULL REFERENCES recipes(id),
  sell_price          REAL NOT NULL,
  total_flower_cost   REAL,
  container_cost      REAL DEFAULT 0,
  labor_cost          REAL DEFAULT 0,
  total_cost          REAL,
  gross_margin        REAL,
  margin_pct          REAL,
  missing_ingredients INTEGER DEFAULT 0,
  pp_flower_cost      REAL,
  pp_margin           REAL,
  pp_margin_pct       REAL,
  pp_missing          INTEGER DEFAULT 0,
  computed_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales (
  id              SERIAL PRIMARY KEY,
  order_number    TEXT,
  order_date      TEXT,
  parsed_date     DATE,
  description     TEXT,
  quantity        INTEGER,
  unit_price      REAL,
  line_total      REAL,
  recipe_id       INTEGER REFERENCES recipes(id),
  source          TEXT,
  occasion        TEXT,
  item_code       TEXT,
  is_arrangement  BOOLEAN DEFAULT true,
  match_tier      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wholesale_benchmarks (
  id            SERIAL PRIMARY KEY,
  vendor_name   TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  catalog_type  TEXT,
  base_type     TEXT,
  color         TEXT,
  stems_per_bunch INTEGER,
  price         REAL,
  pp_price      REAL,
  source_url    TEXT,
  captured_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fiftyflowers_benchmarks (
  id            SERIAL PRIMARY KEY,
  product_name  TEXT NOT NULL,
  catalog_type  TEXT,
  base_type     TEXT,
  color         TEXT,
  price         REAL,
  stems_per_unit INTEGER,
  cost_per_stem REAL,
  source_url    TEXT,
  captured_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Defensive ADD-COLUMN statements for DBs that were created before the
-- consolidated schema landed. No-ops on fresh installs.
ALTER TABLE ingredient_costs    ADD COLUMN IF NOT EXISTS parsed_date DATE;
ALTER TABLE ingredient_costs    ADD COLUMN IF NOT EXISTS is_current  BOOLEAN DEFAULT false;
ALTER TABLE ingredient_costs    ADD COLUMN IF NOT EXISTS stem_size_cm INTEGER;
ALTER TABLE recipes             ADD COLUMN IF NOT EXISTS image_url   TEXT;
ALTER TABLE recipes             ADD COLUMN IF NOT EXISTS categories  TEXT;
ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_flower_cost REAL;
ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin      REAL;
ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin_pct  REAL;
ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_missing     INTEGER DEFAULT 0;
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS source          TEXT;
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS occasion        TEXT;
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS item_code       TEXT;
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS is_arrangement  BOOLEAN DEFAULT true;
ALTER TABLE sales               ADD COLUMN IF NOT EXISTS match_tier      TEXT;

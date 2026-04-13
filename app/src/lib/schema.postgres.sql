-- Petal & Profit -- Neon Postgres Schema

CREATE TABLE IF NOT EXISTS vendors (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  invoice_type  TEXT NOT NULL DEFAULT 'unknown',
  extraction_method TEXT NOT NULL DEFAULT 'claude_vision',
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipts (
  id            SERIAL PRIMARY KEY,
  vendor_id     INTEGER NOT NULL REFERENCES vendors(id),
  file_path     TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  invoice_number TEXT,
  invoice_date  TEXT,
  subtotal      REAL,
  tax           REAL,
  total         REAL,
  extraction_method TEXT,
  extraction_status TEXT DEFAULT 'pending',
  raw_extraction TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS line_items (
  id            SERIAL PRIMARY KEY,
  receipt_id    INTEGER NOT NULL REFERENCES receipts(id),
  line_number   INTEGER,
  item_code     TEXT,
  description   TEXT NOT NULL,
  unit_type     TEXT,
  quantity      REAL,
  unit_price    REAL,
  line_total    REAL,
  discount_pct  REAL,
  is_flower     INTEGER DEFAULT 1,
  price_basis   TEXT DEFAULT 'unknown',
  stems_per_unit REAL,
  cost_per_stem REAL,
  notes         TEXT,
  review_status TEXT DEFAULT 'pending',
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flower_catalog (
  id            SERIAL PRIMARY KEY,
  canonical_name TEXT NOT NULL UNIQUE,
  category      TEXT,
  notes         TEXT
);

CREATE TABLE IF NOT EXISTS flower_aliases (
  id            SERIAL PRIMARY KEY,
  flower_id     INTEGER NOT NULL REFERENCES flower_catalog(id),
  alias         TEXT NOT NULL,
  vendor_id     INTEGER REFERENCES vendors(id),
  confidence    REAL DEFAULT 1.0,
  UNIQUE(alias, vendor_id)
);

CREATE TABLE IF NOT EXISTS recipe_categories (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  source_file   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
  id            SERIAL PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES recipe_categories(id),
  name          TEXT NOT NULL,
  sell_price    REAL NOT NULL,
  container     TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id            SERIAL PRIMARY KEY,
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id),
  ingredient_name TEXT NOT NULL,
  flower_id     INTEGER REFERENCES flower_catalog(id),
  quantity      REAL,
  unit          TEXT DEFAULT 'stem',
  is_foliage    INTEGER DEFAULT 0,
  match_status  TEXT DEFAULT 'pending',
  match_confidence REAL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingredient_costs (
  id            SERIAL PRIMARY KEY,
  flower_id     INTEGER NOT NULL REFERENCES flower_catalog(id),
  vendor_id     INTEGER REFERENCES vendors(id),
  unit_cost     REAL NOT NULL,
  cost_per      TEXT DEFAULT 'stem',
  source_line_item_id INTEGER REFERENCES line_items(id),
  invoice_date  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profitability_snapshots (
  id            SERIAL PRIMARY KEY,
  recipe_id     INTEGER NOT NULL REFERENCES recipes(id),
  sell_price    REAL NOT NULL,
  total_flower_cost REAL,
  container_cost REAL DEFAULT 0,
  labor_cost    REAL DEFAULT 0,
  total_cost    REAL,
  gross_margin  REAL,
  margin_pct    REAL,
  missing_ingredients INTEGER DEFAULT 0,
  computed_at   TIMESTAMPTZ DEFAULT NOW()
);

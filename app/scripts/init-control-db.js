/**
 * Initialize the Petal & Profit control database.
 *
 * The control DB holds auth + tenancy tables (stores, users, user_stores,
 * sessions). Each store has its own per-tenant Neon DB. The app resolves
 * which store DB to use from the session cookie on every request.
 *
 * Before running this script:
 *   1. Provision a new Neon project/database (name it something like
 *      petal-and-profit-control).
 *   2. Copy its connection string into .env.local as CONTROL_DATABASE_URL.
 *   3. Run: node scripts/init-control-db.js
 *
 * Idempotent: safe to re-run. Uses CREATE TABLE IF NOT EXISTS.
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS stores (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  database_url      TEXT NOT NULL,
  notes             TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id                SERIAL PRIMARY KEY,
  email             TEXT NOT NULL UNIQUE,
  password_hash     TEXT NOT NULL,
  display_name      TEXT,
  is_superadmin     BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_stores (
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role              TEXT NOT NULL DEFAULT 'member',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, store_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token             TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_store_id   INTEGER REFERENCES stores(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  last_used_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
`;

async function main() {
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) {
    console.error('CONTROL_DATABASE_URL is not set in .env.local.');
    console.error('Provision a Neon database for the control plane and add');
    console.error('  CONTROL_DATABASE_URL="postgres://..."');
    console.error('to app/.env.local, then re-run this script.');
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  await client.connect();

  try {
    await client.query(SCHEMA);
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('Control DB initialized. Tables:');
    for (const t of tables) console.log('  -', t.table_name);
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

/**
 * Seed the control database with the first superadmin user and the first
 * store (which points at the existing Uptowne Neon DB).
 *
 * Usage:
 *   SUPERADMIN_EMAIL=you@example.com \
 *   SUPERADMIN_PASSWORD="choose-one" \
 *   FIRST_STORE_SLUG=uptowne \
 *   FIRST_STORE_NAME="Milano's UpTowne Florist" \
 *   FIRST_STORE_DATABASE_URL="<existing DATABASE_URL>" \
 *   node scripts/seed-control-db.js
 *
 * Idempotent: ON CONFLICT DO NOTHING on the user/store inserts. If you need
 * to rotate the superadmin password, pass RESET_SUPERADMIN_PASSWORD=true.
 */
const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

async function main() {
  const controlUrl = process.env.CONTROL_DATABASE_URL;
  if (!controlUrl) {
    console.error('CONTROL_DATABASE_URL is not set. Run init-control-db.js first.');
    process.exit(1);
  }

  const email = process.env.SUPERADMIN_EMAIL;
  const pw = process.env.SUPERADMIN_PASSWORD;
  if (!email || !pw) {
    console.error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are required.');
    process.exit(1);
  }

  const storeSlug = process.env.FIRST_STORE_SLUG || 'uptowne';
  const storeName = process.env.FIRST_STORE_NAME || "Milano's UpTowne Florist";
  const storeUrl = process.env.FIRST_STORE_DATABASE_URL || process.env.DATABASE_URL;
  if (!storeUrl) {
    console.error('FIRST_STORE_DATABASE_URL (or DATABASE_URL) must be set — this is the Neon URL for the store.');
    process.exit(1);
  }

  const resetPassword = process.env.RESET_SUPERADMIN_PASSWORD === 'true';

  const client = new Client({
    connectionString: controlUrl,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  await client.connect();

  try {
    const hash = await bcrypt.hash(pw, 12);

    // Upsert user (optionally resetting password)
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, is_superadmin, display_name)
       VALUES ($1, $2, true, $3)
       ON CONFLICT (email) DO UPDATE SET
         is_superadmin = true,
         password_hash = CASE WHEN $4 THEN EXCLUDED.password_hash ELSE users.password_hash END
       RETURNING id, email, is_superadmin`,
      [email, hash, email.split('@')[0], resetPassword]
    );
    const user = userRows[0];
    console.log(`Superadmin: [${user.id}] ${user.email}`);

    // Upsert first store
    const { rows: storeRows } = await client.query(
      `INSERT INTO stores (slug, name, database_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         database_url = EXCLUDED.database_url
       RETURNING id, slug, name`,
      [storeSlug, storeName, storeUrl]
    );
    const store = storeRows[0];
    console.log(`Store: [${store.id}] ${store.slug} (${store.name})`);

    // Link user to store with 'owner' role (superadmin can see all anyway, but
    // having a default membership is handy for store-switcher UX).
    await client.query(
      `INSERT INTO user_stores (user_id, store_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [user.id, store.id]
    );
    console.log(`Membership: ${user.email} → ${store.slug} (owner)`);

    console.log('\nDone. Log in at /login with the email + password you provided.');
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

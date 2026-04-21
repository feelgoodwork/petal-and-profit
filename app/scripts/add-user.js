/**
 * Add a user to the control DB and (optionally) grant access to a store.
 *
 * Usage:
 *   EMAIL=designer@uptowne.com \
 *   PASSWORD="generate-one" \
 *   DISPLAY_NAME="Jane Doe" \
 *   STORE_SLUG=uptowne \
 *   ROLE=member \
 *   node scripts/add-user.js
 *
 * Optional:
 *   SUPERADMIN=true    # grant superadmin flag
 *
 * Idempotent on email. If the user already exists, we update their
 * display_name and (if password is provided) reset the password hash.
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
  const url = process.env.CONTROL_DATABASE_URL;
  if (!url) {
    console.error('CONTROL_DATABASE_URL is not set.');
    process.exit(1);
  }
  const email = (process.env.EMAIL || '').trim().toLowerCase();
  if (!email) {
    console.error('EMAIL is required.');
    process.exit(1);
  }
  const password = process.env.PASSWORD || '';
  const displayName = process.env.DISPLAY_NAME || email.split('@')[0];
  const storeSlug = process.env.STORE_SLUG || '';
  const role = process.env.ROLE || 'member';
  const superadmin = process.env.SUPERADMIN === 'true';

  const client = new Client({
    connectionString: url,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  await client.connect();

  try {
    // Upsert user
    let userId;
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      userId = existing.rows[0].id;
      const updates = ['display_name = $2', 'is_superadmin = CASE WHEN $3 THEN true ELSE is_superadmin END'];
      const params = [userId, displayName, superadmin];
      if (password) {
        const hash = await bcrypt.hash(password, 12);
        updates.push('password_hash = $4');
        params.push(hash);
      }
      await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);
      console.log(`Updated existing user [${userId}] ${email}${password ? ' (password reset)' : ''}`);
    } else {
      if (!password) {
        console.error('PASSWORD is required when creating a new user.');
        process.exit(1);
      }
      const hash = await bcrypt.hash(password, 12);
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, display_name, is_superadmin)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [email, hash, displayName, superadmin]
      );
      userId = rows[0].id;
      console.log(`Created user [${userId}] ${email}${superadmin ? ' (superadmin)' : ''}`);
    }

    // Grant store access if requested
    if (storeSlug) {
      const { rows: storeRows } = await client.query('SELECT id, name FROM stores WHERE slug = $1', [storeSlug]);
      if (storeRows.length === 0) {
        console.error(`Store "${storeSlug}" not found.`);
        process.exit(1);
      }
      const storeId = storeRows[0].id;
      await client.query(
        `INSERT INTO user_stores (user_id, store_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role`,
        [userId, storeId, role]
      );
      console.log(`Granted ${role} on store "${storeSlug}" (${storeRows[0].name})`);
    }
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

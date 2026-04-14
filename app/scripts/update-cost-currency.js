/**
 * Add parsed_date and is_current to ingredient_costs.
 *
 * Rule: use only 2024+ invoice data. If a flower type has no 2024+ data,
 * fall back to the single most recent invoice for that type.
 *
 * Usage: node scripts/update-cost-currency.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // 1. Add columns if they don't exist
  await client.query('ALTER TABLE ingredient_costs ADD COLUMN IF NOT EXISTS parsed_date DATE');
  await client.query('ALTER TABLE ingredient_costs ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false');
  console.log('Columns added (or already exist).');

  // 2. Backfill parsed_date from invoice_date text
  const backfill = await client.query(`
    UPDATE ingredient_costs SET parsed_date =
      CASE
        WHEN invoice_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN invoice_date::date
        WHEN invoice_date ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN TO_DATE(invoice_date, 'MM/DD/YYYY')
        WHEN invoice_date ~ '^\\d{1,2}/\\d{1,2}/\\d{2}$' THEN TO_DATE(invoice_date, 'MM/DD/YY')
        ELSE NULL
      END
    WHERE parsed_date IS NULL OR parsed_date IS NOT NULL
  `);
  console.log('Backfilled parsed_date for ' + backfill.rowCount + ' rows.');

  // 3. Reset all to not current
  await client.query('UPDATE ingredient_costs SET is_current = false');

  // 4. Mark 2024+ rows as current
  const marked2024 = await client.query(`
    UPDATE ingredient_costs SET is_current = true
    WHERE parsed_date >= '2024-01-01'
  `);
  console.log('Marked ' + marked2024.rowCount + ' rows as current (2024+).');

  // 5. For flower types with NO 2024+ data, mark the most recent row as current
  const fallback = await client.query(`
    UPDATE ingredient_costs SET is_current = true
    WHERE id IN (
      SELECT DISTINCT ON (flower_id) id
      FROM ingredient_costs
      WHERE flower_id NOT IN (
        SELECT DISTINCT flower_id FROM ingredient_costs WHERE parsed_date >= '2024-01-01'
      )
      ORDER BY flower_id, parsed_date DESC NULLS LAST, id DESC
    )
  `);
  console.log('Marked ' + fallback.rowCount + ' fallback rows as current (most recent, no 2024+ data).');

  // 6. Summary
  const summary = await client.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_current) as current_count,
      COUNT(*) FILTER (WHERE NOT is_current) as excluded_count,
      COUNT(DISTINCT flower_id) as total_flowers,
      COUNT(DISTINCT flower_id) FILTER (WHERE is_current) as flowers_with_current,
      COUNT(DISTINCT flower_id) FILTER (WHERE is_current AND parsed_date >= '2024-01-01') as flowers_with_2024_data,
      COUNT(DISTINCT flower_id) FILTER (WHERE is_current AND (parsed_date < '2024-01-01' OR parsed_date IS NULL)) as flowers_fallback
    FROM ingredient_costs
  `);
  const s = summary.rows[0];
  console.log('\n=== Summary ===');
  console.log('  Total cost records: ' + s.total);
  console.log('  Current (used): ' + s.current_count);
  console.log('  Excluded (old): ' + s.excluded_count);
  console.log('  Flower types total: ' + s.total_flowers);
  console.log('  With 2024+ data: ' + s.flowers_with_2024_data);
  console.log('  Fallback (most recent pre-2024): ' + s.flowers_fallback);

  // Show which types fell back
  const fallbackTypes = await client.query(`
    SELECT fc.canonical_name, ic.parsed_date, ic.unit_cost, ic.invoice_date
    FROM ingredient_costs ic
    JOIN flower_catalog fc ON ic.flower_id = fc.id
    WHERE ic.is_current = true
      AND (ic.parsed_date < '2024-01-01' OR ic.parsed_date IS NULL)
    ORDER BY fc.canonical_name
  `);
  if (fallbackTypes.rows.length > 0) {
    console.log('\n  Fallback types (most recent pre-2024):');
    for (const r of fallbackTypes.rows) {
      console.log('    ' + r.canonical_name + ' => $' + Number(r.unit_cost).toFixed(2) + ' from ' + (r.invoice_date || 'unknown date'));
    }
  }

  await client.end();
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });

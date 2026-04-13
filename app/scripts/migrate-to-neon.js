/**
 * Migrate data from local SQLite to Neon Postgres.
 * Uses pg (node-postgres) for the migration since it handles multi-statement SQL properly.
 */
const Database = require('better-sqlite3');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const sqliteDb = new Database(path.join(__dirname, '..', 'data', 'petal-and-profit.db'));

async function migrate() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log('=== Migrating SQLite to Neon Postgres ===\n');

  // 1. Run schema
  console.log('1. Creating schema...');
  const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'schema.postgres.sql'), 'utf-8');
  await client.query(schema);
  console.log('   Done.\n');

  // Helper
  async function migrateTable(tableName, columns) {
    const rows = sqliteDb.prepare(`SELECT * FROM ${tableName}`).all();
    console.log(`   ${tableName}: ${rows.length} rows...`);
    if (rows.length === 0) return;

    await client.query(`DELETE FROM ${tableName}`);

    let inserted = 0;
    for (const row of rows) {
      const vals = columns.map(c => row[c] ?? null);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      const idPlaceholder = `$${columns.length + 1}`;
      const colNames = columns.join(', ');

      await client.query(
        `INSERT INTO ${tableName} (id, ${colNames}) VALUES (${idPlaceholder}, ${placeholders}) ON CONFLICT (id) DO NOTHING`,
        [...vals, row.id]
      );
      inserted++;
      if (inserted % 100 === 0) process.stdout.write(`   ${inserted}/${rows.length}\r`);
    }

    // Reset sequence
    const maxId = Math.max(...rows.map(r => r.id));
    await client.query(`SELECT setval(pg_get_serial_sequence('${tableName}', 'id'), $1)`, [maxId]);
    console.log(`   ${tableName}: ${inserted} rows done.`);
  }

  console.log('2. Migrating tables...');
  await migrateTable('vendors', ['name', 'invoice_type', 'extraction_method', 'notes']);
  await migrateTable('receipts', ['vendor_id', 'file_path', 'file_name', 'invoice_number', 'invoice_date', 'subtotal', 'tax', 'total', 'extraction_method', 'extraction_status', 'raw_extraction']);
  await migrateTable('line_items', ['receipt_id', 'line_number', 'item_code', 'description', 'unit_type', 'quantity', 'unit_price', 'line_total', 'discount_pct', 'is_flower', 'price_basis', 'stems_per_unit', 'cost_per_stem', 'notes', 'review_status']);
  await migrateTable('flower_catalog', ['canonical_name', 'category', 'notes']);
  await migrateTable('flower_aliases', ['flower_id', 'alias', 'vendor_id', 'confidence']);
  await migrateTable('recipe_categories', ['name', 'source_file']);
  await migrateTable('recipes', ['category_id', 'name', 'sell_price', 'container', 'notes']);
  await migrateTable('recipe_ingredients', ['recipe_id', 'ingredient_name', 'flower_id', 'quantity', 'unit', 'is_foliage', 'match_status', 'match_confidence']);
  await migrateTable('ingredient_costs', ['flower_id', 'vendor_id', 'unit_cost', 'cost_per', 'source_line_item_id', 'invoice_date', 'notes']);
  await migrateTable('profitability_snapshots', ['recipe_id', 'sell_price', 'total_flower_cost', 'container_cost', 'labor_cost', 'total_cost', 'gross_margin', 'margin_pct', 'missing_ingredients']);

  // Verify
  console.log('\n=== Verification ===');
  const { rows } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM vendors)::int as vendors,
      (SELECT COUNT(*) FROM receipts)::int as receipts,
      (SELECT COUNT(*) FROM line_items)::int as line_items,
      (SELECT COUNT(*) FROM recipes)::int as recipes,
      (SELECT COUNT(*) FROM flower_catalog)::int as catalog,
      (SELECT COUNT(*) FROM ingredient_costs)::int as costs
  `);
  console.log(rows[0]);

  await client.end();
  console.log('\nMigration complete!');
}

migrate().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});

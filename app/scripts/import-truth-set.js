/**
 * Import the Uptowne truth-set xlsx into the per-store Neon database.
 *
 * Reads "All Arrangements" sheet, populates truth_recipes (one per arrangement
 * name, with MSRP) and truth_recipe_ingredients (every line item including
 * Title/MSRP rows for completeness; the comparison layer filters by type).
 *
 * Wipes existing truth_* rows on each run.
 *
 * Usage:
 *   node scripts/import-truth-set.js
 *   node scripts/import-truth-set.js --file=path/to/other.xlsx
 */
const XLSX = require('xlsx');
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

const fileArg = process.argv.find(a => a.startsWith('--file='));
const FILE = fileArg
  ? fileArg.split('=')[1]
  : path.join(__dirname, '..', 'data', 'truthsets', 'V1 Uptowne Arrangements & Ingredients List.xlsx');

if (!fs.existsSync(FILE)) {
  console.error('File not found:', FILE);
  process.exit(1);
}

(async () => {
  console.log('Reading', FILE);
  const wb = XLSX.readFile(FILE);
  const sheet = wb.Sheets['All Arrangements'];
  if (!sheet) throw new Error('"All Arrangements" sheet not found');

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  console.log('Rows in sheet:', rows.length);

  // Group by arrangement name
  const byName = new Map();
  for (const r of rows) {
    const name = r['Arrangement Name'];
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(r);
  }
  console.log('Distinct arrangements:', byName.size);

  const c = new Client({ connectionString: process.env.DATABASE_URL, keepAlive: true, keepAliveInitialDelayMillis: 10000 });
  await c.connect();

  console.log('Wiping truth_recipe_ingredients + truth_recipes...');
  await c.query('TRUNCATE truth_recipe_ingredients, truth_recipes RESTART IDENTITY CASCADE');

  let recipeCount = 0;
  let ingrCount = 0;

  for (const [name, lineItems] of byName) {
    // Find MSRP row to capture sell price
    const msrpRow = lineItems.find(r => (r['Line Item Type'] || '').toLowerCase() === 'msrp');
    const msrp = msrpRow ? Number(msrpRow['Unit Price']) || null : null;

    // Find any non-null Recipe Source for this arrangement
    const source = lineItems.find(r => r['Recipe Source'])?.['Recipe Source'] || null;

    const ins = await c.query(
      'INSERT INTO truth_recipes (name, msrp, source) VALUES ($1, $2, $3) RETURNING id',
      [name, msrp, source]
    );
    const recipeId = ins.rows[0].id;
    recipeCount++;

    for (const r of lineItems) {
      const type = (r['Line Item Type'] || '').toString();
      // Skip Title rows entirely (just headers, not real data)
      if (type.toLowerCase() === 'title') continue;
      // Skip MSRP rows (captured above as msrp on the recipe)
      if (type.toLowerCase() === 'msrp') continue;

      const ingName = r['Ingredient'];
      if (!ingName) continue;

      await c.query(
        `INSERT INTO truth_recipe_ingredients
          (truth_recipe_id, line_item_no, ingredient_name, line_item_type, quantity, unit_price, unit_measurement, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          recipeId,
          r['Line Item #'] != null ? Number(r['Line Item #']) : null,
          String(ingName),
          type || null,
          r['Quantity'] != null ? Number(r['Quantity']) : null,
          r['Unit Price'] != null ? Number(r['Unit Price']) : null,
          r['Unit Measurement'] != null ? String(r['Unit Measurement']) : null,
          r['Notes:'] != null ? String(r['Notes:']) : null,
        ]
      );
      ingrCount++;
    }
  }

  console.log(`Inserted ${recipeCount} recipes, ${ingrCount} ingredient rows.`);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });

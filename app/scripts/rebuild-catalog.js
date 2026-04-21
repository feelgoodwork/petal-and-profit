/**
 * Rebuild flower catalog + match recipe ingredients + match invoice line items.
 * Color-aware: "red roses", "white roses", "blue delphinium" etc. are separate entries.
 * Stem size (cm) is extracted from invoice descriptions and stored in ingredient_costs.
 *
 * Usage: node scripts/rebuild-catalog.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const { classifyProductType, isSupply } = require('../src/lib/matching/classifier-data.js');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

function extractStemSize(description) {
  const match = description.match(/\b(\d{2,3})\s*(?:cm|CM)\b/);
  return match ? parseInt(match[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ---- Step 1: Wipe and rebuild catalog ----
  console.log('\n[1/3] Rebuilding flower catalog...');
  await client.query('DELETE FROM flower_aliases');
  await client.query('DELETE FROM ingredient_costs');
  await client.query("UPDATE recipe_ingredients SET flower_id = NULL, match_status = 'pending', match_confidence = NULL");
  await client.query('DELETE FROM flower_catalog');

  const { rows: ingredients } = await client.query(
    'SELECT DISTINCT ingredient_name, is_foliage FROM recipe_ingredients'
  );
  console.log(`  Processing ${ingredients.length} unique ingredient names...`);

  // Build catalog entries (canonical_name → { category, base_type })
  // Also seed base_type as its own entry so invoice items without a color
  // (e.g. "MINI GERBERAS") can match even if recipes only use colored variants.
  const catalogEntries = new Map();
  for (const ing of ingredients) {
    const cl = classifyProductType(ing.ingredient_name);
    if (!cl) continue;
    const category = ing.is_foliage ? 'foliage' : cl.category;
    catalogEntries.set(cl.canonicalName, { category, base_type: cl.baseType });
    // Seed the base_type as a catch-all entry for no-color matches
    if (cl.baseType && cl.baseType !== cl.canonicalName && !catalogEntries.has(cl.baseType)) {
      catalogEntries.set(cl.baseType, { category, base_type: cl.baseType });
    }
  }
  const recipeEntryCount = catalogEntries.size;

  // Also seed from invoice line items: flowers we buy but have no recipe for
  // (e.g. "MINI GERBERAS", "Country Home 50 CM" → pink garden roses).
  const { rows: invoiceDescs } = await client.query(
    'SELECT DISTINCT description FROM line_items WHERE is_flower = 1'
  );
  for (const row of invoiceDescs) {
    const cl = classifyProductType(row.description);
    if (!cl) continue;
    if (!catalogEntries.has(cl.canonicalName)) {
      catalogEntries.set(cl.canonicalName, { category: cl.category, base_type: cl.baseType });
    }
    if (cl.baseType && cl.baseType !== cl.canonicalName && !catalogEntries.has(cl.baseType)) {
      catalogEntries.set(cl.baseType, { category: cl.category, base_type: cl.baseType });
    }
  }
  const invoiceAddedCount = catalogEntries.size - recipeEntryCount;

  for (const [name, info] of catalogEntries) {
    await client.query(
      'INSERT INTO flower_catalog (canonical_name, category, base_type) VALUES ($1, $2, $3) ON CONFLICT (canonical_name) DO UPDATE SET base_type = EXCLUDED.base_type',
      [name, info.category, info.base_type]
    );
  }
  console.log(`  Created ${catalogEntries.size} catalog entries (${recipeEntryCount} from recipes, +${invoiceAddedCount} from invoices)`);

  // ---- Step 2: Match recipe ingredients to catalog ----
  console.log('\n[2/3] Matching recipe ingredients to catalog...');
  const { rows: catalog } = await client.query('SELECT id, canonical_name FROM flower_catalog');
  const catalogMap = new Map(catalog.map(c => [c.canonical_name, c.id]));

  const { rows: allIngredients } = await client.query(
    'SELECT id, ingredient_name FROM recipe_ingredients WHERE flower_id IS NULL'
  );

  let matched = 0, unmatched = 0, nonIngredient = 0;
  const byFlower = new Map(); // flowerId → [ingredientId, ...]
  const supplyIds = [];
  for (const ing of allIngredients) {
    // Mark obvious supplies (foam cages, teepees, candles, ribbons) so they
    // stop counting as "unmatched" and don't pollute future matching work.
    if (isSupply(ing.ingredient_name)) {
      supplyIds.push(ing.id);
      nonIngredient++;
      continue;
    }
    const cl = classifyProductType(ing.ingredient_name);
    if (!cl || !catalogMap.has(cl.canonicalName)) { unmatched++; continue; }
    const flowerId = catalogMap.get(cl.canonicalName);
    if (!byFlower.has(flowerId)) byFlower.set(flowerId, []);
    byFlower.get(flowerId).push(ing.id);
  }

  for (const [flowerId, ids] of byFlower) {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await client.query(
      `UPDATE recipe_ingredients SET flower_id = $1, match_status = 'auto_matched', match_confidence = 0.9 WHERE id IN (${placeholders})`,
      [flowerId, ...ids]
    );
    matched += ids.length;
  }

  if (supplyIds.length > 0) {
    const batchSize = 200;
    for (let i = 0; i < supplyIds.length; i += batchSize) {
      const batch = supplyIds.slice(i, i + batchSize);
      const placeholders = batch.map((_, j) => `$${j + 1}`).join(',');
      await client.query(
        `UPDATE recipe_ingredients SET match_status = 'non_ingredient' WHERE id IN (${placeholders})`,
        batch
      );
    }
  }
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}, Non-ingredient (supplies): ${nonIngredient}`);

  // ---- Step 3: Match invoice line items to catalog ----
  console.log('\n[3/3] Matching invoice line items to catalog...');
  const { rows: lineItems } = await client.query(`
    SELECT li.id, li.description, li.unit_price, li.cost_per_stem, r.vendor_id, r.invoice_date
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
  `);

  const aliasRows = [];   // [flowerId, alias, vendorId, confidence]
  const costRows = [];    // [flowerId, vendorId, unitCost, costPer, lineItemId, invoiceDate, stemSizeCm]
  let liMatched = 0, liUnmatched = 0;

  for (const item of lineItems) {
    const cl = classifyProductType(item.description);
    if (!cl || !catalogMap.has(cl.canonicalName)) { liUnmatched++; continue; }
    const flowerId = catalogMap.get(cl.canonicalName);
    const stemSize = extractStemSize(item.description);

    aliasRows.push([flowerId, item.description, item.vendor_id, 0.9]);
    const costValue = item.cost_per_stem ?? item.unit_price;
    if (costValue != null && Number(costValue) > 0) {
      // Parse date for parsed_date column
      let parsedDate = null;
      const dateStr = item.invoice_date;
      if (dateStr) {
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) parsedDate = dateStr.substring(0, 10);
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
          const [m, d, y] = dateStr.split('/');
          parsedDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
          const [m, d, y] = dateStr.split('/');
          const fullYear = Number(y) > 50 ? `19${y}` : `20${y}`;
          parsedDate = `${fullYear}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
      }
      costRows.push([flowerId, item.vendor_id, Number(costValue), 'stem', item.id, item.invoice_date, stemSize, parsedDate]);
    }
    liMatched++;
  }

  const batchSize = 100;

  // Batch insert aliases
  for (let i = 0; i < aliasRows.length; i += batchSize) {
    const batch = aliasRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((_, j) => {
      const o = j * 4;
      values.push(...batch[j]);
      return `($${o+1},$${o+2},$${o+3},$${o+4})`;
    });
    await client.query(
      `INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES ${placeholders.join(',')} ON CONFLICT (alias, vendor_id) DO NOTHING`,
      values
    );
  }

  // Batch insert costs (with stem_size_cm)
  for (let i = 0; i < costRows.length; i += batchSize) {
    const batch = costRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((_, j) => {
      const o = j * 8;
      values.push(...batch[j]);
      return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8})`;
    });
    await client.query(
      `INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date, stem_size_cm, parsed_date) VALUES ${placeholders.join(',')}`,
      values
    );
  }

  console.log(`  Line items matched: ${liMatched}, unmatched: ${liUnmatched}`);
  console.log(`  Aliases: ${aliasRows.length}, cost records: ${costRows.length}`);

  // ---- Set is_current flag (2024+ rule) ----
  console.log('\n[4/3] Setting cost currency (2024+ rule)...');
  await client.query('ALTER TABLE ingredient_costs ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false');
  await client.query('UPDATE ingredient_costs SET is_current = false');
  const { rowCount: marked2024 } = await client.query("UPDATE ingredient_costs SET is_current = true WHERE parsed_date >= '2024-01-01'");
  const { rowCount: markedFallback } = await client.query(`
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
  console.log(`  Current: ${marked2024} rows (2024+), ${markedFallback} fallback rows`);

  // ---- Summary ----
  const { rows: [stats] } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM flower_catalog) as total,
      (SELECT COUNT(*) FROM flower_catalog WHERE category = 'flower') as flowers,
      (SELECT COUNT(*) FROM flower_catalog WHERE category = 'foliage') as foliage,
      (SELECT COUNT(DISTINCT base_type) FROM flower_catalog) as base_types,
      (SELECT COUNT(*) FROM recipe_ingredients WHERE flower_id IS NOT NULL) as ingredients_matched,
      (SELECT COUNT(*) FROM flower_aliases) as aliases,
      (SELECT COUNT(*) FROM ingredient_costs) as cost_records,
      (SELECT COUNT(*) FROM ingredient_costs WHERE stem_size_cm IS NOT NULL) as with_stem_size
  `);
  console.log(`\nDone.`);
  console.log(`  Catalog: ${stats.total} entries (${stats.flowers} flowers, ${stats.foliage} foliage) across ${stats.base_types} base types`);
  console.log(`  Recipe ingredients matched: ${stats.ingredients_matched}`);
  console.log(`  Aliases: ${stats.aliases}, cost records: ${stats.cost_records} (${stats.with_stem_size} with stem size)`);

  // Show sample color breakdown for roses
  const { rows: roseSample } = await client.query(`
    SELECT canonical_name, base_type,
      (SELECT COUNT(*) FROM ingredient_costs ic2 WHERE ic2.flower_id = fc.id) as cost_records
    FROM flower_catalog fc WHERE base_type = 'standard roses' ORDER BY canonical_name
  `);
  if (roseSample.length) {
    console.log('\n  Standard roses breakdown:');
    for (const r of roseSample) {
      console.log(`    ${r.canonical_name.padEnd(30)} ${r.cost_records} cost records`);
    }
  }

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

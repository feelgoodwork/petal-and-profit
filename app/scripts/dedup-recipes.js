/**
 * Collapse duplicate recipes.
 *
 * A duplicate is defined as: same (name, sell_price, container) AND identical
 * ingredient set (same names + quantities, order-insensitive). When a group
 * has >1 rows, keep the lowest id as the survivor; delete the other rows and
 * their children (recipe_ingredients, profitability_snapshots). Record the
 * categories the survivor spans via a new `categories` text column so we
 * don't lose the cross-PDF membership info.
 *
 * Usage:
 *   node scripts/dedup-recipes.js            # dry-run
 *   node scripts/dedup-recipes.js --apply    # commit
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const APPLY = process.argv.includes('--apply');

function ingredientFingerprint(ings) {
  // Order-insensitive: sort by (name, quantity) and hash
  const sorted = [...ings].sort((a, b) => {
    if (a.ingredient_name < b.ingredient_name) return -1;
    if (a.ingredient_name > b.ingredient_name) return 1;
    return (a.quantity ?? 0) - (b.quantity ?? 0);
  });
  const rep = sorted.map(i => `${i.ingredient_name}|${i.quantity ?? ''}|${i.is_foliage ?? 0}`).join('\n');
  return crypto.createHash('sha1').update(rep).digest('hex');
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Ensure `categories` column exists (comma-separated list of category names
  // the recipe spans across)
  await client.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS categories TEXT');

  const { rows: recipes } = await client.query(`
    SELECT r.id, r.name, r.sell_price, r.container, r.category_id, rc.name AS category_name
    FROM recipes r
    LEFT JOIN recipe_categories rc ON rc.id = r.category_id
    ORDER BY r.name, r.id
  `);

  const { rows: allIngs } = await client.query(
    'SELECT recipe_id, ingredient_name, quantity, is_foliage FROM recipe_ingredients ORDER BY recipe_id, id'
  );
  const byRecipe = new Map();
  for (const r of allIngs) {
    if (!byRecipe.has(r.recipe_id)) byRecipe.set(r.recipe_id, []);
    byRecipe.get(r.recipe_id).push(r);
  }

  // Group recipes by (name, sell_price, container, ingredient fingerprint)
  const groups = new Map();
  for (const r of recipes) {
    const ings = byRecipe.get(r.id) || [];
    const key = [
      r.name,
      Number(r.sell_price ?? 0),
      r.container ?? '',
      ingredientFingerprint(ings),
    ].join('§');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const duplicateGroups = Array.from(groups.values()).filter(g => g.length > 1);
  const victimIds = [];
  const survivors = []; // { survivorId, categories, victimIds }

  for (const g of duplicateGroups) {
    g.sort((a, b) => a.id - b.id);
    const survivor = g[0];
    const victims = g.slice(1);
    const categoryNames = Array.from(new Set(g.map(r => r.category_name).filter(Boolean))).sort();
    survivors.push({
      survivorId: survivor.id,
      name: survivor.name,
      categories: categoryNames.join(', '),
      victimIds: victims.map(v => v.id),
    });
    for (const v of victims) victimIds.push(v.id);
  }

  console.log(`Found ${duplicateGroups.length} duplicate groups, ${victimIds.length} extra rows to drop.`);
  console.log(`(Total recipes: ${recipes.length} → ${recipes.length - victimIds.length} after dedup)\n`);

  console.log('Sample groups (first 10):');
  for (const s of survivors.slice(0, 10)) {
    console.log(`  keep id=${s.survivorId}  "${s.name}"  drops [${s.victimIds.join(', ')}]  categories: ${s.categories}`);
  }

  // Check for ambiguous non-duplicates: same name but different fingerprints
  const byName = new Map();
  for (const r of recipes) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const ambiguous = [];
  for (const [name, rows] of byName) {
    if (rows.length > 1) {
      const fps = new Set(rows.map(r => {
        const ings = byRecipe.get(r.id) || [];
        return [Number(r.sell_price ?? 0), r.container ?? '', ingredientFingerprint(ings)].join('§');
      }));
      if (fps.size > 1) ambiguous.push({ name, rows });
    }
  }
  if (ambiguous.length > 0) {
    console.log(`\nSame-name groups with DIFFERENT content (NOT collapsed — look manually):`);
    for (const a of ambiguous.slice(0, 10)) {
      console.log(`  "${a.name}" — ${a.rows.length} rows: ids ${a.rows.map(r=>r.id).join(', ')}`);
    }
  }

  if (!APPLY) {
    console.log('\nDry-run. Re-run with --apply.');
    await client.end();
    return;
  }

  console.log('\nApplying…');
  await client.query('BEGIN');
  try {
    // Stamp `categories` onto survivors
    for (const s of survivors) {
      await client.query('UPDATE recipes SET categories = $1 WHERE id = $2', [s.categories, s.survivorId]);
    }

    if (victimIds.length > 0) {
      // Repoint any sales rows (and any other child FKs) from victims onto
      // the correct survivor BEFORE deleting the victim rows.
      for (const s of survivors) {
        if (s.victimIds.length === 0) continue;
        await client.query(
          'UPDATE sales SET recipe_id = $1 WHERE recipe_id = ANY($2::int[])',
          [s.survivorId, s.victimIds]
        );
      }
      await client.query('DELETE FROM profitability_snapshots WHERE recipe_id = ANY($1::int[])', [victimIds]);
      await client.query('DELETE FROM recipe_ingredients WHERE recipe_id = ANY($1::int[])', [victimIds]);
      await client.query('DELETE FROM recipes WHERE id = ANY($1::int[])', [victimIds]);
    }

    await client.query('COMMIT');
    console.log(`Deleted ${victimIds.length} duplicate rows across ${survivors.length} groups.`);
    console.log('Run rebuild-profitability.js to recompute margins.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Rolled back:', e.message);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

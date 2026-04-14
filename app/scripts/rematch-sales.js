/**
 * Match sales descriptions to recipes using tiered logic:
 *   Tier 1: Item code lookup (learned from previous matches)
 *   Tier 2: Cleaned name exact/substring match
 *   Tier 3: Cleaned name fuzzy match (Fuse.js)
 *   Tier 4: Category-stripped fuzzy match
 *
 * Usage: node scripts/rematch-sales.js [--all]
 *   Default: only matches unmatched arrangements
 *   --all: re-matches everything (clears existing matches)
 */
const { Client } = require('pg');
const Fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const REMATCH_ALL = process.argv.includes('--all');

// Suffixes/words to strip from sales descriptions before matching
const STRIP_SUFFIXES = [
  '-Standard', '-Deluxe', '-Premium', '-Luxury',
  ' Standard', ' Deluxe', ' Premium', ' Luxury',
  ' Flower Arrangement', ' Floral Arrangement',
  ' Vase Arrangement', ' Floral Design',
  ' Arrangement', ' Bouquet', ' of Flowers',
  ' Basket', ' Vase',
];

// Category prefixes to strip
const CATEGORY_PREFIXES = [
  'Door Dash ', 'DD-', 'DD ',
  'Anniversary Flowers ', 'Birthday Flowers ',
  'Get Well Flowers ', 'Sympathy Flowers ',
  "Mother's Day ", "Valentine's Day ",
  'Admin Professionals Day ', 'Back to School Flowers ',
  'Christmas ', 'Easter ', 'Fall Flowers ',
  'Halloween ', 'Hanukkah ', 'Kwanzaa ',
  'Prom Flowers ', 'Summer Flowers ',
  'Standing Sprays & Wreaths ',
  'Casket Flowers ', 'Modern/Tropical Designs ',
];

function cleanDescription(desc) {
  let cleaned = desc;
  // Remove embedded "Product:\t$XX.XX - Name" patterns (take the name after the dash)
  const productMatch = cleaned.match(/Product:\s*\$[\d.]+\s*-\s*(.+)$/);
  if (productMatch) cleaned = productMatch[1].trim();
  for (const suffix of STRIP_SUFFIXES) {
    if (cleaned.endsWith(suffix)) {
      cleaned = cleaned.substring(0, cleaned.length - suffix.length);
    }
  }
  return cleaned.replace(/[-–\s]+$/, '').trim();
}

function stripCategoryPrefix(name) {
  let stripped = name;
  for (const prefix of CATEGORY_PREFIXES) {
    if (stripped.startsWith(prefix)) {
      stripped = stripped.substring(prefix.length);
    }
  }
  return stripped;
}

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  await client.connect();

  // Load recipes
  const { rows: recipes } = await client.query('SELECT id, name FROM recipes');
  console.log('Recipes loaded:', recipes.length);

  // Build lookup structures
  const recipeByNameLower = new Map();
  const recipeStrippedNames = [];
  for (const r of recipes) {
    recipeByNameLower.set(r.name.toLowerCase(), r.id);
    const stripped = stripCategoryPrefix(r.name);
    if (stripped !== r.name) {
      recipeStrippedNames.push({ id: r.id, name: stripped });
    }
  }

  const fuse = new Fuse(recipes, { keys: ['name'], threshold: 0.3, includeScore: true });
  const allSearchable = [...recipes, ...recipeStrippedNames];
  const fuseFull = new Fuse(allSearchable, { keys: ['name'], threshold: 0.3, includeScore: true });

  // Tier 1: Build item code → recipe_id from existing confirmed matches
  const { rows: codeMatches } = await client.query(`
    SELECT item_code, recipe_id, COUNT(*) as cnt
    FROM sales
    WHERE item_code IS NOT NULL AND recipe_id IS NOT NULL AND match_tier IS NOT NULL
    GROUP BY item_code, recipe_id
    ORDER BY cnt DESC
  `);
  const codeToRecipe = new Map();
  for (const cm of codeMatches) {
    if (!codeToRecipe.has(cm.item_code)) {
      codeToRecipe.set(cm.item_code, cm.recipe_id);
    }
  }
  console.log('Item code mappings from history:', codeToRecipe.size);

  // Get sales to match
  if (REMATCH_ALL) {
    await client.query("UPDATE sales SET recipe_id = NULL, match_tier = NULL WHERE is_arrangement = true");
    console.log('Re-matching ALL arrangements...');
  }

  const { rows: sales } = await client.query(
    "SELECT id, item_code, description FROM sales WHERE is_arrangement = true AND recipe_id IS NULL"
  );
  console.log('Sales to match:', sales.length);

  const tierCounts = { code: 0, exact: 0, fuzzy: 0, category: 0, unmatched: 0 };
  const updates = [];

  for (const sale of sales) {
    let recipeId = null;
    let tier = null;

    // Tier 1: Item code lookup
    if (!recipeId && sale.item_code && codeToRecipe.has(sale.item_code)) {
      recipeId = codeToRecipe.get(sale.item_code);
      tier = 'code';
    }

    // Tier 2: Cleaned name exact/substring
    if (!recipeId) {
      const cleaned = cleanDescription(sale.description);
      const cleanedLower = cleaned.toLowerCase();

      if (recipeByNameLower.has(cleanedLower)) {
        recipeId = recipeByNameLower.get(cleanedLower);
        tier = 'exact';
      }

      if (!recipeId) {
        for (const r of recipes) {
          const rLower = r.name.toLowerCase();
          if (cleanedLower.includes(rLower) || rLower.includes(cleanedLower)) {
            recipeId = r.id;
            tier = 'exact';
            break;
          }
        }
      }

      // Try with category prefix stripped from desc
      if (!recipeId) {
        const strippedDesc = stripCategoryPrefix(cleaned).toLowerCase();
        if (strippedDesc !== cleanedLower) {
          if (recipeByNameLower.has(strippedDesc)) {
            recipeId = recipeByNameLower.get(strippedDesc);
            tier = 'exact';
          }
          if (!recipeId) {
            for (const r of recipes) {
              const rLower = r.name.toLowerCase();
              if (strippedDesc.includes(rLower) || rLower.includes(strippedDesc)) {
                recipeId = r.id;
                tier = 'exact';
                break;
              }
            }
          }
        }
      }
    }

    // Tier 3: Fuzzy match on cleaned description
    if (!recipeId) {
      const cleaned = cleanDescription(sale.description);
      const results = fuse.search(cleaned);
      if (results.length > 0 && results[0].score < 0.25) {
        recipeId = results[0].item.id;
        tier = 'fuzzy';
      }
    }

    // Tier 4: Category-stripped fuzzy match
    if (!recipeId) {
      const cleaned = cleanDescription(sale.description);
      const stripped = stripCategoryPrefix(cleaned);
      if (stripped !== cleaned) {
        const results = fuseFull.search(stripped);
        if (results.length > 0 && results[0].score < 0.25) {
          recipeId = results[0].item.id;
          tier = 'category';
        }
      }
    }

    if (recipeId) {
      updates.push([recipeId, tier, sale.id]);
      tierCounts[tier]++;
      if (sale.item_code && !codeToRecipe.has(sale.item_code)) {
        codeToRecipe.set(sale.item_code, recipeId);
      }
    } else {
      tierCounts.unmatched++;
    }
  }

  // Batch update using batched queries
  console.log('Applying ' + updates.length + ' matches...');
  const updateBatchSize = 50;
  for (let i = 0; i < updates.length; i += updateBatchSize) {
    const batch = updates.slice(i, i + updateBatchSize);
    // Build a single query with CASE statements
    const ids = batch.map(u => u[2]);
    const recipeCase = batch.map(u => `WHEN id = ${u[2]} THEN ${u[0]}`).join(' ');
    const tierCase = batch.map(u => `WHEN id = ${u[2]} THEN '${u[1]}'`).join(' ');
    await client.query(
      `UPDATE sales SET recipe_id = CASE ${recipeCase} END, match_tier = CASE ${tierCase} END WHERE id = ANY($1)`,
      [ids]
    );
    if ((i + updateBatchSize) % 2000 === 0) process.stdout.write(`  ${i + updateBatchSize}/${updates.length}\r`);
  }
  console.log('  Done.');

  // Second pass: learned code mappings
  const { rows: unmatchedWithCodes } = await client.query(
    "SELECT id, item_code FROM sales WHERE is_arrangement = true AND recipe_id IS NULL AND item_code IS NOT NULL"
  );
  const codePass2Updates = [];
  for (const s of unmatchedWithCodes) {
    if (codeToRecipe.has(s.item_code)) {
      codePass2Updates.push([codeToRecipe.get(s.item_code), 'code', s.id]);
      tierCounts.code++;
      tierCounts.unmatched--;
    }
  }
  for (let i = 0; i < codePass2Updates.length; i += 200) {
    const batch = codePass2Updates.slice(i, i + 50);
    const ids = batch.map(u => u[2]);
    const recipeCase = batch.map(u => `WHEN id = ${u[2]} THEN ${u[0]}`).join(' ');
    await client.query(
      `UPDATE sales SET recipe_id = CASE ${recipeCase} END, match_tier = 'code' WHERE id = ANY($1)`,
      [ids]
    );
  }
  const codePass2 = codePass2Updates.length;
  if (codePass2 > 0) console.log('Second pass: ' + codePass2 + ' matched by learned item codes');

  // Stats
  const { rows: stats } = await client.query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE is_arrangement)::int as arrangements,
      COUNT(*) FILTER (WHERE is_arrangement AND recipe_id IS NOT NULL)::int as matched,
      COUNT(*) FILTER (WHERE is_arrangement AND recipe_id IS NULL)::int as unmatched,
      COUNT(DISTINCT item_code) FILTER (WHERE recipe_id IS NOT NULL AND item_code IS NOT NULL)::int as codes_mapped
    FROM sales
  `);

  console.log('\n=== Results ===');
  console.log('Match tiers:');
  console.log('  Item code:', tierCounts.code);
  console.log('  Exact/substring:', tierCounts.exact);
  console.log('  Fuzzy:', tierCounts.fuzzy);
  console.log('  Category-stripped:', tierCounts.category);
  console.log('  Unmatched:', tierCounts.unmatched);
  console.log('\nOverall:');
  console.log('  Total rows:', stats[0].total);
  console.log('  Arrangements:', stats[0].arrangements);
  console.log('  Matched:', stats[0].matched, `(${(stats[0].matched / stats[0].arrangements * 100).toFixed(1)}%)`);
  console.log('  Unmatched:', stats[0].unmatched);
  console.log('  Item codes mapped:', stats[0].codes_mapped);

  const { rows: topUnmatched } = await client.query(`
    SELECT description, COUNT(*) as cnt
    FROM sales WHERE is_arrangement = true AND recipe_id IS NULL
    GROUP BY description ORDER BY cnt DESC LIMIT 20
  `);
  if (topUnmatched.length > 0) {
    console.log('\nTop 20 unmatched arrangements:');
    for (const r of topUnmatched) console.log('  (' + r.cnt + 'x) ' + r.description);
  }

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

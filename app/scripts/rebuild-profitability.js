/**
 * Recompute profitability snapshots for all recipes.
 * Uses tiered cost resolution: exact → color family → base type.
 * Usage: node scripts/rebuild-profitability.js
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const sql = neon(process.env.DATABASE_URL);

// Color family mapping (same as cost-resolver.ts)
const COLOR_FAMILY = {
  'hot pink': 'pink', 'light pink': 'pink', 'pale pink': 'pink',
  'dusty pink': 'pink', 'antique pink': 'pink',
  'deep purple': 'purple', 'dark orange': 'orange',
  'antique green': 'green', 'pale green': 'green',
  'golden yellow': 'yellow', 'deep coral': 'coral', 'pale peach': 'peach',
};

function getColorFamilyName(name) {
  for (const [mod, base] of Object.entries(COLOR_FAMILY)) {
    if (name.startsWith(mod + ' ')) return base + name.substring(mod.length);
  }
  return null;
}

function resolveFlowerCost(flowerId, costsByFlower, catalogById, catalogByName) {
  const entry = catalogById.get(flowerId);
  if (!entry) return null;

  // Tier 1: exact
  const exact = costsByFlower.get(flowerId);
  if (exact) return exact;

  // Tier 2: color family
  const familyName = getColorFamilyName(entry.canonical_name);
  if (familyName) {
    const fid = catalogByName.get(familyName);
    if (fid) { const c = costsByFlower.get(fid); if (c) return c; }
  }

  // Tier 3: base type
  if (entry.base_type && entry.base_type !== entry.canonical_name) {
    const bid = catalogByName.get(entry.base_type);
    if (bid) { const c = costsByFlower.get(bid); if (c) return c; }
  }

  return null;
}

async function main() {
  console.log('Recomputing profitability (with tiered costs)...');

  await sql`DELETE FROM profitability_snapshots`;

  const recipes = await sql`SELECT * FROM recipes`;
  console.log(`  ${recipes.length} recipes to process`);

  // Load current costs by flower_id
  const costs = await sql`SELECT flower_id, AVG(unit_cost) as avg_cost, COUNT(*) as cnt FROM ingredient_costs WHERE is_current = true GROUP BY flower_id`;
  const costsByFlower = new Map();
  for (const c of costs) {
    costsByFlower.set(Number(c.flower_id), { avg: Number(c.avg_cost), cnt: Number(c.cnt) });
  }

  // Load catalog
  const catalog = await sql`SELECT id, canonical_name, base_type FROM flower_catalog`;
  const catalogById = new Map();
  const catalogByName = new Map();
  for (const c of catalog) {
    catalogById.set(Number(c.id), { canonical_name: String(c.canonical_name), base_type: c.base_type ? String(c.base_type) : null });
    catalogByName.set(String(c.canonical_name), Number(c.id));
  }

  // Load all recipe ingredients
  const allIngredients = await sql`SELECT recipe_id, flower_id, quantity FROM recipe_ingredients`;
  const byRecipe = new Map();
  for (const ing of allIngredients) {
    if (!byRecipe.has(ing.recipe_id)) byRecipe.set(ing.recipe_id, []);
    byRecipe.get(ing.recipe_id).push(ing);
  }

  let computed = 0;
  let withCost = 0;
  let tierCounts = { exact: 0, color_family: 0, base_type: 0, missing: 0 };

  for (const recipe of recipes) {
    const ingredients = byRecipe.get(recipe.id) || [];
    let totalFlowerCost = 0;
    let missingIngredients = 0;

    for (const ing of ingredients) {
      const flowerId = ing.flower_id ? Number(ing.flower_id) : null;
      const resolved = flowerId ? resolveFlowerCost(flowerId, costsByFlower, catalogById, catalogByName) : null;

      if (resolved && resolved.cnt > 0) {
        totalFlowerCost += (Number(ing.quantity) || 1) * resolved.avg;
        // Track which tier was used
        const exact = costsByFlower.get(flowerId);
        if (exact && exact.cnt > 0) tierCounts.exact++;
        else {
          const entry = catalogById.get(flowerId);
          const familyName = entry ? getColorFamilyName(entry.canonical_name) : null;
          const familyId = familyName ? catalogByName.get(familyName) : null;
          const familyCost = familyId ? costsByFlower.get(familyId) : null;
          if (familyCost && familyCost.cnt > 0) tierCounts.color_family++;
          else tierCounts.base_type++;
        }
      } else {
        missingIngredients++;
        tierCounts.missing++;
      }
    }

    const sellPrice = Number(recipe.sell_price);
    const grossMargin = sellPrice - totalFlowerCost;
    const marginPct = totalFlowerCost > 0 ? (grossMargin / sellPrice) * 100 : null;

    await sql`
      INSERT INTO profitability_snapshots (recipe_id, sell_price, total_flower_cost, total_cost, gross_margin, margin_pct, missing_ingredients)
      VALUES (${recipe.id}, ${sellPrice}, ${totalFlowerCost}, ${totalFlowerCost}, ${grossMargin}, ${marginPct}, ${missingIngredients})
    `;

    computed++;
    if (marginPct !== null) withCost++;
  }

  const [stats] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(margin_pct) as with_margin,
      AVG(margin_pct) as avg_margin,
      MIN(margin_pct) as min_margin,
      MAX(margin_pct) as max_margin
    FROM profitability_snapshots
  `;

  console.log(`\nDone. ${computed} recipes computed, ${withCost} have full cost data`);
  console.log(`Margin range: ${Number(stats.min_margin).toFixed(1)}% - ${Number(stats.max_margin).toFixed(1)}%`);
  console.log(`Average margin: ${Number(stats.avg_margin).toFixed(1)}%`);
  console.log(`\nCost resolution tiers:`);
  console.log(`  Exact match: ${tierCounts.exact}`);
  console.log(`  Color family: ${tierCounts.color_family}`);
  console.log(`  Base type: ${tierCounts.base_type}`);
  console.log(`  Missing: ${tierCounts.missing}`);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

/**
 * Recompute profitability snapshots for all recipes.
 * Replaces POST /api/profitability (which can time out on Vercel).
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

async function main() {
  console.log('Recomputing profitability...');

  await sql`DELETE FROM profitability_snapshots`;

  const recipes = await sql`SELECT * FROM recipes`;
  console.log(`  ${recipes.length} recipes to process`);

  // Load all ingredient costs into memory to avoid per-recipe queries
  const costs = await sql`SELECT flower_id, AVG(unit_cost) as avg_cost, COUNT(*) as cnt FROM ingredient_costs GROUP BY flower_id`;
  const costMap = new Map(costs.map(c => [Number(c.flower_id), { avg: Number(c.avg_cost), cnt: Number(c.cnt) }]));

  // Load all recipe ingredients in one query
  const allIngredients = await sql`SELECT recipe_id, flower_id, quantity FROM recipe_ingredients`;
  const byRecipe = new Map();
  for (const ing of allIngredients) {
    if (!byRecipe.has(ing.recipe_id)) byRecipe.set(ing.recipe_id, []);
    byRecipe.get(ing.recipe_id).push(ing);
  }

  let computed = 0;
  let withCost = 0;

  for (const recipe of recipes) {
    const ingredients = byRecipe.get(recipe.id) || [];
    let totalFlowerCost = 0;
    let missingIngredients = 0;

    for (const ing of ingredients) {
      const cost = ing.flower_id ? costMap.get(Number(ing.flower_id)) : null;
      if (cost && cost.cnt > 0) {
        totalFlowerCost += (Number(ing.quantity) || 1) * cost.avg;
      } else {
        missingIngredients++;
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
  console.log(`Margin range: ${Number(stats.min_margin).toFixed(1)}% – ${Number(stats.max_margin).toFixed(1)}%`);
  console.log(`Average margin: ${Number(stats.avg_margin).toFixed(1)}%`);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

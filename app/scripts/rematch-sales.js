/**
 * Re-match sales to recipes using all 657 recipes.
 * Usage: node scripts/rematch-sales.js
 */
const { neon } = require('@neondatabase/serverless');
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

const sql = neon(process.env.DATABASE_URL);

async function main() {
  const recipes = await sql`SELECT id, name FROM recipes`;
  console.log('Recipes:', recipes.length);

  // Build fuzzy index
  const fuse = new Fuse(recipes, {
    keys: ['name'],
    threshold: 0.3,
    includeScore: true,
  });

  // Get unique unmatched sales descriptions
  const unmatched = await sql`
    SELECT DISTINCT description FROM sales WHERE recipe_id IS NULL
  `;
  console.log('Unmatched unique descriptions:', unmatched.length);

  let matched = 0;
  let still_unmatched = 0;

  for (const row of unmatched) {
    const desc = row.description;
    // Clean the description
    const cleaned = desc
      .replace(/[-–]/g, ' ')
      .replace(/\s*(Standard|Deluxe|Premium|Bouquet|Arrangement)\s*/gi, ' ')
      .replace(/\s*(Door Dash|DD)\s*[-–]?\s*/gi, '')
      .replace(/\s*(Floral|Vase|Basket)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Try exact substring match first
    let recipeId = null;
    for (const r of recipes) {
      const rLower = r.name.toLowerCase();
      const dLower = cleaned.toLowerCase();
      if (dLower.includes(rLower) || rLower.includes(dLower)) {
        recipeId = r.id;
        break;
      }
    }

    // Try fuzzy match
    if (!recipeId) {
      const results = fuse.search(cleaned);
      if (results.length > 0 && results[0].score < 0.25) {
        recipeId = results[0].item.id;
      }
    }

    if (recipeId) {
      await sql`UPDATE sales SET recipe_id = ${recipeId} WHERE description = ${desc} AND recipe_id IS NULL`;
      matched++;
    } else {
      still_unmatched++;
    }
  }

  console.log(`Matched: ${matched}, Still unmatched: ${still_unmatched}`);

  // Show stats
  const [stats] = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(recipe_id) as matched,
      COUNT(*) - COUNT(recipe_id) as unmatched
    FROM sales
  `;
  console.log(`\nDB totals: ${stats.total} sales, ${stats.matched} matched (${(Number(stats.matched)/Number(stats.total)*100).toFixed(1)}%), ${stats.unmatched} unmatched`);

  // Show top unmatched
  const topUnmatched = await sql`
    SELECT description, COUNT(*) as cnt
    FROM sales WHERE recipe_id IS NULL
    GROUP BY description ORDER BY COUNT(*) DESC LIMIT 15
  `;
  console.log('\nTop unmatched:');
  for (const r of topUnmatched) {
    console.log(`  ${String(r.cnt).padStart(4)}x  ${r.description}`);
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

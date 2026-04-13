/**
 * Import ALL recipe categories from PDF files into Neon.
 * Usage: node scripts/import-all-recipes.js
 */
const { neon } = require('@neondatabase/serverless');
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

const sql = neon(process.env.DATABASE_URL);
const gdrivePath = process.env.GDRIVE_DATA_PATH;

async function main() {
  const recipesDir = path.join(gdrivePath, 'recipes');
  const files = fs.readdirSync(recipesDir)
    .filter(f => f.endsWith('.pdf') && !f.includes('all-categories') && !f.includes('(1)'));

  console.log('Recipe PDFs found:', files.length);

  // Dynamic import for ESM module
  const { parseRecipePdf, getCategoryFromFilename } = await import('../src/lib/extractors/recipe-parser.ts');

  let totalRecipes = 0;
  let totalIngredients = 0;

  for (const file of files) {
    const categoryName = getCategoryFromFilename(file);
    const filePath = path.join(recipesDir, file);

    await sql`INSERT INTO recipe_categories (name, source_file) VALUES (${categoryName}, ${file}) ON CONFLICT (name) DO NOTHING`;
    const [category] = await sql`SELECT id FROM recipe_categories WHERE name = ${categoryName}`;

    console.log(`  Parsing ${categoryName}...`);
    const recipes = await parseRecipePdf(filePath, categoryName);
    let count = 0;

    for (const recipe of recipes) {
      const [existing] = await sql`SELECT id FROM recipes WHERE name = ${recipe.name} AND category_id = ${category.id}`;
      if (existing) continue;

      const [inserted] = await sql`INSERT INTO recipes (category_id, name, sell_price, container) VALUES (${category.id}, ${recipe.name}, ${recipe.sell_price}, ${recipe.container}) RETURNING id`;

      for (const ing of recipe.ingredients) {
        await sql`INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit, is_foliage) VALUES (${inserted.id}, ${ing.ingredient_name}, ${ing.quantity}, ${ing.unit}, ${ing.is_foliage ? 1 : 0})`;
        totalIngredients++;
      }

      count++;
      totalRecipes++;
    }

    console.log(`    ${count} new recipes (${recipes.length} total in PDF)`);
  }

  // Verify
  const [stats] = await sql`SELECT COUNT(*) as recipes, (SELECT COUNT(*) FROM recipe_ingredients) as ingredients, (SELECT COUNT(*) FROM recipe_categories) as categories FROM recipes`;
  console.log(`\nTotal in DB: ${stats.recipes} recipes, ${stats.ingredients} ingredients, ${stats.categories} categories`);
  console.log(`New this run: ${totalRecipes} recipes, ${totalIngredients} ingredients`);
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

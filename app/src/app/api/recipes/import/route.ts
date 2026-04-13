import { getDb, runMigrations } from '@/lib/db';
import { parseRecipePdf, getCategoryFromFilename } from '@/lib/extractors/recipe-parser';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    await runMigrations();
    const sql = getDb();

    const body = await request.json().catch(() => ({}));
    const gdrivePath = body.path || process.env.GDRIVE_DATA_PATH;
    if (!gdrivePath) {
      return Response.json({ error: 'GDRIVE_DATA_PATH not set' }, { status: 400 });
    }

    const recipesDir = path.join(gdrivePath, 'recipes');
    if (!fs.existsSync(recipesDir)) {
      return Response.json({ error: `Recipes directory not found: ${recipesDir}` }, { status: 400 });
    }

    const files = fs.readdirSync(recipesDir)
      .filter(f => f.endsWith('.pdf') && !f.includes('all-categories') && !f.includes('(1)'));

    let totalRecipes = 0;
    let totalIngredients = 0;
    const results: Array<{ category: string; recipes: number; file: string }> = [];

    const targetFiles = body.all ? files : files.filter(f => f.includes('Best Sellers'));

    for (const file of targetFiles) {
      const categoryName = getCategoryFromFilename(file);
      const filePath = path.join(recipesDir, file);

      await sql`INSERT INTO recipe_categories (name, source_file) VALUES (${categoryName}, ${file}) ON CONFLICT (name) DO NOTHING`;
      const [category] = await sql`SELECT id FROM recipe_categories WHERE name = ${categoryName}`;

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

      results.push({ category: categoryName, recipes: count, file });
    }

    return Response.json({ success: true, total_recipes: totalRecipes, total_ingredients: totalIngredients, categories: results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

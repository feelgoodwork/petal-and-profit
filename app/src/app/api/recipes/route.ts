import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const sql = await getDb();
    const recipes = await sql`
      SELECT r.*, rc.name as category_name,
        (SELECT COUNT(*) FROM recipe_ingredients WHERE recipe_id = r.id) as ingredient_count
      FROM recipes r
      JOIN recipe_categories rc ON r.category_id = rc.id
      ORDER BY rc.name, r.name
    `;
    return Response.json(recipes);
  } catch {
    return Response.json([], { status: 500 });
  }
}

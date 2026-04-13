import { getDb } from '@/lib/db';

type Row = Record<string, unknown>;

export async function GET() {
  try {
    const sql = getDb();
    const snapshots = await sql`
      SELECT ps.*, r.name as recipe_name, rc.name as category_name
      FROM profitability_snapshots ps
      JOIN recipes r ON ps.recipe_id = r.id
      JOIN recipe_categories rc ON r.category_id = rc.id
      ORDER BY ps.margin_pct DESC
    `;
    return Response.json(snapshots);
  } catch {
    return Response.json([], { status: 500 });
  }
}

export async function POST() {
  try {
    const sql = getDb();

    await sql`DELETE FROM profitability_snapshots`;

    const recipes = await sql`SELECT * FROM recipes` as Row[];
    let computed = 0;

    for (const recipe of recipes) {
      const ingredients = await sql`
        SELECT ri.*,
          (SELECT AVG(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as avg_cost,
          (SELECT COUNT(*) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as cost_count
        FROM recipe_ingredients ri
        WHERE ri.recipe_id = ${recipe.id}
      ` as Row[];

      let totalFlowerCost = 0;
      let missingIngredients = 0;

      for (const ing of ingredients) {
        if (ing.flower_id && ing.avg_cost != null && Number(ing.cost_count) > 0) {
          totalFlowerCost += (Number(ing.quantity) || 1) * Number(ing.avg_cost);
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
    }

    return Response.json({ success: true, computed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

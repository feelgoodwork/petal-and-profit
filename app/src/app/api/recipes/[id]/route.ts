import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = getDb();
    const numId = Number(id);

    const [recipe] = await sql`
      SELECT r.*, rc.name as category_name
      FROM recipes r
      JOIN recipe_categories rc ON r.category_id = rc.id
      WHERE r.id = ${numId}
    `;

    if (!recipe) {
      return Response.json({ error: 'Recipe not found' }, { status: 404 });
    }

    const ingredients = await sql`
      SELECT ri.*, fc.canonical_name,
        (SELECT AVG(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as avg_cost,
        (SELECT MIN(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as min_cost,
        (SELECT MAX(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as max_cost,
        (SELECT COUNT(*) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as cost_count
      FROM recipe_ingredients ri
      LEFT JOIN flower_catalog fc ON ri.flower_id = fc.id
      WHERE ri.recipe_id = ${numId}
      ORDER BY ri.is_foliage, ri.id
    `;

    let totalCost = 0;
    let costedIngredients = 0;
    let missingIngredients = 0;
    for (const ing of ingredients) {
      if (ing.avg_cost != null && Number(ing.cost_count) > 0) {
        totalCost += (ing.quantity || 1) * Number(ing.avg_cost);
        costedIngredients++;
      } else {
        missingIngredients++;
      }
    }

    const sellPrice = Number(recipe.sell_price);
    const grossMargin = sellPrice - totalCost;
    const marginPct = totalCost > 0 ? (grossMargin / sellPrice) * 100 : null;

    return Response.json({
      ...recipe,
      ingredients,
      cost_summary: {
        total_cost: totalCost,
        gross_margin: grossMargin,
        margin_pct: marginPct,
        costed_ingredients: costedIngredients,
        missing_ingredients: missingIngredients,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

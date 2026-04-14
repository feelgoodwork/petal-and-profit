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
      SELECT ri.*, fc.canonical_name, fc.base_type,
        (SELECT AVG(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as avg_cost,
        (SELECT MIN(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as min_cost,
        (SELECT MAX(ic.unit_cost) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as max_cost,
        (SELECT COUNT(*) FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id) as cost_count,
        (SELECT ic.unit_cost FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id ORDER BY
          CASE
            WHEN ic.invoice_date ~ '^\d{4}-\d{2}-\d{2}' THEN ic.invoice_date::date
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YYYY')
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{2}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YY')
            ELSE NULL
          END DESC NULLS LAST, ic.id DESC LIMIT 1) as latest_cost,
        (SELECT ic.invoice_date FROM ingredient_costs ic WHERE ic.flower_id = ri.flower_id ORDER BY
          CASE
            WHEN ic.invoice_date ~ '^\d{4}-\d{2}-\d{2}' THEN ic.invoice_date::date
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YYYY')
            WHEN ic.invoice_date ~ '^\d{1,2}/\d{1,2}/\d{2}$' THEN TO_DATE(ic.invoice_date, 'MM/DD/YY')
            ELSE NULL
          END DESC NULLS LAST, ic.id DESC LIMIT 1) as latest_cost_date,
        (SELECT MIN(wb.pp_price) FROM wholesale_benchmarks wb
         WHERE wb.catalog_type = fc.canonical_name
            OR wb.catalog_type = COALESCE(fc.base_type, fc.canonical_name)
        ) as pp_price
      FROM recipe_ingredients ri
      LEFT JOIN flower_catalog fc ON ri.flower_id = fc.id
      WHERE ri.recipe_id = ${numId}
      ORDER BY ri.is_foliage, ri.id
    `;

    let totalCostAvg = 0;
    let totalCostLatest = 0;
    let totalCostPp = 0;
    let costedIngredients = 0;
    let missingIngredients = 0;
    let ppCostedIngredients = 0;
    for (const ing of ingredients) {
      const qty = Number(ing.quantity) || 1;
      if (ing.avg_cost != null && Number(ing.cost_count) > 0) {
        totalCostAvg += qty * Number(ing.avg_cost);
        totalCostLatest += qty * (ing.latest_cost != null ? Number(ing.latest_cost) : Number(ing.avg_cost));
        costedIngredients++;
      } else {
        missingIngredients++;
      }
      if (ing.pp_price != null) {
        totalCostPp += qty * Number(ing.pp_price);
        ppCostedIngredients++;
      }
    }

    const sellPrice = Number(recipe.sell_price);

    return Response.json({
      ...recipe,
      ingredients,
      cost_summary: {
        total_cost: totalCostAvg,
        total_cost_latest: totalCostLatest,
        total_cost_pp: totalCostPp > 0 ? totalCostPp : null,
        gross_margin: sellPrice - totalCostAvg,
        gross_margin_latest: sellPrice - totalCostLatest,
        gross_margin_pp: totalCostPp > 0 ? sellPrice - totalCostPp : null,
        margin_pct: totalCostAvg > 0 ? ((sellPrice - totalCostAvg) / sellPrice) * 100 : null,
        margin_pct_latest: totalCostLatest > 0 ? ((sellPrice - totalCostLatest) / sellPrice) * 100 : null,
        margin_pct_pp: totalCostPp > 0 ? ((sellPrice - totalCostPp) / sellPrice) * 100 : null,
        costed_ingredients: costedIngredients,
        missing_ingredients: missingIngredients,
        pp_costed_ingredients: ppCostedIngredients,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

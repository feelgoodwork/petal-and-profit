import { getDb } from '@/lib/db';
import { loadCurrentCosts, loadCatalogIndex, resolveFlowerCost, loadPpPrices, resolvePpPrice } from '@/lib/matching/cost-resolver';
import type { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sql = await getDb();
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

    const rawIngredients = await sql`
      SELECT ri.*, fc.canonical_name, fc.base_type
      FROM recipe_ingredients ri
      LEFT JOIN flower_catalog fc ON ri.flower_id = fc.id
      WHERE ri.recipe_id = ${numId}
      ORDER BY ri.is_foliage, ri.id
    `;

    // Load costs, catalog, and PP prices for tiered resolution
    const costs = await loadCurrentCosts();
    const { byId: catalogById, byName: catalogByName } = await loadCatalogIndex();
    const { byType: ppByType, byBase: ppByBase } = await loadPpPrices();

    let totalCostAvg = 0;
    let totalCostLatest = 0;
    let totalCostPp = 0;
    let costedIngredients = 0;
    let missingIngredients = 0;
    let ppCostedIngredients = 0;

    const ingredients = rawIngredients.map(ing => {
      const qty = Number(ing.quantity) || 1;
      const flowerId = ing.flower_id ? Number(ing.flower_id) : null;

      // Resolve cost with tiered fallback
      const resolved = flowerId ? resolveFlowerCost(flowerId, costs, catalogById, catalogByName) : null;

      if (resolved) {
        totalCostAvg += qty * resolved.avg_cost;
        totalCostLatest += qty * resolved.latest_cost;
        costedIngredients++;
      } else {
        missingIngredients++;
      }

      // Resolve PP price with tiered fallback
      const pp = flowerId ? resolvePpPrice(flowerId, ppByType, ppByBase, catalogById) : null;
      if (pp) {
        totalCostPp += qty * pp.pp_price;
        ppCostedIngredients++;
      }

      return {
        ...ing,
        avg_cost: resolved?.avg_cost ?? null,
        min_cost: resolved?.min_cost ?? null,
        max_cost: resolved?.max_cost ?? null,
        cost_count: resolved?.cost_count ?? 0,
        latest_cost: resolved?.latest_cost ?? null,
        latest_cost_date: resolved?.latest_cost_date ?? null,
        cost_match_tier: resolved?.match_tier ?? null,
        cost_source_name: resolved?.source_name ?? null,
        pp_price: pp?.pp_price ?? null,
        pp_source: pp?.pp_source ?? null,
      };
    });

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

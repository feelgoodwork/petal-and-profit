import { getDb } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const priceAdjust = Number(request.nextUrl.searchParams.get('adjust') || '0');

    const recipes = await sql`
      SELECT
        r.id, r.name, r.sell_price, rc.name as category_name,
        ps.total_flower_cost, ps.margin_pct, ps.missing_ingredients
      FROM recipes r
      JOIN recipe_categories rc ON r.category_id = rc.id
      LEFT JOIN profitability_snapshots ps ON r.id = ps.recipe_id
      ORDER BY r.name
    ` as Array<Record<string, unknown>>;

    const results = recipes.map(r => {
      const sellPrice = Number(r.sell_price);
      const newSellPrice = sellPrice + priceAdjust;
      const flowerCost = r.total_flower_cost ? Number(r.total_flower_cost) : null;

      const currentMargin = flowerCost != null ? sellPrice - flowerCost : null;
      const currentMarginPct = currentMargin != null ? (currentMargin / sellPrice) * 100 : null;
      const newMargin = flowerCost != null ? newSellPrice - flowerCost : null;
      const newMarginPct = newMargin != null && newSellPrice > 0 ? (newMargin / newSellPrice) * 100 : null;

      return {
        id: r.id,
        name: r.name,
        category: r.category_name,
        current_price: sellPrice,
        new_price: newSellPrice,
        flower_cost: flowerCost,
        current_margin: currentMargin,
        current_margin_pct: currentMarginPct,
        new_margin: newMargin,
        new_margin_pct: newMarginPct,
        margin_change: newMarginPct != null && currentMarginPct != null ? newMarginPct - currentMarginPct : null,
        missing: Number(r.missing_ingredients || 0),
      };
    });

    // Summary
    const withCost = results.filter(r => r.flower_cost != null);
    const currentAvgMargin = withCost.length > 0
      ? withCost.reduce((s, r) => s + (r.current_margin_pct || 0), 0) / withCost.length : null;
    const newAvgMargin = withCost.length > 0
      ? withCost.reduce((s, r) => s + (r.new_margin_pct || 0), 0) / withCost.length : null;

    return Response.json({
      adjust: priceAdjust,
      recipes: results,
      summary: {
        current_avg_margin: currentAvgMargin,
        new_avg_margin: newAvgMargin,
        recipes_with_cost: withCost.length,
        total_recipes: results.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500 });
  }
}

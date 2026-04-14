import { getDb } from '@/lib/db';
import { rebuildCatalog, autoMatchRecipeIngredients, autoMatchLineItems } from '@/lib/matching/catalog-builder';
import { loadCatalogIndex, loadPpPrices, resolvePpPrice } from '@/lib/matching/cost-resolver';

export async function GET() {
  try {
    const sql = getDb();
    const entries = await sql`
      SELECT fc.*,
        (SELECT COUNT(*) FROM flower_aliases WHERE flower_id = fc.id) as alias_count,
        (SELECT AVG(unit_cost) FROM ingredient_costs WHERE is_current = true AND flower_id = fc.id) as avg_cost,
        (SELECT MIN(unit_cost) FROM ingredient_costs WHERE is_current = true AND flower_id = fc.id) as min_cost,
        (SELECT MAX(unit_cost) FROM ingredient_costs WHERE is_current = true AND flower_id = fc.id) as max_cost,
        (SELECT COUNT(*) FROM ingredient_costs WHERE is_current = true AND flower_id = fc.id) as cost_count,
        CASE WHEN fc.category = 'foliage' THEN 'bunch' ELSE 'stem' END as price_unit
      FROM flower_catalog fc
      ORDER BY fc.category, COALESCE(fc.base_type, fc.canonical_name), fc.canonical_name
    `;

    // Resolve PP prices with tiered fallback
    const { byId: catalogById } = await loadCatalogIndex();
    const { byType: ppByType, byBase: ppByBase } = await loadPpPrices();

    const enriched = entries.map(e => {
      const pp = resolvePpPrice(Number(e.id), ppByType, ppByBase, catalogById);
      return { ...e, pp_price: pp?.pp_price ?? null };
    });

    return Response.json(enriched);
  } catch {
    return Response.json([], { status: 500 });
  }
}

export async function POST() {
  try {
    const catalogResult = await rebuildCatalog();
    const recipeMatch = await autoMatchRecipeIngredients();
    const lineItemMatch = await autoMatchLineItems();

    return Response.json({
      success: true,
      catalog: catalogResult,
      recipe_matching: recipeMatch,
      line_item_matching: lineItemMatch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

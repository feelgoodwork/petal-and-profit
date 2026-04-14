import { getDb } from '@/lib/db';
import { loadCurrentCosts, loadCatalogIndex, resolveFlowerCost } from '@/lib/matching/cost-resolver';

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

    // Ensure P&P columns exist
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_flower_cost REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin_pct REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_missing INTEGER DEFAULT 0`;

    await sql`DELETE FROM profitability_snapshots`;

    // Load costs with tiered resolution
    const costs = await loadCurrentCosts();
    const { byId: catalogById, byName: catalogByName } = await loadCatalogIndex();

    // Load wholesale benchmarks
    const benchmarks = await sql`
      SELECT catalog_type, base_type, MIN(pp_price) as pp_price
      FROM wholesale_benchmarks
      GROUP BY catalog_type, base_type
    ` as Row[];

    const ppByType = new Map<string, number>();
    const ppByBase = new Map<string, number>();
    for (const b of benchmarks) {
      const pp = Number(b.pp_price);
      if (b.catalog_type) {
        const key = String(b.catalog_type);
        if (!ppByType.has(key) || pp < ppByType.get(key)!) ppByType.set(key, pp);
      }
      if (b.base_type) {
        const key = String(b.base_type);
        if (!ppByBase.has(key) || pp < ppByBase.get(key)!) ppByBase.set(key, pp);
      }
    }

    const recipes = await sql`SELECT * FROM recipes` as Row[];
    const allIngredients = await sql`SELECT recipe_id, flower_id, quantity FROM recipe_ingredients` as Row[];

    // Group ingredients by recipe
    const byRecipe = new Map<number, Row[]>();
    for (const ing of allIngredients) {
      const rid = Number(ing.recipe_id);
      if (!byRecipe.has(rid)) byRecipe.set(rid, []);
      byRecipe.get(rid)!.push(ing);
    }

    let computed = 0;

    for (const recipe of recipes) {
      const ingredients = byRecipe.get(Number(recipe.id)) || [];
      let totalFlowerCost = 0;
      let missingIngredients = 0;
      let ppFlowerCost = 0;
      let ppMissing = 0;

      for (const ing of ingredients) {
        const qty = Number(ing.quantity) || 1;
        const flowerId = ing.flower_id ? Number(ing.flower_id) : null;

        // Tiered cost resolution
        const resolved = flowerId ? resolveFlowerCost(flowerId, costs, catalogById, catalogByName) : null;
        if (resolved) {
          totalFlowerCost += qty * resolved.avg_cost;
        } else {
          missingIngredients++;
        }

        // P&P cost
        if (flowerId) {
          const cat = catalogById.get(flowerId);
          if (cat) {
            const ppPrice = ppByType.get(cat.canonical_name)
              ?? (cat.base_type ? ppByBase.get(cat.base_type) : undefined);
            if (ppPrice != null) {
              ppFlowerCost += qty * ppPrice;
              continue;
            }
          }
        }
        ppMissing++;
      }

      const sellPrice = Number(recipe.sell_price);
      const grossMargin = sellPrice - totalFlowerCost;
      const marginPct = totalFlowerCost > 0 ? (grossMargin / sellPrice) * 100 : null;

      const ppMargin = ppFlowerCost > 0 ? sellPrice - ppFlowerCost : null;
      const ppMarginPct = ppFlowerCost > 0 ? (ppMargin! / sellPrice) * 100 : null;

      await sql`
        INSERT INTO profitability_snapshots
          (recipe_id, sell_price, total_flower_cost, total_cost, gross_margin, margin_pct,
           missing_ingredients, pp_flower_cost, pp_margin, pp_margin_pct, pp_missing)
        VALUES (${recipe.id}, ${sellPrice}, ${totalFlowerCost}, ${totalFlowerCost},
                ${grossMargin}, ${marginPct}, ${missingIngredients},
                ${ppFlowerCost > 0 ? ppFlowerCost : null},
                ${ppMargin}, ${ppMarginPct}, ${ppMissing})
      `;
      computed++;
    }

    return Response.json({ success: true, computed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

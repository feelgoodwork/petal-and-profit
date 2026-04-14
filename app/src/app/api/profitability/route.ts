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

    // Ensure P&P columns exist
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_flower_cost REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_margin_pct REAL`;
    await sql`ALTER TABLE profitability_snapshots ADD COLUMN IF NOT EXISTS pp_missing INTEGER DEFAULT 0`;

    await sql`DELETE FROM profitability_snapshots`;

    // Load wholesale benchmarks into a lookup: catalog_type → pp_price, base_type → pp_price
    const benchmarks = await sql`
      SELECT catalog_type, base_type, unit_type,
        MIN(pp_price) as pp_price
      FROM wholesale_benchmarks
      GROUP BY catalog_type, base_type, unit_type
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

    // Load flower catalog for base_type fallback
    const catalogRows = await sql`SELECT id, canonical_name, base_type FROM flower_catalog` as Row[];
    const catalogById = new Map<number, { canonical_name: string; base_type: string | null }>();
    for (const c of catalogRows) {
      catalogById.set(Number(c.id), {
        canonical_name: String(c.canonical_name),
        base_type: c.base_type ? String(c.base_type) : null,
      });
    }

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
      let ppFlowerCost = 0;
      let ppMissing = 0;

      for (const ing of ingredients) {
        const qty = Number(ing.quantity) || 1;

        // Actual cost
        if (ing.flower_id && ing.avg_cost != null && Number(ing.cost_count) > 0) {
          totalFlowerCost += qty * Number(ing.avg_cost);
        } else {
          missingIngredients++;
        }

        // P&P cost
        if (ing.flower_id) {
          const flowerId = Number(ing.flower_id);
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

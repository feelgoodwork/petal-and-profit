import { getDb } from '@/lib/db';
import { classifyProductType, PRODUCT_TYPES } from './variety-lookup';

type Row = Record<string, unknown>;

export async function rebuildCatalog(): Promise<{ created: number; skipped: number }> {
  const sql = getDb();

  await sql`DELETE FROM flower_aliases`;
  await sql`DELETE FROM ingredient_costs`;
  await sql`UPDATE recipe_ingredients SET flower_id = NULL, match_status = 'pending', match_confidence = NULL`;
  await sql`DELETE FROM flower_catalog`;

  const ingredients = await sql`SELECT DISTINCT ingredient_name, is_foliage FROM recipe_ingredients` as Row[];

  const entries = new Map<string, { category: string; baseType: string }>();
  for (const ing of ingredients) {
    const cl = classifyProductType(String(ing.ingredient_name));
    if (!cl) continue;
    const category = ing.is_foliage ? 'foliage' : cl.category;
    entries.set(cl.canonicalName, { category, baseType: cl.baseType });
  }

  let created = 0;
  for (const [name, info] of entries) {
    await sql`
      INSERT INTO flower_catalog (canonical_name, category, base_type)
      VALUES (${name}, ${info.category}, ${info.baseType})
      ON CONFLICT (canonical_name) DO UPDATE SET base_type = EXCLUDED.base_type
    `;
    created++;
  }

  return { created, skipped: ingredients.length - created };
}

export async function autoMatchRecipeIngredients(): Promise<{ matched: number; unmatched: number }> {
  const sql = getDb();

  const catalog = await sql`SELECT id, canonical_name FROM flower_catalog` as Row[];
  const catalogMap = new Map(catalog.map(c => [String(c.canonical_name), Number(c.id)]));

  const ingredients = await sql`SELECT id, ingredient_name FROM recipe_ingredients WHERE flower_id IS NULL` as Row[];

  let matched = 0, unmatched = 0;
  const byFlower = new Map<number, number[]>();

  for (const ing of ingredients) {
    const cl = classifyProductType(String(ing.ingredient_name));
    if (!cl || !catalogMap.has(cl.canonicalName)) { unmatched++; continue; }
    const flowerId = catalogMap.get(cl.canonicalName)!;
    if (!byFlower.has(flowerId)) byFlower.set(flowerId, []);
    byFlower.get(flowerId)!.push(Number(ing.id));
  }

  for (const [flowerId, ids] of byFlower) {
    // Update one at a time to stay compatible with Neon tagged template
    for (const ingId of ids) {
      await sql`UPDATE recipe_ingredients SET flower_id = ${flowerId}, match_status = 'auto_matched', match_confidence = 0.9 WHERE id = ${ingId}`;
      matched++;
    }
  }

  return { matched, unmatched };
}

export async function autoMatchLineItems(): Promise<{ matched: number; unmatched: number; aliases_created: number }> {
  const sql = getDb();

  const catalog = await sql`SELECT id, canonical_name FROM flower_catalog` as Row[];
  const catalogMap = new Map(catalog.map(c => [String(c.canonical_name), Number(c.id)]));

  const lineItems = await sql`
    SELECT li.id, li.description, li.unit_price, li.cost_per_stem, r.vendor_id, r.invoice_date
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
  ` as Row[];

  let matched = 0, unmatched = 0, aliases_created = 0;

  for (const item of lineItems) {
    const cl = classifyProductType(String(item.description));
    if (!cl || !catalogMap.has(cl.canonicalName)) { unmatched++; continue; }

    const flowerId = catalogMap.get(cl.canonicalName)!;
    const stemSizeMatch = String(item.description).match(/\b(\d{2,3})\s*(?:cm|CM)\b/);
    const stemSizeCm = stemSizeMatch ? parseInt(stemSizeMatch[1], 10) : null;

    await sql`
      INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence)
      VALUES (${flowerId}, ${String(item.description)}, ${item.vendor_id}, 0.9)
      ON CONFLICT (alias, vendor_id) DO NOTHING
    `;
    aliases_created++;

    const costValue = (item.cost_per_stem ?? item.unit_price) as number | null;
    if (costValue != null && Number(costValue) > 0) {
      await sql`
        INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date, stem_size_cm)
        VALUES (${flowerId}, ${item.vendor_id}, ${Number(costValue)}, 'stem', ${item.id}, ${item.invoice_date}, ${stemSizeCm})
      `;
    }
    matched++;
  }

  return { matched, unmatched, aliases_created };
}

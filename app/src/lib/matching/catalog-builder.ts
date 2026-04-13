import { getDb } from '@/lib/db';
import { normalizeName } from './name-normalizer';

type Row = Record<string, unknown>;

export async function rebuildCatalog(): Promise<{ created: number; skipped: number }> {
  const sql = getDb();

  await sql`DELETE FROM flower_aliases`;
  await sql`DELETE FROM ingredient_costs`;
  await sql`UPDATE recipe_ingredients SET flower_id = NULL, match_status = 'pending', match_confidence = NULL`;
  await sql`DELETE FROM flower_catalog`;

  const ingredients = await sql`SELECT DISTINCT ingredient_name, is_foliage FROM recipe_ingredients` as Row[];

  let created = 0;
  let skipped = 0;

  for (const ing of ingredients) {
    const { productType } = normalizeName(String(ing.ingredient_name));
    if (!productType) { skipped++; continue; }

    const category = ing.is_foliage ? 'foliage' : 'flower';
    await sql`INSERT INTO flower_catalog (canonical_name, category) VALUES (${productType}, ${category}) ON CONFLICT (canonical_name) DO NOTHING`;
    created++;
  }

  return { created, skipped };
}

export async function autoMatchRecipeIngredients(): Promise<{ matched: number; unmatched: number }> {
  const sql = getDb();
  const ingredients = await sql`SELECT id, ingredient_name, is_foliage FROM recipe_ingredients WHERE flower_id IS NULL` as Row[];

  let matched = 0;
  let unmatched = 0;

  for (const ing of ingredients) {
    const { productType } = normalizeName(String(ing.ingredient_name));
    if (!productType) { unmatched++; continue; }

    const [entry] = await sql`SELECT id FROM flower_catalog WHERE canonical_name = ${productType}`;
    if (entry) {
      await sql`UPDATE recipe_ingredients SET flower_id = ${entry.id}, match_status = 'auto_matched', match_confidence = 0.9 WHERE id = ${ing.id}`;
      matched++;
    } else {
      unmatched++;
    }
  }

  return { matched, unmatched };
}

export async function autoMatchLineItems(): Promise<{ matched: number; unmatched: number; aliases_created: number }> {
  const sql = getDb();
  const lineItems = await sql`
    SELECT li.id, li.description, li.unit_price, li.cost_per_stem, li.quantity, li.price_basis, li.receipt_id, r.vendor_id, r.invoice_date
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
  ` as Row[];

  let matched = 0;
  let unmatched = 0;
  let aliases_created = 0;

  for (const item of lineItems) {
    const { productType } = normalizeName(String(item.description));
    if (!productType) { unmatched++; continue; }

    const [entry] = await sql`SELECT id FROM flower_catalog WHERE canonical_name = ${productType}`;
    if (!entry) { unmatched++; continue; }

    await sql`INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES (${entry.id}, ${item.description}, ${item.vendor_id}, 0.9) ON CONFLICT (alias, vendor_id) DO NOTHING`;
    aliases_created++;

    const costValue = item.cost_per_stem ?? item.unit_price;
    if (costValue != null && Number(costValue) > 0) {
      await sql`INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date) VALUES (${entry.id}, ${item.vendor_id}, ${costValue}, 'stem', ${item.id}, ${item.invoice_date})`;
    }

    matched++;
  }

  return { matched, unmatched, aliases_created };
}

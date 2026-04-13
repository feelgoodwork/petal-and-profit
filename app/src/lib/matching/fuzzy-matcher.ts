import Fuse from 'fuse.js';
import { getDb } from '@/lib/db';
import { normalizeName } from './name-normalizer';

interface MatchSuggestion {
  line_item_id: number;
  line_item_description: string;
  flower_id: number;
  canonical_name: string;
  confidence: number;
  product_type: string | null;
  variety: string | null;
  color: string | null;
}

export async function generateMatchSuggestions(): Promise<MatchSuggestion[]> {
  const sql = getDb();

  const catalog = await sql`SELECT id, canonical_name, category FROM flower_catalog` as Array<{ id: number; canonical_name: string; category: string }>;
  if (catalog.length === 0) return [];

  const fuse = new Fuse(catalog, {
    keys: ['canonical_name'],
    threshold: 0.4,
    includeScore: true,
  });

  const lineItems = await sql`
    SELECT li.id, li.description, r.vendor_id
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
    AND NOT EXISTS (
      SELECT 1 FROM flower_aliases fa WHERE fa.alias = li.description AND fa.vendor_id = r.vendor_id
    )
  ` as Array<{ id: number; description: string; vendor_id: number }>;

  const suggestions: MatchSuggestion[] = [];

  for (const item of lineItems) {
    const { canonicalName, variety, color } = normalizeName(item.description);

    if (canonicalName) {
      const exactMatch = catalog.find(c => c.canonical_name === canonicalName);
      if (exactMatch) {
        suggestions.push({
          line_item_id: item.id,
          line_item_description: item.description,
          flower_id: exactMatch.id,
          canonical_name: exactMatch.canonical_name,
          confidence: 1.0,
          product_type: canonicalName,
          variety,
          color,
        });
        continue;
      }
    }

    const searchTerm = canonicalName || item.description;
    const results = fuse.search(searchTerm);
    if (results.length > 0 && results[0].score !== undefined) {
      suggestions.push({
        line_item_id: item.id,
        line_item_description: item.description,
        flower_id: results[0].item.id,
        canonical_name: results[0].item.canonical_name,
        confidence: 1 - results[0].score,
        product_type: canonicalName,
        variety,
        color,
      });
    }
  }

  return suggestions;
}

export async function confirmMatch(lineItemId: number, flowerId: number, vendorId: number | null): Promise<void> {
  const sql = getDb();

  const [lineItem] = await sql`SELECT * FROM line_items WHERE id = ${lineItemId}`;
  if (!lineItem) return;

  await sql`INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES (${flowerId}, ${lineItem.description}, ${vendorId}, 1.0) ON CONFLICT (alias, vendor_id) DO NOTHING`;

  if (lineItem.unit_price != null) {
    const [receipt] = await sql`SELECT invoice_date FROM receipts WHERE id = ${lineItem.receipt_id}`;
    await sql`INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date) VALUES (${flowerId}, ${vendorId}, ${lineItem.cost_per_stem ?? lineItem.unit_price}, 'stem', ${lineItemId}, ${receipt?.invoice_date})`;
  }
}

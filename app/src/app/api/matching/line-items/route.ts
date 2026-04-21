import { getDb } from '@/lib/db';
import { classifyProductType, isSupply } from '@/lib/matching/variety-lookup';

interface CatalogRow {
  id: number;
  canonical_name: string;
  category: string;
  base_type: string | null;
}

interface LineItemRow {
  id: number;
  description: string;
  receipt_id: number;
  unit_price: number | null;
  cost_per_stem: number | null;
  receipt_file_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
}

export async function GET() {
  const sql = await getDb();

  const catalog = (await sql`
    SELECT id, canonical_name, category, base_type
    FROM flower_catalog
    ORDER BY canonical_name
  `) as unknown as CatalogRow[];

  const catalogByName = new Map(catalog.map(c => [c.canonical_name, c]));

  // Unmatched flower line items (no alias stored for this vendor yet).
  const rows = (await sql`
    SELECT
      li.id,
      li.description,
      li.receipt_id,
      li.unit_price,
      li.cost_per_stem,
      r.file_name AS receipt_file_name,
      r.invoice_number,
      r.invoice_date,
      v.name AS vendor_name
    FROM line_items li
    JOIN receipts r ON r.id = li.receipt_id
    LEFT JOIN vendors v ON v.id = r.vendor_id
    WHERE li.is_flower = 1
      AND NOT EXISTS (
        SELECT 1 FROM flower_aliases fa
        WHERE fa.alias = li.description AND fa.vendor_id = r.vendor_id
      )
    ORDER BY li.id DESC
  `) as unknown as LineItemRow[];

  // Classifier-based suggestion per row: if it classifies to a canonical that
  // exists in the catalog, surface it as the candidate match.
  const suggestions = rows.map(row => {
    const supply = isSupply(row.description);
    const cl = supply ? null : classifyProductType(row.description);
    const candidate = cl?.canonicalName ? catalogByName.get(cl.canonicalName) : null;
    return {
      id: row.id,
      description: row.description,
      receipt_id: row.receipt_id,
      receipt_file_name: row.receipt_file_name,
      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      vendor_name: row.vendor_name,
      unit_price: row.unit_price,
      cost_per_stem: row.cost_per_stem,
      suggested_flower_id: candidate?.id ?? null,
      suggested_canonical: candidate?.canonical_name ?? null,
      suggested_category: candidate?.category ?? null,
      is_supply: supply,
    };
  });

  return Response.json({ suggestions, catalog });
}

export async function POST(request: Request) {
  const sql = await getDb();
  const body = await request.json();
  const id = Number(body.line_item_id);
  if (!id) return Response.json({ error: 'line_item_id required' }, { status: 400 });

  const [item] = (await sql`
    SELECT li.id, li.description, li.unit_price, li.cost_per_stem, r.vendor_id, r.invoice_date
    FROM line_items li JOIN receipts r ON r.id = li.receipt_id
    WHERE li.id = ${id}
  `) as unknown as Array<{
    id: number; description: string; unit_price: number | null;
    cost_per_stem: number | null; vendor_id: number | null; invoice_date: string | null;
  }>;
  if (!item) return Response.json({ error: 'line item not found' }, { status: 404 });

  switch (body.action) {
    case 'confirm':
    case 'set': {
      const flowerId = Number(body.flower_id);
      await sql`
        INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence)
        VALUES (${flowerId}, ${item.description}, ${item.vendor_id}, 1.0)
        ON CONFLICT (alias, vendor_id) DO UPDATE SET flower_id = EXCLUDED.flower_id, confidence = 1.0
      `;
      const costValue = item.cost_per_stem ?? item.unit_price;
      if (costValue != null && Number(costValue) > 0) {
        await sql`
          INSERT INTO ingredient_costs
            (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date, is_current)
          VALUES
            (${flowerId}, ${item.vendor_id}, ${Number(costValue)}, 'stem', ${item.id}, ${item.invoice_date}, true)
        `;
      }
      return Response.json({ success: true });
    }
    case 'mark_non_flower': {
      await sql`UPDATE line_items SET is_flower = 0, review_status = 'reviewed' WHERE id = ${id}`;
      return Response.json({ success: true });
    }
    case 'reject': {
      await sql`UPDATE line_items SET review_status = 'rejected' WHERE id = ${id}`;
      return Response.json({ success: true });
    }
    default:
      return Response.json({ error: 'unknown action' }, { status: 400 });
  }
}

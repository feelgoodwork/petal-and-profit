import { getDb } from '@/lib/db';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const sql = await getDb();
    const body = await request.json().catch(() => ({}));
    const gdrivePath = body.path || process.env.GDRIVE_DATA_PATH;
    if (!gdrivePath) return Response.json({ error: 'GDRIVE_DATA_PATH not set' }, { status: 400 });

    // Find sales files
    const files = fs.readdirSync(gdrivePath)
      .filter(f => f.startsWith('Copy of Sales') && f.endsWith('.xlsx'))
      .sort();

    // Get all recipes for matching
    const recipes = await sql`SELECT id, name FROM recipes` as Array<{ id: number; name: string }>;

    let totalImported = 0;
    const byFile: Record<string, number> = {};

    for (const file of files) {
      const filePath = path.join(gdrivePath, file);

      // Check if already imported
      const [existing] = await sql`SELECT COUNT(*) as count FROM sales WHERE source_file = ${file}`;
      if (Number(existing.count) > 0) {
        byFile[file] = 0;
        continue;
      }

      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { defval: null }) as Array<Record<string, unknown>>;

      const keys = Object.keys(data[0] || {});
      const kDate = keys.find(k => k.includes('Order Date')) || '';
      const kOrderNum = keys.find(k => k.includes('Order Number')) || '';
      const kOccasion = keys.find(k => k.includes('Occasion')) || '';
      const kType = keys.find(k => k.includes('ordertype') || k.includes('Type')) || '';
      const kTotal = keys.find(k => k.includes('Total Amount')) || '';

      // Item columns (up to 5 items per order)
      const itemCols = [];
      for (let i = 1; i <= 5; i++) {
        const kCode = keys.find(k => k.includes(`ItemCode${i}`));
        const kQty = keys.find(k => k.includes(`QTY${i}`) || k.includes(`Qty${i}`));
        const kDesc = keys.find(k => k.includes(`Description${i}`));
        const kAmt = keys.find(k => k.includes(`Amount${i}`) && !k.includes('Ext'));
        if (kDesc) itemCols.push({ code: kCode, qty: kQty, desc: kDesc, amt: kAmt });
      }

      let fileCount = 0;
      for (const row of data) {
        // Convert Excel date serial to string
        let orderDate = row[kDate];
        if (typeof orderDate === 'number') {
          const d = XLSX.SSF.parse_date_code(orderDate);
          orderDate = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
        }

        const orderNumber = row[kOrderNum] ? String(row[kOrderNum]) : null;
        const totalAmount = row[kTotal] ? Number(row[kTotal]) : null;
        const occasion = row[kOccasion] ? String(row[kOccasion]).trim() : null;
        const orderType = row[kType] ? String(row[kType]).trim() : null;

        for (const col of itemCols) {
          const desc = col.desc ? row[col.desc] : null;
          if (!desc) continue;

          const descStr = String(desc).trim();
          const qty = col.qty && row[col.qty] ? Number(row[col.qty]) : 1;
          const amount = col.amt && row[col.amt] ? Number(row[col.amt]) : null;
          const itemCode = col.code && row[col.code] ? String(row[col.code]).trim() : null;

          // Try to match to a recipe
          const recipeId = matchSaleToRecipe(descStr, recipes);

          await sql`
            INSERT INTO sales (order_date, order_number, item_code, description, quantity, amount, total_amount, occasion, order_type, recipe_id, source_file)
            VALUES (${orderDate}, ${orderNumber}, ${itemCode}, ${descStr}, ${qty}, ${amount}, ${totalAmount}, ${occasion}, ${orderType}, ${recipeId}, ${file})
          `;
          fileCount++;
        }
      }

      byFile[file] = fileCount;
      totalImported += fileCount;
    }

    return Response.json({ success: true, total_imported: totalImported, by_file: byFile });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

function matchSaleToRecipe(description: string, recipes: Array<{ id: number; name: string }>): number | null {
  const lower = description.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();

  for (const r of recipes) {
    const recipeLower = r.name.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
    // Exact match or sale description contains recipe name
    if (lower.includes(recipeLower) || recipeLower.includes(lower)) return r.id;
    // Strip common suffixes: "Standard", "Deluxe", "Premium", "Bouquet"
    const stripped = lower.replace(/\s*(standard|deluxe|premium|bouquet|arrangement)\s*$/i, '').trim();
    if (stripped === recipeLower || recipeLower.includes(stripped) || stripped.includes(recipeLower)) return r.id;
  }

  return null;
}

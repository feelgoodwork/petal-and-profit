/**
 * Import sales data from xlsx files into Neon.
 * Usage: node scripts/import-sales.js
 */
const XLSX = require('xlsx');
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const sql = neon(process.env.DATABASE_URL);
const gdrivePath = process.env.GDRIVE_DATA_PATH;

async function main() {
  // Get recipes for matching
  const recipes = await sql`SELECT id, name FROM recipes`;
  console.log('Recipes loaded:', recipes.length);

  // Create table if needed
  await sql`CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    order_date TEXT,
    order_number TEXT,
    item_code TEXT,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    amount REAL,
    total_amount REAL,
    occasion TEXT,
    order_type TEXT,
    recipe_id INTEGER,
    source_file TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  const files = fs.readdirSync(gdrivePath)
    .filter(f => f.startsWith('Copy of Sales') && f.endsWith('.xlsx'))
    .sort();

  console.log('Sales files:', files.length);

  let totalImported = 0;

  for (const file of files) {
    // Check if already imported
    const [existing] = await sql`SELECT COUNT(*) as count FROM sales WHERE source_file = ${file}`;
    if (Number(existing.count) > 0) {
      console.log(`  ${file}: already imported, skipping`);
      continue;
    }

    const filePath = path.join(gdrivePath, file);
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: null });

    const keys = Object.keys(data[0] || {});
    const kDate = keys.find(k => k.includes('Order Date')) || '';
    const kOrderNum = keys.find(k => k.includes('Order Number')) || '';
    const kOccasion = keys.find(k => k.includes('Occasion')) || '';
    const kType = keys.find(k => k.includes('ordertype') || k.includes('Type')) || '';
    const kTotal = keys.find(k => k.includes('Total Amount')) || '';

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

        const recipeId = matchSaleToRecipe(descStr, recipes);

        await sql`
          INSERT INTO sales (order_date, order_number, item_code, description, quantity, amount, total_amount, occasion, order_type, recipe_id, source_file)
          VALUES (${orderDate}, ${orderNumber}, ${itemCode}, ${descStr}, ${qty}, ${amount}, ${totalAmount}, ${occasion}, ${orderType}, ${recipeId}, ${file})
        `;
        fileCount++;
      }
      if (fileCount % 500 === 0) process.stdout.write(`  ${file}: ${fileCount}\r`);
    }

    console.log(`  ${file}: ${fileCount} line items imported`);
    totalImported += fileCount;
  }

  console.log(`\nTotal imported: ${totalImported}`);

  // Verify
  const [stats] = await sql`SELECT COUNT(*) as c, COUNT(DISTINCT order_number) as orders, COUNT(DISTINCT recipe_id) as matched FROM sales`;
  console.log(`DB: ${stats.c} sales, ${stats.orders} orders, ${stats.matched} matched recipes`);
}

function matchSaleToRecipe(description, recipes) {
  const lower = description.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const r of recipes) {
    const recipeLower = r.name.toLowerCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
    if (lower.includes(recipeLower) || recipeLower.includes(lower)) return r.id;
    const stripped = lower.replace(/\s*(standard|deluxe|premium|bouquet|arrangement)\s*$/i, '').trim();
    if (stripped === recipeLower || recipeLower.includes(stripped) || stripped.includes(recipeLower)) return r.id;
  }
  return null;
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

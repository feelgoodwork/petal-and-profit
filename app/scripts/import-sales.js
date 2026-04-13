/**
 * Import sales data from xlsx files into Neon (batched for speed).
 * Usage: node scripts/import-sales.js
 */
const XLSX = require('xlsx');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const Fuse = require('fuse.js');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const gdrivePath = process.env.GDRIVE_DATA_PATH;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Ensure table exists with correct types
  await client.query(`CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    order_date TEXT,
    order_number TEXT,
    item_code TEXT,
    description TEXT,
    quantity REAL DEFAULT 1,
    amount REAL,
    total_amount REAL,
    occasion TEXT,
    order_type TEXT,
    recipe_id INTEGER,
    source_file TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Get recipes for matching
  const { rows: recipes } = await client.query('SELECT id, name FROM recipes');
  console.log('Recipes loaded:', recipes.length);

  const fuse = new Fuse(recipes, { keys: ['name'], threshold: 0.3, includeScore: true });

  const files = fs.readdirSync(gdrivePath)
    .filter(f => f.startsWith('Copy of Sales') && f.endsWith('.xlsx'))
    .sort();

  let totalImported = 0;

  for (const file of files) {
    const { rows: existing } = await client.query('SELECT COUNT(*) as count FROM sales WHERE source_file = $1', [file]);
    if (Number(existing[0].count) > 0) {
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

    // Build all rows first
    const allRows = [];
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
        const recipeId = matchSale(descStr, recipes, fuse);

        allRows.push([orderDate, orderNumber, itemCode, descStr, qty, amount, totalAmount, occasion, orderType, recipeId, file]);
      }
    }

    // Batch insert (100 rows at a time)
    const batchSize = 100;
    let inserted = 0;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      for (let j = 0; j < batch.length; j++) {
        const offset = j * 11;
        placeholders.push(`($${offset+1},$${offset+2},$${offset+3},$${offset+4},$${offset+5},$${offset+6},$${offset+7},$${offset+8},$${offset+9},$${offset+10},$${offset+11})`);
        values.push(...batch[j]);
      }

      await client.query(
        `INSERT INTO sales (order_date, order_number, item_code, description, quantity, amount, total_amount, occasion, order_type, recipe_id, source_file) VALUES ${placeholders.join(',')}`,
        values
      );
      inserted += batch.length;
      if (inserted % 1000 === 0) process.stdout.write(`  ${file}: ${inserted}/${allRows.length}\r`);
    }

    console.log(`  ${file}: ${allRows.length} line items imported`);
    totalImported += allRows.length;
  }

  // Verify
  const { rows: stats } = await client.query(`
    SELECT COUNT(*)::int as total, COUNT(recipe_id)::int as matched,
    COUNT(DISTINCT order_number)::int as orders FROM sales
  `);
  console.log(`\nTotal: ${stats[0].total} sales, ${stats[0].orders} orders, ${stats[0].matched} matched to recipes`);

  await client.end();
}

function matchSale(description, recipes, fuse) {
  const cleaned = description.toLowerCase()
    .replace(/[-–]/g, ' ')
    .replace(/\s*(standard|deluxe|premium|bouquet|arrangement|floral|vase|basket)\s*/gi, ' ')
    .replace(/\s*(door dash|dd)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Substring match
  for (const r of recipes) {
    const rLower = r.name.toLowerCase();
    if (cleaned.includes(rLower) || rLower.includes(cleaned)) return r.id;
  }

  // Fuzzy match
  const results = fuse.search(cleaned);
  if (results.length > 0 && results[0].score < 0.25) return results[0].item.id;

  return null;
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

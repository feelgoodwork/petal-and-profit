/**
 * Import sales data from xlsx files into Neon.
 * Parses all 5 item slots per row, captures source/occasion/item_code.
 * Matching is done separately by rematch-sales.js.
 *
 * Usage: node scripts/import-sales.js [--reimport]
 */
const XLSX = require('xlsx');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const gdrivePath = process.env.GDRIVE_DATA_PATH;
const REIMPORT = process.argv.includes('--reimport');

// Item codes that are NOT flower arrangements
const NON_ARRANGEMENT_CODES = new Set([
  'DC', 'DCSYM', 'COOL', 'LOOSE', 'ROSELOOSE', 'ROSEARR',
  'CORSAGE', 'BOUT', 'DISH-GARDEN', 'RELIGOUS',
  'TotalTip', 'Tip', 'PLUSH', 'CHOC', 'BQT', 'MYLAR',
  'UPG', 'UPG-DEL', 'UPG-PRE',
]);

// Descriptions that are non-arrangements (when no item code)
const NON_ARRANGEMENT_PATTERNS = [
  /^total\s*tip/i, /^tip\b/i, /^loose\s*wrap/i, /^balloon/i,
  /^stuff(ed)?\s*animal/i, /^chocolate/i, /^plush/i,
  /^corsage/i, /^boutonniere/i, /^dish\s*garden/i,
  /^upgrade/i, /^mylar/i, /^candle/i, /^supplies/i,
  /^cooler\s*arrangement/i, /^designer.?s?\s*choice/i,
  /^roses?\s*(arranged|loose)/i,
  /^transfer\s*order/i, /^candy/i, /^greeting\s*card/i,
  /^placement\s*fee/i, /^religious$/i, /^custom$/i,
  /^easter\s*lily$/i, /^plant\b/i, /^planter/i,
];

function isNonArrangement(code, desc) {
  if (code) {
    // Check code prefix
    for (const nc of NON_ARRANGEMENT_CODES) {
      if (code === nc || code.startsWith(nc + '-')) return true;
    }
    // Add-on patterns
    if (desc && /add\s*-?\s*on/i.test(desc)) return true;
  }
  if (desc) {
    for (const pat of NON_ARRANGEMENT_PATTERNS) {
      if (pat.test(desc)) return true;
    }
  }
  return false;
}

async function getClient() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  await client.connect();
  return client;
}

async function main() {
  let client = await getClient();

  // Ensure table has all columns
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
    source TEXT,
    is_arrangement BOOLEAN DEFAULT true,
    recipe_id INTEGER,
    match_tier TEXT,
    source_file TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  // Add columns if they don't exist (for existing tables)
  await client.query('ALTER TABLE sales ADD COLUMN IF NOT EXISTS source TEXT');
  await client.query('ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_arrangement BOOLEAN DEFAULT true');
  await client.query('ALTER TABLE sales ADD COLUMN IF NOT EXISTS match_tier TEXT');

  if (REIMPORT) {
    console.log('--reimport: clearing all sales data...');
    await client.query('DELETE FROM sales');
  }

  const files = fs.readdirSync(gdrivePath)
    .filter(f => f.startsWith('Copy of Sales') && f.endsWith('.xlsx'))
    .sort();

  let totalImported = 0;

  await client.end();

  for (const file of files) {
    // Reconnect per file to avoid Neon connection timeout
    client = await getClient();

    if (!REIMPORT) {
      const { rows: existing } = await client.query('SELECT COUNT(*) as count FROM sales WHERE source_file = $1', [file]);
      if (Number(existing[0].count) > 0) {
        console.log(`  ${file}: already imported, skipping`);
        continue;
      }
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
      // "Type" column = source (Web Order, Phone Order, etc.)
      const source = orderType;

      for (const col of itemCols) {
        const desc = col.desc ? row[col.desc] : null;
        if (!desc) continue;

        const descStr = String(desc).trim();
        if (!descStr) continue;

        const qty = col.qty && row[col.qty] ? Number(row[col.qty]) : 1;
        const amount = col.amt && row[col.amt] ? Number(row[col.amt]) : null;
        const itemCode = col.code && row[col.code] ? String(row[col.code]).trim() : null;
        const isArr = !isNonArrangement(itemCode, descStr);

        // 15 columns
        allRows.push([orderDate, orderNumber, itemCode, descStr, qty, amount, totalAmount, occasion, orderType, source, isArr, null, null, file]);
      }
    }

    // Batch insert (larger batches = fewer round trips = less likely to timeout)
    const batchSize = 500;
    let inserted = 0;
    for (let i = 0; i < allRows.length; i += batchSize) {
      const batch = allRows.slice(i, i + batchSize);
      const values = [];
      const placeholders = [];

      for (let j = 0; j < batch.length; j++) {
        const o = j * 14;
        placeholders.push(`($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12},$${o+13},$${o+14})`);
        values.push(...batch[j]);
      }

      await client.query(
        `INSERT INTO sales (order_date, order_number, item_code, description, quantity, amount, total_amount, occasion, order_type, source, is_arrangement, recipe_id, match_tier, source_file) VALUES ${placeholders.join(',')}`,
        values
      );
      inserted += batch.length;
      if (inserted % 1000 === 0) process.stdout.write(`  ${file}: ${inserted}/${allRows.length}\r`);
    }

    console.log(`  ${file}: ${allRows.length} line items imported (${allRows.filter(r => r[10]).length} arrangements, ${allRows.filter(r => !r[10]).length} non-arrangement)`);
    totalImported += allRows.length;
    await client.end();
  }

  client = await getClient();
  const { rows: stats } = await client.query(`
    SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE is_arrangement)::int as arrangements,
      COUNT(*) FILTER (WHERE NOT is_arrangement)::int as non_arr,
      COUNT(DISTINCT order_number)::int as orders
    FROM sales
  `);
  console.log(`\nTotal: ${stats[0].total} rows, ${stats[0].arrangements} arrangements, ${stats[0].non_arr} non-arrangement, ${stats[0].orders} orders`);
  console.log('\nRun rematch-sales.js to match arrangements to recipes.');

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

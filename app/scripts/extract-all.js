/**
 * Batch extraction script - runs outside Next.js for speed.
 * Usage: node scripts/extract-all.js [--limit N]
 */
const Database = require('better-sqlite3');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#][^=]*)=(.*)/);
  if (match) {
    const key = match[1].trim();
    const val = match[2].trim().replace(/^"(.*)"$/, '$1');
    process.env[key] = val;
  }
}

const db = new Database(path.join(__dirname, '..', 'data', 'petal-and-profit.db'));
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VENDOR_PROMPTS = {
  'Asiri Blooms': 'This is a scanned invoice from Asiri Blooms (Asiri LLC), a wholesale rose supplier. Look for columns: ACTIVITY, QTY, RATE, AMOUNT. Include fuel charges.',
  'CPF (Cleveland Plant & Flower)': 'This is a scanned invoice from Cleveland Plant & Flower Company (CPF). The invoice may be rotated 90 degrees. Columns: QUANTITY SOLD, U/M, ITEM NUMBER, ITEM DESCRIPTION, UNIT PRICE, DISCT %, NET PRICE, NET AMOUNT.',
  'Dreisbach': 'This is a scanned invoice from Dreisbach Wholesale Florist on yellow paper. Look for handwritten notes and credits. Columns: NO, ITEM-CODE, ITEM DESCRIPTION, UNIT, QUANTITY, PRICE, DISC, AMOUNT.',
  "Sam's Club": 'This is a Sam\'s Club order. Items show name, Qty, and total price. Calculate unit_price = total / qty. Stem counts may be in parentheses.',
  'Bill Doran': 'This is an invoice from Bill Doran Company. Columns: Mark Code, Description, Unit type, Total Units, Unit Price, Amount.',
  'default': 'This is a wholesale florist invoice. Extract all line items including flowers, supplies, taxes, fees, and delivery charges.',
};

async function extractWithVision(filePath, vendorName) {
  const pdfData = fs.readFileSync(filePath);
  const base64 = pdfData.toString('base64');
  const hint = VENDOR_PROMPTS[vendorName] || VENDOR_PROMPTS['default'];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: `${hint}\n\nExtract ALL line items and return JSON:\n{"invoice_number":"string or null","invoice_date":"MM/DD/YYYY or null","subtotal":number or null,"tax":number or null,"total":number or null,"line_items":[{"description":"string","unit_type":"stem/bunch/each or null","quantity":number or null,"unit_price":number or null,"line_total":number or null,"is_flower":true/false,"notes":"any anomalies or null"}]}\n\nReturn ONLY JSON.` }
      ]
    }]
  });

  let jsonStr = response.content[0].text.trim();
  // Strip markdown code fences
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
  return JSON.parse(jsonStr);
}

async function extractProgrammatic(filePath) {
  const { extractText } = await import('unpdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const result = await extractText(data);
  const text = result.text.join('\n');

  const invoiceNum = text.match(/INVOICE\s*#\s*(\d+)/)?.[1] || null;
  const invoiceDate = text.match(/DATE\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null;
  const subtotal = parseFloat(text.match(/SUBTOTAL\s+([\d,.]+)/)?.[1]?.replace(',', '') || '0') || null;
  const tax = parseFloat(text.match(/TAX\s+([\d,.]+)/)?.[1]?.replace(',', '') || '0');
  const totalMatch = text.match(/BALANCE DUE\s+\$?([\d,.]+)/);
  const total = totalMatch ? parseFloat(totalMatch[1].replace(',', '')) : null;

  const lines = text.split('\n');
  const headerIdx = lines.findIndex(l => /ACTIVITY\s+QTY\s+RATE\s+AMOUNT/i.test(l));
  const subtotalIdx = lines.findIndex(l => /^SUBTOTAL/i.test(l));
  const items = [];

  if (headerIdx >= 0 && subtotalIdx > headerIdx) {
    for (const line of lines.slice(headerIdx + 1, subtotalIdx)) {
      if (!line.trim()) continue;
      const match = line.match(/^(.+?)\s+(\d+)\s+([\d.]+)\s+([\d,.]+)$/);
      if (match) {
        items.push({
          description: match[1].trim(),
          quantity: parseInt(match[2]),
          unit_price: parseFloat(match[3]),
          line_total: parseFloat(match[4].replace(',', '')),
          is_flower: !/fuel|delivery|shipping|tax|handling/i.test(match[1]),
        });
      }
    }
  }

  return { invoice_number: invoiceNum, invoice_date: invoiceDate, subtotal, tax, total, line_items: items };
}

async function main() {
  const limitArg = process.argv.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 50;

  const pending = db.prepare(`
    SELECT r.id, r.file_path, r.file_name, r.extraction_method, v.name as vendor_name
    FROM receipts r JOIN vendors v ON r.vendor_id = v.id
    WHERE r.extraction_status = 'pending'
    ORDER BY r.id
    LIMIT ?
  `).all(limit);

  console.log(`Found ${pending.length} pending receipts\n`);

  const insertItem = db.prepare(`
    INSERT INTO line_items (receipt_id, line_number, description, unit_type, quantity, unit_price, line_total, is_flower, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let success = 0;
  let failed = 0;

  for (const receipt of pending) {
    const shortName = receipt.file_name.replace('Copy of ', '').substring(0, 45);
    process.stdout.write(`[${success + failed + 1}/${pending.length}] ${shortName}... `);

    try {
      let result;
      // Check if text extractable
      const { extractText } = await import('unpdf');
      const data = new Uint8Array(fs.readFileSync(receipt.file_path));
      const textResult = await extractText(data);
      const hasText = textResult.text.join('').trim().length > 50;

      if (hasText && receipt.vendor_name === 'Asiri Blooms') {
        result = await extractProgrammatic(receipt.file_path);
        process.stdout.write('[programmatic] ');
      } else {
        result = await extractWithVision(receipt.file_path, receipt.vendor_name);
        process.stdout.write('[vision] ');
      }

      // Update receipt
      db.prepare(`
        UPDATE receipts SET invoice_number = ?, invoice_date = ?, subtotal = ?, tax = ?, total = ?,
        extraction_status = 'extracted', raw_extraction = ? WHERE id = ?
      `).run(result.invoice_number, result.invoice_date, result.subtotal, result.tax, result.total, JSON.stringify(result), receipt.id);

      // Clear and insert line items
      db.prepare('DELETE FROM line_items WHERE receipt_id = ?').run(receipt.id);
      let lineNum = 1;
      for (const item of (result.line_items || [])) {
        insertItem.run(
          receipt.id, lineNum++, item.description,
          item.unit_type || null, item.quantity, item.unit_price,
          item.line_total, item.is_flower ? 1 : 0, item.notes || null
        );
      }

      console.log(`${result.line_items?.length || 0} items, $${result.total || '?'}`);
      success++;
    } catch (e) {
      console.log(`FAILED: ${e.message.substring(0, 60)}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} extracted, ${failed} failed`);

  // Show summary
  const stats = db.prepare(`
    SELECT v.name, COUNT(*) as total,
      SUM(CASE WHEN r.extraction_status != 'pending' THEN 1 ELSE 0 END) as extracted
    FROM receipts r JOIN vendors v ON r.vendor_id = v.id
    GROUP BY v.name ORDER BY v.name
  `).all();

  console.log('\nBy vendor:');
  for (const s of stats) {
    console.log(`  ${s.name}: ${s.extracted}/${s.total} extracted`);
  }
}

main().catch(console.error);

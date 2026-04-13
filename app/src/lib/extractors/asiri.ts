import fs from 'fs';

interface ExtractedLineItem {
  line_number: number;
  item_code: string | null;
  description: string;
  unit_type: string | null;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
  discount_pct: number | null;
  is_flower: number;
  notes: string | null;
}

interface ExtractionResult {
  invoice_number: string | null;
  invoice_date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  line_items: ExtractedLineItem[];
}

const NON_FLOWER_PATTERNS = [
  /fuel\s*(charge|surcharge)/i,
  /delivery\s*(fee|charge)/i,
  /shipping/i,
  /tax/i,
  /handling/i,
];

function isNonFlower(description: string): boolean {
  return NON_FLOWER_PATTERNS.some(p => p.test(description));
}

/**
 * Extract line items from an Asiri Blooms invoice PDF.
 *
 * Asiri invoices have a clean tabular format:
 *   ACTIVITY QTY RATE AMOUNT
 *   Item Name    qty   rate   amount
 *   ...
 *   SUBTOTAL  xxx
 *   TAX       xxx
 *   TOTAL     xxx
 */
export async function extractAsiri(filePath: string): Promise<ExtractionResult> {
  const { extractText } = await import('unpdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const result = await extractText(data);
  const text = (result.text as string[]).join('\n');

  // Extract invoice metadata
  const invoiceNum = text.match(/INVOICE\s*#\s*(\d+)/)?.[1] || null;
  const invoiceDate = text.match(/DATE\s+(\d{2}\/\d{2}\/\d{4})/)?.[1] || null;

  // Extract totals
  const subtotal = parseFloat(text.match(/SUBTOTAL\s+([\d,.]+)/)?.[1]?.replace(',', '') || '0') || null;
  const tax = parseFloat(text.match(/TAX\s+([\d,.]+)/)?.[1]?.replace(',', '') || '0');
  const totalMatch = text.match(/BALANCE DUE\s+\$?([\d,.]+)/);
  const total = totalMatch ? parseFloat(totalMatch[1].replace(',', '')) : null;

  // Extract line items - they appear after "ACTIVITY QTY RATE AMOUNT"
  // and before "SUBTOTAL"
  const lines = text.split('\n');
  const headerIdx = lines.findIndex(l => /^ACTIVITY\s+QTY\s+RATE\s+AMOUNT/i.test(l));
  const subtotalIdx = lines.findIndex(l => /^SUBTOTAL/i.test(l));

  const lineItems: ExtractedLineItem[] = [];

  if (headerIdx >= 0 && subtotalIdx > headerIdx) {
    const dataLines = lines.slice(headerIdx + 1, subtotalIdx);
    let lineNum = 1;

    for (const line of dataLines) {
      if (!line.trim()) continue;

      // Pattern: "Item Description    QTY    RATE    AMOUNT"
      // The numbers are at the end, description is everything before them
      const match = line.match(/^(.+?)\s+(\d+)\s+([\d.]+)\s+([\d,.]+)$/);
      if (match) {
        const description = match[1].trim();
        const quantity = parseInt(match[2], 10);
        const unitPrice = parseFloat(match[3]);
        const lineTotal = parseFloat(match[4].replace(',', ''));

        lineItems.push({
          line_number: lineNum++,
          item_code: null,
          description,
          unit_type: 'stem',
          quantity,
          unit_price: unitPrice,
          line_total: lineTotal,
          discount_pct: null,
          is_flower: isNonFlower(description) ? 0 : 1,
          notes: null,
        });
      }
    }
  }

  return {
    invoice_number: invoiceNum,
    invoice_date: invoiceDate,
    subtotal,
    tax,
    total,
    line_items: lineItems,
  };
}

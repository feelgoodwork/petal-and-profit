import Anthropic from '@anthropic-ai/sdk';
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

const VENDOR_PROMPTS: Record<string, string> = {
  'CPF (Cleveland Plant & Flower)': `This is a scanned invoice from Cleveland Plant & Flower Company (CPF).
The invoice may be rotated 90 degrees (landscape orientation, printed on dot-matrix printer).
Columns: QUANTITY SOLD, U/M (unit of measure like BU, EA, STEM), ITEM NUMBER, ITEM DESCRIPTION, UNIT PRICE, DISCT % (discount), NET PRICE, NET AMOUNT.
Some items may have 100% discount (free items) - include them but note the discount.`,

  'Dreisbach': `This is a scanned invoice from Dreisbach Wholesale Florist.
The invoice may have handwritten notes and credits.
Columns: NO, ITEM-CODE, ITEM DESCRIPTION, UNIT, QUANTITY, PRICE, DISC, AMOUNT.
Look for handwritten additions like "less credit on Acct" with amounts.
Include ADD-ONS, PACKING, POST/DEL, ALLIED SUBTOT, TAX, and TOTAL AMOUNT.`,

  "Sam's Club": `This is a Sam's Club order confirmation screenshot.
Items show: Item name (with stem count in parentheses), Qty, and total price.
IMPORTANT: Sam's Club does NOT show unit price. Calculate it: unit_price = total_price / qty.
For flower items like "Florigene Carnations (Choose from various colors; 140 or 200 stems)", the stem count is in the parenthetical.
Include ALL items, even non-flower ones like "Frito-Lay Sweet and Salty Mix".`,

  'Bill Doran': `This is an invoice from Bill Doran Company (Doran-Engel, DoranDirect).
Columns: Mark Code, Description, Unit type, Total Units, Unit Price, Amount.
The format is clean with a table grid.`,

  'default': `This is a wholesale florist invoice/receipt.
Extract all line items including flowers, supplies, taxes, fees, and delivery charges.`,
};

/**
 * Extract line items from a PDF using Claude Vision API.
 * Sends each page as an image to Claude for structured extraction.
 */
export async function extractWithVision(
  filePath: string,
  vendorName: string
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Add it to .env.local');
  }

  const client = new Anthropic({ apiKey });

  // Read PDF as base64
  const pdfData = fs.readFileSync(filePath);
  const base64 = pdfData.toString('base64');

  const vendorHint = VENDOR_PROMPTS[vendorName] || VENDOR_PROMPTS['default'];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `${vendorHint}

Extract ALL line items from this invoice and return as JSON with this exact structure:
{
  "invoice_number": "string or null",
  "invoice_date": "MM/DD/YYYY or null",
  "subtotal": number or null,
  "tax": number or null,
  "total": number or null,
  "line_items": [
    {
      "item_code": "string or null",
      "description": "string",
      "unit_type": "stem, bunch, each, etc. or null",
      "quantity": number or null,
      "unit_price": number or null,
      "line_total": number or null,
      "discount_pct": number or null,
      "is_flower": true/false,
      "notes": "any handwritten notes or anomalies, or null"
    }
  ]
}

Rules:
- Include EVERY line item: flowers, supplies, fees, taxes, delivery charges
- For flower items, is_flower = true. For fees/taxes/supplies, is_flower = false
- If unit price is missing, calculate it from quantity and total if possible
- If a value is unreadable, use null
- Return ONLY the JSON, no other text`,
          },
        ],
      },
    ],
  });

  // Parse the response
  const content = response.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  // Extract JSON from the response (might be wrapped in markdown code blocks)
  let jsonStr = content.text.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  const parsed = JSON.parse(jsonStr);

  // Map to our format
  const line_items: ExtractedLineItem[] = (parsed.line_items || []).map(
    (item: Record<string, unknown>, idx: number) => ({
      line_number: idx + 1,
      item_code: (item.item_code as string) || null,
      description: item.description as string,
      unit_type: (item.unit_type as string) || null,
      quantity: item.quantity != null ? Number(item.quantity) : null,
      unit_price: item.unit_price != null ? Number(item.unit_price) : null,
      line_total: item.line_total != null ? Number(item.line_total) : null,
      discount_pct: item.discount_pct != null ? Number(item.discount_pct) : null,
      is_flower: item.is_flower ? 1 : 0,
      notes: (item.notes as string) || null,
    })
  );

  return {
    invoice_number: parsed.invoice_number || null,
    invoice_date: parsed.invoice_date || null,
    subtotal: parsed.subtotal != null ? Number(parsed.subtotal) : null,
    tax: parsed.tax != null ? Number(parsed.tax) : null,
    total: parsed.total != null ? Number(parsed.total) : null,
    line_items,
  };
}

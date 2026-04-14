import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

interface ClassificationResult {
  description: string;
  product_type: string | null;
  is_flower: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Send unmatched line item descriptions to Claude for classification.
 * Returns classified items with product types mapped to our catalog.
 */
export async function classifyUnmatchedItems(): Promise<{
  classified: number;
  new_matches: number;
  marked_non_flower: number;
  errors: number;
}> {
  const sql = getDb();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  // Get catalog entries for the prompt
  const catalog = await sql`SELECT canonical_name, category FROM flower_catalog ORDER BY canonical_name` as Array<{ canonical_name: string; category: string }>;
  const catalogList = catalog.map(c => `${c.canonical_name} (${c.category})`).join(', ');

  // Get unique unmatched descriptions
  const unmatched = await sql`
    SELECT DISTINCT li.description
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
    AND NOT EXISTS (
      SELECT 1 FROM flower_aliases fa WHERE fa.alias = li.description AND fa.vendor_id = r.vendor_id
    )
    ORDER BY li.description
  ` as Array<{ description: string }>;

  if (unmatched.length === 0) return { classified: 0, new_matches: 0, marked_non_flower: 0, errors: 0 };

  const client = new Anthropic({ apiKey });

  // Process in batches of 100 to stay within token limits
  const batchSize = 100;
  let totalClassified = 0;
  let totalNewMatches = 0;
  let totalMarkedNonFlower = 0;
  let totalErrors = 0;

  for (let i = 0; i < unmatched.length; i += batchSize) {
    const batch = unmatched.slice(i, i + batchSize);
    const descriptions = batch.map((u, idx) => `${idx + 1}. "${u.description}"`).join('\n');

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `You are a wholesale florist industry expert. Classify each item description from a wholesale florist invoice.

Our catalog has these product types: ${catalogList}

For each item, determine:
1. Is it a flower/plant/foliage item, or a non-flower item (supplies, ribbon, containers, fees)?
2. If it's a flower/plant/foliage, which product type from our catalog does it match? Use EXACT names from the catalog above.
3. If it doesn't match any existing catalog type, suggest the best product type name.

Common wholesale abbreviations:
- ALSTR/ALASTR = alstroemeria
- CARN = carnations, MINI CARN = mini carnations
- DELPH = delphinium
- GYP/GYPS = gypsophila (baby's breath)
- HYP/HYPER = hypericum
- POM/POMP = poms (could be button poms, daisy poms, or cushion poms)
- SNAP = snapdragons
- WAX/WAXF = waxflower
- EUC = eucalyptus
- LARK = larkspur
- GLAD = gladiolus
- LIL/LILY = lilies
- MUM = chrysanthemums/mums
- SOLE/SOLID = could be various flowers in a solid color box
- RFL/RFI = likely a vendor code prefix
- GOLD = likely a vendor code prefix
- DWI/DWT SHEER = ribbon (non-flower)
- Cardettes = card holders (non-flower)
- PP = potted plant

Items with "AT NO CHARGE" are still flowers, just free/promotional.
"SOLE" followed by a flower name means a solid-color box of that flower.
"BQF" means bouquet filler.

Return JSON array:
[{"description": "exact original text", "product_type": "catalog name or null", "is_flower": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}]

Return ONLY the JSON array.

Items to classify:
${descriptions}`
        }]
      });

      let jsonStr = (response.content[0] as { text: string }).text.trim();
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
      const results: ClassificationResult[] = JSON.parse(jsonStr);

      // Process results
      for (const result of results) {
        totalClassified++;

        if (!result.is_flower) {
          // Mark as non-flower in the database
          await sql`UPDATE line_items SET is_flower = 0 WHERE description = ${result.description} AND is_flower = 1`;
          totalMarkedNonFlower++;
          continue;
        }

        if (!result.product_type) continue;

        // Check if the product type exists in our catalog
        let [catalogEntry] = await sql`SELECT id FROM flower_catalog WHERE canonical_name = ${result.product_type}`;

        // If not, create it (for new types Claude identified)
        if (!catalogEntry && result.confidence >= 0.7) {
          const category = isLikelyFoliage(result.product_type) ? 'foliage' : 'flower';
          await sql`INSERT INTO flower_catalog (canonical_name, category) VALUES (${result.product_type}, ${category}) ON CONFLICT (canonical_name) DO NOTHING`;
          [catalogEntry] = await sql`SELECT id FROM flower_catalog WHERE canonical_name = ${result.product_type}`;
        }

        if (catalogEntry && result.confidence >= 0.6) {
          // Create aliases for all line items with this description
          const lineItems = await sql`
            SELECT li.id, li.cost_per_stem, li.unit_price, r.vendor_id, r.invoice_date
            FROM line_items li
            JOIN receipts r ON li.receipt_id = r.id
            WHERE li.description = ${result.description} AND li.is_flower = 1
          ` as Array<Record<string, unknown>>;

          for (const li of lineItems) {
            await sql`INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES (${catalogEntry.id}, ${result.description}, ${li.vendor_id}, ${result.confidence}) ON CONFLICT (alias, vendor_id) DO NOTHING`;

            const costValue = li.cost_per_stem ?? li.unit_price;
            if (costValue != null && Number(costValue) > 0) {
              await sql`INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date, is_current) VALUES (${catalogEntry.id}, ${li.vendor_id}, ${costValue}, 'stem', ${li.id}, ${li.invoice_date}, true)`;
            }
          }

          totalNewMatches++;
        }
      }
    } catch (e) {
      console.error(`Batch ${i}-${i + batchSize} failed:`, (e as Error).message);
      totalErrors++;
    }
  }

  return {
    classified: totalClassified,
    new_matches: totalNewMatches,
    marked_non_flower: totalMarkedNonFlower,
    errors: totalErrors,
  };
}

function isLikelyFoliage(name: string): boolean {
  const foliageTerms = ['eucalyptus', 'fern', 'ruscus', 'pittosporum', 'salal', 'myrtle', 'leather', 'greens', 'agonis', 'aspidistra'];
  return foliageTerms.some(t => name.toLowerCase().includes(t));
}

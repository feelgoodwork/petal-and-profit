/**
 * USDA MARS API integration for wholesale flower pricing benchmarks.
 *
 * Boston Terminal Market Ornamentals report (BH_FV201)
 * Free text: https://www.ams.usda.gov/mnreports/bh_fv201.txt
 */

export interface USDAPrice {
  commodity: string;
  catalog_type: string | null;
  unit_of_sale: string;
  origin: string;
  variety: string;
  grade: string;
  low_price: number;
  high_price: number;
  mostly_price: number;
  market_condition: string;
}

// Map USDA commodity names to our catalog product types
const USDA_TO_CATALOG: Record<string, string> = {
  'alstroemeria': 'alstroemeria',
  'aster': 'aster',
  'bells of ireland': 'bells of ireland',
  'bupleurum': 'bupleurum',
  'calla': 'calla lilies',
  'carnations': 'standard carnations',
  'carnations, miniature': 'mini carnations',
  'chrysanthemums': 'daisy poms',
  'delphinium': 'delphinium',
  'eryngium': 'eryngium',
  'freesia': 'freesia',
  'gerbera': 'standard gerberas',
  'gypsophila': 'gypsophila',
  'hydrangea': 'hydrangea',
  'hypericum': 'hypericum',
  'larkspur': 'larkspur',
  'liatris': 'liatris',
  'lilies': 'asiatic lilies',
  'lisianthus': 'lisianthus',
  'orchid-dendrobium': 'orchids',
  'peony': 'peonies',
  'protea': 'protea',
  'ranunculus': 'ranunculus',
  'rose hybrid tea': 'standard roses',
  'rose spray': 'spray roses',
  'snapdragon': 'snapdragons',
  'solidago': 'solidago',
  'statice': 'statice',
  'stock': 'stock',
  'sunflower': 'sunflowers',
  'trachelium': 'trachelium',
  'tulips': 'tulips',
  'veronica': 'veronica',
  'waxflower': 'waxflower',
  'yarrow': 'yarrow',
};

/**
 * Fetch and parse the latest USDA Boston Terminal Market report.
 */
export async function fetchUSDAReport(): Promise<{ report_date: string; prices: USDAPrice[] }> {
  const url = 'https://www.ams.usda.gov/mnreports/bh_fv201.txt';
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`USDA fetch failed: ${response.status}`);

  const text = await response.text();
  return parseUSDAReport(text);
}

function parseUSDAReport(text: string): { report_date: string; prices: USDAPrice[] } {
  const prices: USDAPrice[] = [];

  // Extract report date from first line
  // "BOSTON Ornamental Terminal Prices as of 26-DEC-2023"
  const dateMatch = text.match(/as of (\d{2}-[A-Z]{3}-\d{4})/);
  const report_date = dateMatch ? parseUSDADate(dateMatch[1]) : new Date().toISOString().split('T')[0];

  // Split into commodity sections (each starts with ---)
  const sections = text.split(/^---/m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    // First line has commodity name and market condition
    // "ALSTROEMERIA: MARKET STEADY. bunched 10s CB Assorted Colors long 8.50 EC"
    const headerMatch = lines[0].match(/^([A-Z][A-Z\s,()\/]+?):\s*MARKET\s+(\w+[\s\w]*)\./);
    if (!headerMatch) continue;

    const rawCommodity = headerMatch[1].trim().toLowerCase();
    const marketCondition = headerMatch[2].trim();
    const catalogType = USDA_TO_CATALOG[rawCommodity] || null;

    // Join all lines for this section
    const fullText = lines.join(' ');

    // Parse price entries
    // Look for patterns like: "long 8.50" or "8.50-10.00 mostly 9.50"
    // Unit of sale: "per stem", "per bunch", "bunched 10s", "bunched 5s"

    // Find unit-of-sale segments
    const segments = fullText.split(/(?=per stem|per bunch|bunched \d+s)/i);

    for (const segment of segments) {
      const unitMatch = segment.match(/^(per stem|per bunch|bunched \d+s)/i);
      const unit = unitMatch ? unitMatch[1].toLowerCase() : 'unknown';

      // Find origin codes and prices
      // Pattern: ORIGIN_CODE [variety info] [grade] PRICE[-PRICE] [mostly PRICE]
      const pricePattern = /\b([A-Z]{2})\b\s+(?:([A-Za-z\s]+?)\s+)?(?:(exlong|long|med|short|40cm|50cm|60cm)\s+)?(\d+\.\d{2})(?:\s*-\s*(\d+\.\d{2}))?(?:\s+mostly\s+(\d+\.\d{2}))?/g;

      let priceMatch;
      while ((priceMatch = pricePattern.exec(segment)) !== null) {
        const origin = priceMatch[1];
        // Skip if it's not a real origin code
        if (!isOriginCode(origin)) continue;

        const variety = (priceMatch[2] || '').trim();
        const grade = priceMatch[3] || '';
        const price1 = parseFloat(priceMatch[4]);
        const price2 = priceMatch[5] ? parseFloat(priceMatch[5]) : price1;
        const mostly = priceMatch[6] ? parseFloat(priceMatch[6]) : (price1 + price2) / 2;

        prices.push({
          commodity: rawCommodity,
          catalog_type: catalogType,
          unit_of_sale: unit,
          origin,
          variety,
          grade,
          low_price: Math.min(price1, price2),
          high_price: Math.max(price1, price2),
          mostly_price: mostly,
          market_condition: marketCondition,
        });
      }
    }
  }

  return { report_date, prices };
}

function parseUSDADate(dateStr: string): string {
  // "26-DEC-2023" -> "2023-12-26"
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  };
  const parts = dateStr.split('-');
  return `${parts[2]}-${months[parts[1]] || '01'}-${parts[0]}`;
}

const ORIGIN_CODES = new Set(['CB', 'EC', 'NL', 'CR', 'CA', 'FL', 'MX', 'PE', 'CL', 'GU', 'TL', 'VN', 'HI', 'IT', 'IS', 'NZ', 'ET', 'NJ', 'CD', 'SF']);

function isOriginCode(code: string): boolean {
  return ORIGIN_CODES.has(code);
}

/**
 * Get aggregated USDA benchmark for a catalog product type.
 */
export function aggregatePricesForType(prices: USDAPrice[], productType: string): {
  low: number; high: number; mostly: number; per_stem: number | null; count: number;
} | null {
  const matches = prices.filter(p => p.catalog_type === productType);
  if (matches.length === 0) return null;

  const low = Math.min(...matches.map(m => m.low_price));
  const high = Math.max(...matches.map(m => m.high_price));
  const mostly = matches.reduce((s, m) => s + m.mostly_price, 0) / matches.length;

  // Try to find per-stem prices specifically
  const stemPrices = matches.filter(m => m.unit_of_sale === 'per stem');
  const perStem = stemPrices.length > 0
    ? stemPrices.reduce((s, m) => s + m.mostly_price, 0) / stemPrices.length
    : null;

  return { low, high, mostly, per_stem: perStem, count: matches.length };
}

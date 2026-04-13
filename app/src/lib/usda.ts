/**
 * USDA MARS API integration for wholesale flower pricing benchmarks.
 *
 * Uses the Boston Terminal Market Ornamentals report (BH_FV201)
 * which covers 50+ flower types with weekly pricing data.
 *
 * Free text report: https://www.ams.usda.gov/mnreports/bh_fv201.txt
 * API docs: https://mymarketnews.ams.usda.gov/mars-api/getting-started
 */

export interface USDAPrice {
  commodity: string;
  variety: string;
  color: string;
  origin: string;
  unit_of_sale: string;
  low_price: number;
  high_price: number;
  mostly_price: number;
  report_date: string;
}

// Map USDA commodity names to our catalog product types
const USDA_TO_CATALOG: Record<string, string> = {
  'rose hybrid tea': 'standard roses',
  'rose spray': 'spray roses',
  'carnations': 'standard carnations',
  'carnations miniature': 'mini carnations',
  'gerbera': 'standard gerberas',
  'chrysanthemums': 'daisy poms',
  'pompons': 'button poms',
  'delphinium': 'delphinium',
  'hydrangea': 'hydrangea',
  'tulips': 'tulips',
  'snapdragon': 'snapdragons',
  'stock': 'stock',
  'alstroemeria': 'alstroemeria',
  'liatris': 'liatris',
  'statice': 'statice',
  'solidago': 'solidago',
  'hypericum': 'hypericum',
  'waxflower': 'waxflower',
  'gladiolus': 'gladiolus',
  'aster': 'aster',
  'sunflower': 'sunflowers',
  'lilies': 'asiatic lilies',
  'lilies asiatic': 'asiatic lilies',
  'lilies oriental': 'oriental lilies',
  'lilies la hybrid': 'hybrid lilies',
  'gypsophila': 'gypsophila',
  'eucalyptus': 'eucalyptus',
  'ruscus': 'ruscus',
};

/**
 * Fetch the latest Boston Terminal Market ornamentals report.
 * Parses the plain-text report from USDA (no API key needed).
 */
export async function fetchUSDABenchmarks(): Promise<USDAPrice[]> {
  const url = 'https://www.ams.usda.gov/mnreports/bh_fv201.txt';
  const response = await fetch(url);
  if (!response.ok) throw new Error(`USDA fetch failed: ${response.status}`);

  const text = await response.text();
  return parseUSDAReport(text);
}

/**
 * Parse the USDA fixed-width text report into structured data.
 * The format varies but generally has commodity sections with price lines.
 */
function parseUSDAReport(text: string): USDAPrice[] {
  const prices: USDAPrice[] = [];
  const lines = text.split('\n');

  // Extract report date from header
  let reportDate = '';
  for (const line of lines.slice(0, 10)) {
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (dateMatch) { reportDate = dateMatch[1]; break; }
  }

  let currentCommodity = '';

  for (const line of lines) {
    // Commodity headers are typically all caps, short lines
    const commodityMatch = line.match(/^([A-Z][A-Z\s\/\-]+)$/);
    if (commodityMatch && line.trim().length < 40 && !line.includes('---') && !line.includes('===')) {
      currentCommodity = commodityMatch[1].trim().toLowerCase();
      continue;
    }

    if (!currentCommodity) continue;

    // Price lines typically have dollar amounts
    // Format varies but usually: description ... low-high mostly
    const priceMatch = line.match(/(\d+\.\d{2})\s*[-–]\s*(\d+\.\d{2})(?:\s+(?:mostly\s+)?(\d+\.\d{2}))?/i);
    if (priceMatch) {
      const low = parseFloat(priceMatch[1]);
      const high = parseFloat(priceMatch[2]);
      const mostly = priceMatch[3] ? parseFloat(priceMatch[3]) : (low + high) / 2;

      // Extract origin code (2 letter country codes)
      const originMatch = line.match(/\b(CB|EC|NL|CR|CA|FL|MX|PE|CL)\b/);

      // Extract variety/color info from the line
      const cleanLine = line.replace(/\d+\.\d{2}/g, '').replace(/mostly/gi, '').trim();

      prices.push({
        commodity: currentCommodity,
        variety: '',
        color: '',
        origin: originMatch?.[1] || '',
        unit_of_sale: line.toLowerCase().includes('per stem') ? 'stem' : 'bunch',
        low_price: low,
        high_price: high,
        mostly_price: mostly,
        report_date: reportDate,
      });
    }
  }

  return prices;
}

/**
 * Get USDA benchmark price for a specific catalog product type.
 * Returns the average "mostly" price from the latest report.
 */
export async function getUSDABenchmarkForType(productType: string): Promise<{
  low: number; high: number; mostly: number; report_date: string; commodity: string;
} | null> {
  const benchmarks = await fetchUSDABenchmarks();

  // Find matching USDA commodity
  for (const [usdaName, catalogType] of Object.entries(USDA_TO_CATALOG)) {
    if (catalogType === productType) {
      const matches = benchmarks.filter(b => b.commodity.includes(usdaName) || usdaName.includes(b.commodity));
      if (matches.length > 0) {
        const avgLow = matches.reduce((s, m) => s + m.low_price, 0) / matches.length;
        const avgHigh = matches.reduce((s, m) => s + m.high_price, 0) / matches.length;
        const avgMostly = matches.reduce((s, m) => s + m.mostly_price, 0) / matches.length;
        return {
          low: avgLow,
          high: avgHigh,
          mostly: avgMostly,
          report_date: matches[0].report_date,
          commodity: usdaName,
        };
      }
    }
  }

  return null;
}

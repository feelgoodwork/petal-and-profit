/**
 * FiftyFlowers.com pricing scraper.
 *
 * FiftyFlowers is a Shopify store that sells wholesale/event flowers.
 * Their pricing is retail/event (not wholesale), but serves as a
 * useful ceiling benchmark. They have a public JSON API.
 *
 * Product JSON: https://fiftyflowers.com/products/{handle}.json
 * Collection JSON: https://fiftyflowers.com/collections/{slug}/products.json
 */

export interface FiftyFlowersProduct {
  handle: string;
  title: string;
  product_type: string;
  price_per_stem: number | null;
  bunch_price: number | null;
  stems_per_bunch: number | null;
  colors: string[];
  seasons: string[];
  catalog_type: string | null;
}

// Map FiftyFlowers product_type (lowercased) to our catalog types.
// Keys must match the lowercased product_type field from Shopify exactly.
const FF_TYPE_MAP: Record<string, string> = {
  // Roses
  'roses standard':         'standard roses',
  'vd roses standard':      'standard roses',   // Valentine's Day markup — still standard roses
  'md roses standard':      'standard roses',   // Mother's Day markup
  'roses spray':            'spray roses',
  'roses sweetheart':       'spray roses',      // Sweetheart = small spray-type
  'roses garden':           'garden roses',

  // Carnations
  'carnations':             'standard carnations',
  'vd carnations vd':       'standard carnations',
  'vd carnations':          'standard carnations',
  'carnations mini':        'mini carnations',

  // Gerberas
  'gerbera daisies':        'standard gerberas',
  'gerbera':                'standard gerberas',

  // Other flowers
  'hydrangea':              'hydrangea',
  'hydrangeas':             'hydrangea',
  'tulips':                 'tulips',
  'vd tulips vd':           'tulips',
  'ranunculus':             'ranunculus',
  'peonies':                'peony',
  'dahlias':                'dahlias',
  'sunflowers':             'sunflowers',
  'delphinium':             'delphinium',
  'stock':                  'stock',
  'snapdragons':            'snapdragons',
  'alstroemeria':           'alstroemeria',
  'alstroemerias':          'alstroemeria',     // FF uses plural
  'lisianthus':             'lisianthus',
  'disbud':                 'spider mums',       // Disbud = large single-stem mum
  'pompom':                 'button poms',
  'berries':                'hypericum',         // Hypericum berries

  // Foliage
  'eucalyptus':             'eucalyptus',
  'ruscus':                 'ruscus',
  'greens':                 'greens',            // FF uses "Greens" not "Greenery"
  'greenery':               'greens',
};

// Collections to scrape
const COLLECTIONS = [
  'roses', 'spray-roses', 'garden-roses',
  'carnations', 'mini-carnations',
  'gerbera-daisies',
  'hydrangea', 'tulips', 'ranunculus', 'peonies',
  'sunflowers', 'dahlias',
  'delphinium', 'stock', 'snapdragons',
  'alstroemeria', 'lisianthus',
  'eucalyptus', 'ruscus', 'greenery',
];

/**
 * Fetch products from a FiftyFlowers collection.
 */
async function fetchCollection(slug: string): Promise<FiftyFlowersProduct[]> {
  const products: FiftyFlowersProduct[] = [];
  let page = 1;
  const limit = 30;

  while (true) {
    const url = `https://fiftyflowers.com/collections/${slug}/products.json?limit=${limit}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const data = await res.json();
    if (!data.products || data.products.length === 0) break;

    for (const p of data.products) {
      const product = parseProduct(p);
      if (product) products.push(product);
    }

    if (data.products.length < limit) break;
    page++;

    // Rate limit: ~1 req/sec
    await new Promise(r => setTimeout(r, 500));
  }

  return products;
}

function parseProduct(raw: Record<string, unknown>): FiftyFlowersProduct | null {
  const variants = raw.variants as Array<Record<string, unknown>>;
  if (!variants || variants.length === 0) return null;

  // Find the smallest bunch variant
  const cheapest = variants[0];
  const price = parseFloat(cheapest.price as string);
  if (isNaN(price)) return null;

  // Parse stems from variant title: "25 Roses (1 Bunch)" or "50 Stems"
  const title = cheapest.title as string;
  const stemMatch = title.match(/(\d[\d,]*)\s+(?:Roses|Stems|Flowers|Carnations|Tulips|Sunflowers|Hydrangea|Peonies|Dahlias|Bunches)/i);
  const stems = stemMatch ? parseInt(stemMatch[1].replace(',', ''), 10) : null;

  // Extract colors and seasons from tags (can be string or array depending on endpoint)
  const rawTags = raw.tags;
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map(String)
    : ((rawTags as string) || '').split(',').map(t => t.trim());
  const colors = tags.filter(t => t.startsWith('Colors_')).map(t => t.replace('Colors_', ''));
  const seasons = tags.filter(t => t.startsWith('Roles_')).map(t => t.replace('Roles_', ''));

  // Map product type
  const productType = ((raw.product_type as string) || '').toLowerCase();
  const catalogType = FF_TYPE_MAP[productType] || null;

  return {
    handle: raw.handle as string,
    title: raw.title as string,
    product_type: raw.product_type as string,
    price_per_stem: stems ? price / stems : null,
    bunch_price: price,
    stems_per_bunch: stems,
    colors,
    seasons,
    catalog_type: catalogType,
  };
}

/**
 * Scrape all collections and return aggregated pricing.
 */
export async function scrapeAllPricing(): Promise<{
  products: FiftyFlowersProduct[];
  by_type: Record<string, { avg_per_stem: number; min_per_stem: number; max_per_stem: number; count: number }>;
}> {
  const allProducts: FiftyFlowersProduct[] = [];

  for (const slug of COLLECTIONS) {
    const products = await fetchCollection(slug);
    allProducts.push(...products);
  }

  // Aggregate by catalog type
  const byType: Record<string, { prices: number[] }> = {};
  for (const p of allProducts) {
    if (!p.catalog_type || p.price_per_stem === null) continue;
    if (!byType[p.catalog_type]) byType[p.catalog_type] = { prices: [] };
    byType[p.catalog_type].prices.push(p.price_per_stem);
  }

  const aggregated: Record<string, { avg_per_stem: number; min_per_stem: number; max_per_stem: number; count: number }> = {};
  for (const [type, data] of Object.entries(byType)) {
    aggregated[type] = {
      avg_per_stem: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
      min_per_stem: Math.min(...data.prices),
      max_per_stem: Math.max(...data.prices),
      count: data.prices.length,
    };
  }

  return { products: allProducts, by_type: aggregated };
}

/**
 * Quick fetch of a single collection for testing.
 */
export async function fetchCollectionPricing(slug: string): Promise<FiftyFlowersProduct[]> {
  return fetchCollection(slug);
}

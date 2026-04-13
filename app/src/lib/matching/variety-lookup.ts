/**
 * Variety-to-type lookup table.
 *
 * Maps specific rose/flower variety names (as seen on invoices)
 * to their product type and typical color.
 *
 * This is institutional knowledge about the wholesale flower industry.
 */

export interface VarietyInfo {
  type: string;       // product type: "standard roses", "spray roses", etc.
  color: string;      // typical color
  notes?: string;
}

// Rose varieties (these are all standard single-stem roses unless noted)
export const ROSE_VARIETIES: Record<string, VarietyInfo> = {
  'freedom':        { type: 'standard roses', color: 'red' },
  'explorer':       { type: 'standard roses', color: 'red' },
  'cherry o':       { type: 'standard roses', color: 'red' },
  'hearts':         { type: 'standard roses', color: 'red' },
  'mondial':        { type: 'standard roses', color: 'white' },
  'akito':          { type: 'standard roses', color: 'white' },
  'tibet':          { type: 'standard roses', color: 'white' },
  'vendela':        { type: 'standard roses', color: 'cream/ivory' },
  'rosita vendela': { type: 'standard roses', color: 'cream/ivory' },
  'sahara':         { type: 'standard roses', color: 'cream/sand' },
  'brighton':       { type: 'standard roses', color: 'peach' },
  'tara':           { type: 'standard roses', color: 'peach' },
  'shimmer':        { type: 'standard roses', color: 'peach/light pink' },
  'nena':           { type: 'standard roses', color: 'light pink' },
  'nina':           { type: 'standard roses', color: 'light pink' },
  'pink martini':   { type: 'standard roses', color: 'pink' },
  'señorita':       { type: 'standard roses', color: 'pink' },
  'senorita':       { type: 'standard roses', color: 'pink' },
  'deep purple':    { type: 'standard roses', color: 'deep purple' },
  'ocean song':     { type: 'standard roses', color: 'lavender' },
  'polo':           { type: 'standard roses', color: 'lavender' },
  'proud':          { type: 'standard roses', color: 'hot pink' },
  'gotcha':         { type: 'standard roses', color: 'hot pink' },
  'pink floyd':     { type: 'standard roses', color: 'hot pink' },
  'high & flame':   { type: 'standard roses', color: 'orange/yellow bicolor' },
  'high magic':     { type: 'standard roses', color: 'orange/yellow bicolor' },
  'free spirit':    { type: 'standard roses', color: 'coral/peach' },
  'coffee break':   { type: 'standard roses', color: 'copper/brown' },
  'orange crush':   { type: 'standard roses', color: 'orange' },
  'iguana':         { type: 'standard roses', color: 'green' },
  'country blues':  { type: 'standard roses', color: 'lavender/blue' },
  'confidential':   { type: 'standard roses', color: 'red' },
  'deja vu':        { type: 'standard roses', color: 'dusty pink' },
  'creme de la creme': { type: 'standard roses', color: 'cream' },
  'new yellow':     { type: 'standard roses', color: 'yellow' },
  'tiffany':        { type: 'standard roses', color: 'peach/pink' },
  'faith':          { type: 'standard roses', color: 'peach' },
  'engagement':     { type: 'standard roses', color: 'pink' },
  'cancun':         { type: 'standard roses', color: 'orange/hot pink' },
  'mother of pearl': { type: 'standard roses', color: 'light pink' },
  'vintage pink':   { type: 'standard roses', color: 'antique pink' },
  'secret garden':  { type: 'standard roses', color: 'pink blend' },
  'tycoon':         { type: 'standard roses', color: 'red' },
  'malibu':         { type: 'standard roses', color: 'pink' },
};

/**
 * Product type definitions.
 * Maps the canonical product type to its broader category.
 */
export const PRODUCT_TYPES: Record<string, { category: string; searchTerms: string[] }> = {
  // Roses
  'standard roses':           { category: 'roses', searchTerms: ['rose', 'roses'] },
  'spray roses':              { category: 'roses', searchTerms: ['spray rose', 'spray roses'] },
  'miniature spray roses':    { category: 'roses', searchTerms: ['miniature spray', 'mini spray'] },
  'garden roses':             { category: 'roses', searchTerms: ['garden rose', 'garden roses'] },

  // Carnations
  'standard carnations':      { category: 'carnations', searchTerms: ['carnation', 'carnations'] },
  'mini carnations':          { category: 'carnations', searchTerms: ['mini carnation', 'mini carn'] },

  // Gerberas
  'standard gerberas':        { category: 'gerberas', searchTerms: ['gerbera', 'gerberas', 'gerber'] },
  'mini gerberas':            { category: 'gerberas', searchTerms: ['mini gerbera', 'germini'] },

  // Lilies
  'asiatic lilies':           { category: 'lilies', searchTerms: ['asiatic lil'] },
  'oriental lilies':          { category: 'lilies', searchTerms: ['oriental lil', 'casablanca', 'sorbonne', 'stargazer'] },
  'hybrid lilies':            { category: 'lilies', searchTerms: ['hybrid lil'] },
  'calla lilies':             { category: 'lilies', searchTerms: ['calla'] },

  // Poms/Mums
  'button poms':              { category: 'poms', searchTerms: ['button pom', 'kermit'] },
  'daisy poms':               { category: 'poms', searchTerms: ['daisy pom', 'daisy mum'] },
  'spider mums':              { category: 'poms', searchTerms: ['spider mum', 'fuji'] },
  'cushion poms':             { category: 'poms', searchTerms: ['cushion pom', 'pomp'] },

  // Other flowers
  'delphinium':               { category: 'delphinium', searchTerms: ['delphinium', 'delphinum', 'delph'] },
  'hydrangea':                { category: 'hydrangea', searchTerms: ['hydrangea', 'hydra'] },
  'tulips':                   { category: 'tulips', searchTerms: ['tulip'] },
  'snapdragons':              { category: 'snapdragons', searchTerms: ['snapdragon'] },
  'stock':                    { category: 'stock', searchTerms: ['stock'] },
  'alstroemeria':             { category: 'alstroemeria', searchTerms: ['alstroemeria', 'alastr'] },
  'liatris':                  { category: 'liatris', searchTerms: ['liatris', 'liatrice'] },
  'statice':                  { category: 'statice', searchTerms: ['statice', 'sinuata'] },
  'solidago':                 { category: 'solidago', searchTerms: ['solidago'] },
  'hypericum':                { category: 'hypericum', searchTerms: ['hypericum'] },
  'waxflower':                { category: 'waxflower', searchTerms: ['waxflower'] },
  'gladiolus':                { category: 'gladiolus', searchTerms: ['gladiolus', 'glads'] },
  'limonium':                 { category: 'limonium', searchTerms: ['limonium', 'caspia'] },
  'aster':                    { category: 'aster', searchTerms: ['aster', 'monte casino'] },
  'barronia':                 { category: 'barronia', searchTerms: ['barronia', 'boronia'] },

  // Foliage
  'eucalyptus':               { category: 'foliage', searchTerms: ['eucalyptus', 'eucal'] },
  'pittosporum':              { category: 'foliage', searchTerms: ['pittosporum'] },
  'ruscus':                   { category: 'foliage', searchTerms: ['ruscus'] },
  'leather leaf':             { category: 'foliage', searchTerms: ['leather leaf', 'leather'] },
  'salal':                    { category: 'foliage', searchTerms: ['salal'] },
  'myrtle':                   { category: 'foliage', searchTerms: ['myrtle'] },
  'sprengeri':                { category: 'foliage', searchTerms: ['sprengeri', 'springeri'] },
  'tree fern':                { category: 'foliage', searchTerms: ['tree fern'] },
  'ming fern':                { category: 'foliage', searchTerms: ['ming fern'] },

  // Greenery
  'greens':                   { category: 'greens', searchTerms: ['greens', 'green', 'pine', 'cedar'] },
};

/**
 * Look up a rose variety name and get its product type + color.
 */
export function lookupVariety(description: string): VarietyInfo | null {
  const lower = description.toLowerCase();
  // Sort by length descending so "rosita vendela" matches before "vendela"
  const sorted = Object.entries(ROSE_VARIETIES).sort((a, b) => b[0].length - a[0].length);
  for (const [variety, info] of sorted) {
    if (lower.includes(variety)) return { ...info, notes: `variety: ${variety}` };
  }
  return null;
}

/**
 * Determine the product type from a description.
 * Returns the most specific match.
 */
export function classifyProductType(description: string): { type: string; color: string | null; variety: string | null } | null {
  const lower = description.toLowerCase();

  // First check rose varieties (most specific)
  const variety = lookupVariety(description);
  if (variety) {
    return { type: variety.type, color: variety.color, variety: variety.notes?.replace('variety: ', '') || null };
  }

  // Check for spray/miniature roses specifically before generic roses
  if (/miniature spray|mini spray/i.test(lower)) {
    return { type: 'miniature spray roses', color: extractColor(lower), variety: null };
  }
  if (/spray\s*rose/i.test(lower)) {
    return { type: 'spray roses', color: extractColor(lower), variety: null };
  }
  if (/garden\s*rose/i.test(lower)) {
    return { type: 'garden roses', color: extractColor(lower), variety: null };
  }

  // Check for mini carnations before standard
  if (/mini\s*carn/i.test(lower) || /mint\s*carn/i.test(lower) || /minicum/i.test(lower)) {
    return { type: 'mini carnations', color: extractColor(lower), variety: null };
  }

  // Mini gerberas
  if (/mini\s*gerb|germini/i.test(lower)) {
    return { type: 'mini gerberas', color: extractColor(lower), variety: null };
  }

  // Specific lily types
  if (/asiatic/i.test(lower)) return { type: 'asiatic lilies', color: extractColor(lower), variety: null };
  if (/casablanca|oriental|stargazer/i.test(lower)) return { type: 'oriental lilies', color: extractColor(lower), variety: null };
  if (/sorbonne/i.test(lower)) return { type: 'oriental lilies', color: 'pink', variety: 'sorbonne' };
  if (/hybrid\s*lil/i.test(lower)) return { type: 'hybrid lilies', color: extractColor(lower), variety: null };
  if (/calla/i.test(lower)) return { type: 'calla lilies', color: extractColor(lower), variety: null };

  // Pom types
  if (/button\s*pom|kermit/i.test(lower)) return { type: 'button poms', color: extractColor(lower), variety: null };
  if (/daisy\s*(pom|mum)/i.test(lower)) return { type: 'daisy poms', color: extractColor(lower), variety: null };
  if (/spider\s*mum|fuji/i.test(lower)) return { type: 'spider mums', color: extractColor(lower), variety: null };

  // Now check broader product types (longer search terms first)
  const sortedTypes = Object.entries(PRODUCT_TYPES)
    .sort((a, b) => {
      const aMax = Math.max(...a[1].searchTerms.map(t => t.length));
      const bMax = Math.max(...b[1].searchTerms.map(t => t.length));
      return bMax - aMax;
    });

  for (const [type, info] of sortedTypes) {
    for (const term of info.searchTerms) {
      if (lower.includes(term)) {
        return { type, color: extractColor(lower), variety: null };
      }
    }
  }

  return null;
}

const COLORS = [
  'hot pink', 'light pink', 'pale pink', 'dusty pink', 'antique pink',
  'deep purple', 'dark orange', 'deep coral', 'lime-green', 'lime green',
  'apple-green', 'golden yellow', 'antique green', 'pale green',
  'pale peach',
  'red', 'white', 'pink', 'yellow', 'orange', 'purple', 'lavender',
  'blue', 'fuchsia', 'coral', 'peach', 'green', 'ivory', 'copper',
  'bronze', 'burgundy', 'rust', 'cream', 'black',
];

function extractColor(text: string): string | null {
  const lower = text.toLowerCase();
  for (const color of COLORS) {
    if (lower.includes(color)) return color;
  }
  return null;
}

/**
 * Variety-to-type lookup + color-aware canonical name builder.
 *
 * Canonical name format:
 *   - Color known:   "{color} {simplified_type}"  e.g. "red roses", "blue delphinium"
 *   - Color unknown: "{base_type}"                e.g. "standard roses", "delphinium"
 *
 * "Simplified type" drops the word "standard" for commodity flowers where
 * color is the meaningful differentiator (roses, carnations, gerberas).
 * Other types keep their full name (spray roses, garden roses, asiatic lilies, etc.)
 */

export interface VarietyInfo {
  type: string;   // base product type: "standard roses", "spray roses", etc.
  color: string;
  notes?: string;
}

export const ROSE_VARIETIES: Record<string, VarietyInfo> = {
  'freedom':           { type: 'standard roses', color: 'red' },
  'explorer':          { type: 'standard roses', color: 'red' },
  'cherry o':          { type: 'standard roses', color: 'red' },
  'hearts':            { type: 'standard roses', color: 'red' },
  'tycoon':            { type: 'standard roses', color: 'red' },
  'confidential':      { type: 'standard roses', color: 'red' },
  'mondial':           { type: 'standard roses', color: 'white' },
  'akito':             { type: 'standard roses', color: 'white' },
  'tibet':             { type: 'standard roses', color: 'white' },
  'vendela':           { type: 'standard roses', color: 'cream' },
  'rosita vendela':    { type: 'standard roses', color: 'cream' },
  'sahara':            { type: 'standard roses', color: 'cream' },
  'creme de la creme': { type: 'standard roses', color: 'cream' },
  'brighton':          { type: 'standard roses', color: 'peach' },
  'tara':              { type: 'standard roses', color: 'peach' },
  'faith':             { type: 'standard roses', color: 'peach' },
  'tiffany':           { type: 'standard roses', color: 'peach' },
  'shimmer':           { type: 'standard roses', color: 'light pink' },
  'nena':              { type: 'standard roses', color: 'light pink' },
  'nina':              { type: 'standard roses', color: 'light pink' },
  'mother of pearl':   { type: 'standard roses', color: 'light pink' },
  'pink martini':      { type: 'standard roses', color: 'pink' },
  'senorita':          { type: 'standard roses', color: 'pink' },
  'señorita':          { type: 'standard roses', color: 'pink' },
  'engagement':        { type: 'standard roses', color: 'pink' },
  'vintage pink':      { type: 'standard roses', color: 'pink' },
  'secret garden':     { type: 'standard roses', color: 'pink' },
  'deja vu':           { type: 'standard roses', color: 'pink' },
  'deep purple':       { type: 'standard roses', color: 'purple' },
  'ocean song':        { type: 'standard roses', color: 'lavender' },
  'polo':              { type: 'standard roses', color: 'lavender' },
  'country blues':     { type: 'standard roses', color: 'lavender' },
  'proud':             { type: 'standard roses', color: 'hot pink' },
  'gotcha':            { type: 'standard roses', color: 'hot pink' },
  'pink floyd':        { type: 'standard roses', color: 'hot pink' },
  'cancun':            { type: 'standard roses', color: 'orange' },
  'orange crush':      { type: 'standard roses', color: 'orange' },
  'high & flame':      { type: 'standard roses', color: 'orange' },
  'high magic':        { type: 'standard roses', color: 'orange' },
  'free spirit':       { type: 'standard roses', color: 'coral' },
  'coffee break':      { type: 'standard roses', color: 'copper' },
  'iguana':            { type: 'standard roses', color: 'green' },
  'new yellow':        { type: 'standard roses', color: 'yellow' },
  'malibu':            { type: 'standard roses', color: 'pink' },
};

/**
 * Base product types with search terms. Key = base_type value stored in DB.
 */
export const PRODUCT_TYPES: Record<string, { category: string; searchTerms: string[] }> = {
  // Roses
  'standard roses':           { category: 'flower', searchTerms: ['rose', 'roses'] },
  'spray roses':              { category: 'flower', searchTerms: ['spray rose', 'spray roses'] },
  'miniature spray roses':    { category: 'flower', searchTerms: ['miniature spray', 'mini spray'] },
  'garden roses':             { category: 'flower', searchTerms: ['garden rose', 'garden roses'] },
  // Carnations
  'standard carnations':      { category: 'flower', searchTerms: ['carnation', 'carnations', 'carn'] },
  'mini carnations':          { category: 'flower', searchTerms: ['mini carnation', 'mini carn', 'minicum'] },
  // Gerberas
  'standard gerberas':        { category: 'flower', searchTerms: ['gerbera', 'gerberas', 'gerber'] },
  'mini gerberas':            { category: 'flower', searchTerms: ['mini gerbera', 'germini'] },
  // Lilies
  'asiatic lilies':           { category: 'flower', searchTerms: ['asiatic lil'] },
  'oriental lilies':          { category: 'flower', searchTerms: ['oriental lil', 'casablanca', 'stargazer', 'sorbonne'] },
  'hybrid lilies':            { category: 'flower', searchTerms: ['hybrid lil'] },
  'calla lilies':             { category: 'flower', searchTerms: ['calla'] },
  // Poms
  'button poms':              { category: 'flower', searchTerms: ['button pom', 'kermit'] },
  'daisy poms':               { category: 'flower', searchTerms: ['daisy pom', 'daisy mum'] },
  'spider mums':              { category: 'flower', searchTerms: ['spider mum', 'fuji'] },
  'cushion poms':             { category: 'flower', searchTerms: ['cushion pom', 'pomp'] },
  // Other flowers
  'delphinium':               { category: 'flower', searchTerms: ['delphinium', 'delphinum', 'delph'] },
  'hydrangea':                { category: 'flower', searchTerms: ['hydrangea', 'hydra'] },
  'tulips':                   { category: 'flower', searchTerms: ['tulip'] },
  'snapdragons':              { category: 'flower', searchTerms: ['snapdragon', 'snap'] },
  'stock':                    { category: 'flower', searchTerms: ['stock'] },
  'alstroemeria':             { category: 'flower', searchTerms: ['alstroemeria', 'alstr', 'alastr'] },
  'liatris':                  { category: 'flower', searchTerms: ['liatris', 'liatrice'] },
  'statice':                  { category: 'flower', searchTerms: ['statice', 'sinuata'] },
  'solidago':                 { category: 'flower', searchTerms: ['solidago'] },
  'hypericum':                { category: 'flower', searchTerms: ['hypericum', 'hyp', 'hyper'] },
  'waxflower':                { category: 'flower', searchTerms: ['waxflower', 'wax'] },
  'gladiolus':                { category: 'flower', searchTerms: ['gladiolus', 'glads', 'glad'] },
  'limonium':                 { category: 'flower', searchTerms: ['limonium', 'caspia'] },
  'aster':                    { category: 'flower', searchTerms: ['aster', 'monte casino'] },
  'gypsophila':               { category: 'flower', searchTerms: ["gypsophila", "baby's breath", 'babies breath', 'gyp', 'gyps'] },
  'lisianthus':               { category: 'flower', searchTerms: ['lisianthus', 'lisiant'] },
  'sunflowers':               { category: 'flower', searchTerms: ['sunflower'] },
  'larkspur':                 { category: 'flower', searchTerms: ['larkspur', 'lark'] },
  'freesia':                  { category: 'flower', searchTerms: ['freesia'] },
  'iris':                     { category: 'flower', searchTerms: ['iris'] },
  'peony':                    { category: 'flower', searchTerms: ['peony', 'peonies'] },
  'ranunculus':               { category: 'flower', searchTerms: ['ranunculus'] },
  'anemone':                  { category: 'flower', searchTerms: ['anemone'] },
  'protea':                   { category: 'flower', searchTerms: ['protea'] },
  'orchid':                   { category: 'flower', searchTerms: ['orchid', 'dendrobium', 'cymbidium'] },
  // Foliage — color rarely meaningful, no color-aware naming
  'eucalyptus':               { category: 'foliage', searchTerms: ['eucalyptus', 'eucal'] },
  'pittosporum':              { category: 'foliage', searchTerms: ['pittosporum'] },
  'ruscus':                   { category: 'foliage', searchTerms: ['ruscus'] },
  'leather leaf':             { category: 'foliage', searchTerms: ['leather leaf', 'leather'] },
  'salal':                    { category: 'foliage', searchTerms: ['salal'] },
  'myrtle':                   { category: 'foliage', searchTerms: ['myrtle'] },
  'sprengeri':                { category: 'foliage', searchTerms: ['sprengeri', 'springeri'] },
  'tree fern':                { category: 'foliage', searchTerms: ['tree fern'] },
  'ming fern':                { category: 'foliage', searchTerms: ['ming fern'] },
  'greens':                   { category: 'foliage', searchTerms: ['greens', 'mixed greens'] },
};

/**
 * Flower types where color is a meaningful differentiator.
 * For these, canonical_name = "{color} {short_type}".
 * For all others, canonical_name = base_type (color as metadata only).
 */
const COLOR_MATTERS: Record<string, string> = {
  // base_type → short display name (drops "standard" where it's implied)
  'standard roses':    'roses',
  'spray roses':       'spray roses',
  'garden roses':      'garden roses',
  'miniature spray roses': 'miniature spray roses',
  'standard carnations': 'carnations',
  'mini carnations':   'mini carnations',
  'standard gerberas': 'gerberas',
  'mini gerberas':     'mini gerberas',
  'asiatic lilies':    'asiatic lilies',
  'oriental lilies':   'oriental lilies',
  'hybrid lilies':     'hybrid lilies',
  'calla lilies':      'calla lilies',
  'tulips':            'tulips',
  'snapdragons':       'snapdragons',
  'stock':             'stock',
  'delphinium':        'delphinium',
  'statice':           'statice',
  'daisy poms':        'daisy poms',
  'button poms':       'button poms',
  'alstroemeria':      'alstroemeria',
};

/**
 * Build a color-aware canonical name.
 * Returns "{color} {short_type}" when color is known and type supports color differentiation.
 * Returns the base_type otherwise (used as fallback / no-color entry).
 */
export function buildCanonicalName(baseType: string, color: string | null): string {
  if (!color) return baseType;
  const shortType = COLOR_MATTERS[baseType];
  if (!shortType) return baseType; // foliage and single-color flowers — no color in name
  return `${color} ${shortType}`;
}

export interface Classification {
  baseType: string;        // e.g. "standard roses"
  canonicalName: string;   // e.g. "red roses" or "standard roses" if no color
  color: string | null;
  variety: string | null;
  category: string;        // "flower" | "foliage"
}

export function lookupVariety(description: string): VarietyInfo | null {
  const lower = description.toLowerCase();
  const sorted = Object.entries(ROSE_VARIETIES).sort((a, b) => b[0].length - a[0].length);
  for (const [variety, info] of sorted) {
    if (lower.includes(variety)) return { ...info, notes: `variety: ${variety}` };
  }
  return null;
}

const COLORS = [
  'hot pink', 'light pink', 'pale pink', 'dusty pink', 'antique pink',
  'deep purple', 'dark orange', 'deep coral', 'lime green', 'pale green',
  'golden yellow', 'antique green', 'pale peach',
  'red', 'white', 'pink', 'yellow', 'orange', 'purple', 'lavender',
  'blue', 'fuchsia', 'coral', 'peach', 'green', 'ivory', 'copper',
  'bronze', 'burgundy', 'rust', 'cream', 'black',
];

export function extractColor(text: string): string | null {
  const lower = text.toLowerCase();
  for (const color of COLORS) {
    if (lower.includes(color)) return color;
  }
  return null;
}

export function classifyProductType(description: string): Classification | null {
  const lower = description.toLowerCase();

  // 1. Rose variety (most specific — gives us both type AND color)
  const variety = lookupVariety(description);
  if (variety) {
    const baseType = variety.type;
    const color = variety.color;
    return {
      baseType,
      canonicalName: buildCanonicalName(baseType, color),
      color,
      variety: variety.notes?.replace('variety: ', '') ?? null,
      category: PRODUCT_TYPES[baseType]?.category ?? 'flower',
    };
  }

  // 2. Specific rose subtypes before generic rose match
  if (/miniature spray|mini spray/i.test(lower)) {
    const bt = 'miniature spray roses';
    const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spray\s*rose/i.test(lower)) {
    const bt = 'spray roses';
    const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/garden\s*rose/i.test(lower)) {
    const bt = 'garden roses';
    const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 3. Mini carnations before standard
  if (/mini\s*carn|mint\s*carn|minicum/i.test(lower)) {
    const bt = 'mini carnations';
    const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 4. Mini gerberas
  if (/mini\s*gerb|germini/i.test(lower)) {
    const bt = 'mini gerberas';
    const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 5. Lily subtypes
  if (/asiatic/i.test(lower)) {
    const bt = 'asiatic lilies'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/casablanca|stargazer|oriental\s*lil|sorbonne/i.test(lower)) {
    const bt = 'oriental lilies'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/hybrid\s*lil/i.test(lower)) {
    const bt = 'hybrid lilies'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/calla/i.test(lower)) {
    const bt = 'calla lilies'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 6. Pom subtypes
  if (/button\s*pom|kermit/i.test(lower)) {
    const bt = 'button poms'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/daisy\s*(pom|mum)/i.test(lower)) {
    const bt = 'daisy poms'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spider\s*mum|fuji/i.test(lower)) {
    const bt = 'spider mums'; const c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 7. Broader product types — longest search term first
  const sortedTypes = Object.entries(PRODUCT_TYPES)
    .sort((a, b) =>
      Math.max(...b[1].searchTerms.map(t => t.length)) -
      Math.max(...a[1].searchTerms.map(t => t.length))
    );

  for (const [baseType, info] of sortedTypes) {
    for (const term of info.searchTerms) {
      if (lower.includes(term)) {
        const color = info.category === 'foliage' ? null : extractColor(lower);
        return {
          baseType,
          canonicalName: buildCanonicalName(baseType, color),
          color,
          variety: null,
          category: info.category,
        };
      }
    }
  }

  return null;
}

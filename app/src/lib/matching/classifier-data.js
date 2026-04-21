// @ts-check
/**
 * Shared classifier data + logic for recipe and invoice product classification.
 *
 * Plain JS/CommonJS module so both the TypeScript Next.js app (via
 * variety-lookup.ts) AND the plain-Node rebuild-catalog.js script can import
 * the same source of truth. Any classifier changes should land here.
 */

const ROSE_VARIETIES = {
  'freedom':           { type: 'standard roses', color: 'red' },
  'explorer':          { type: 'standard roses', color: 'red' },
  'cherry o':          { type: 'standard roses', color: 'red' },
  'hearts':            { type: 'standard roses', color: 'red' },
  'tycoon':            { type: 'standard roses', color: 'red' },
  'confidential':      { type: 'standard roses', color: 'red' },
  'mondial':           { type: 'standard roses', color: 'white' },
  'akito':             { type: 'standard roses', color: 'white' },
  'tibet':             { type: 'standard roses', color: 'white' },
  'playa blanca':      { type: 'standard roses', color: 'white' },
  'vendela':           { type: 'standard roses', color: 'cream' },
  'rosita vendela':    { type: 'standard roses', color: 'cream' },
  'sahara':            { type: 'standard roses', color: 'cream' },
  'creme de la creme': { type: 'standard roses', color: 'cream' },
  'quicksand':         { type: 'standard roses', color: 'cream' },
  'full monty':        { type: 'standard roses', color: 'cream' },
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
  'country home':      { type: 'garden roses',   color: 'pink' },
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
  'honesty':           { type: 'standard roses', color: 'orange' },
  'free spirit':       { type: 'standard roses', color: 'coral' },
  'coffee break':      { type: 'standard roses', color: 'copper' },
  'iguana':            { type: 'standard roses', color: 'green' },
  'new yellow':        { type: 'standard roses', color: 'yellow' },
  'malibu':            { type: 'standard roses', color: 'pink' },
};

const PRODUCT_TYPES = {
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
  // Lily subtypes
  'asiatic lilies':           { category: 'flower', searchTerms: ['asiatic lil'] },
  'oriental lilies':          { category: 'flower', searchTerms: ['oriental lil', 'casablanca', 'stargazer', 'sorbonne'] },
  'hybrid lilies':            { category: 'flower', searchTerms: ['hybrid lil'] },
  'calla lilies':             { category: 'flower', searchTerms: ['calla'] },
  // Poms — color-aware, all chrysanthemum family
  'button poms':              { category: 'flower', searchTerms: ['button pom', 'kermit'] },
  'daisy poms':               { category: 'flower', searchTerms: ['daisy pom', 'daisy mum'] },
  'spider mums':              { category: 'flower', searchTerms: ['spider mum', 'fuji', 'spider'] },
  'cushion poms':             { category: 'flower', searchTerms: ['cushion pom', 'chrysanthemum', 'chrysanthemums', 'mums', 'poms', 'pomp'] },
  // Generic lilies/daisies (catch generic "white lilies", "yellow daisy", etc.)
  'lilies':                   { category: 'flower', searchTerms: ['lily', 'lilies'] },
  'daisies':                  { category: 'flower', searchTerms: ['daisy', 'daisies'] },
  // Other flowers
  'delphinium':               { category: 'flower', searchTerms: ['delphinium', 'delphinum', 'delph'] },
  'hydrangea':                { category: 'flower', searchTerms: ['hydrangea', 'hydra'] },
  'tulips':                   { category: 'flower', searchTerms: ['tulip'] },
  'snapdragons':              { category: 'flower', searchTerms: ['snapdragon', 'snap'] },
  'stock':                    { category: 'flower', searchTerms: ['stock'] },
  'alstroemeria':             { category: 'flower', searchTerms: ['alstroemeria', 'alstr', 'alastr'] },
  'liatris':                  { category: 'flower', searchTerms: ['liatris', 'liatrice', 'liatrus'] },
  'statice':                  { category: 'flower', searchTerms: ['statice', 'sinuata'] },
  'solidago':                 { category: 'flower', searchTerms: ['solidago', 'soliago', 'solidgo'] },
  'hypericum':                { category: 'flower', searchTerms: ['hypericum', 'hyp', 'hyper'] },
  'waxflower':                { category: 'flower', searchTerms: ['waxflower', 'wax'] },
  'gladiolus':                { category: 'flower', searchTerms: ['gladiolus', 'glads', 'glad'] },
  'limonium':                 { category: 'flower', searchTerms: ['limonium', 'caspia'] },
  'aster':                    { category: 'flower', searchTerms: ['aster', 'monte casino'] },
  'gypsophila':               { category: 'flower', searchTerms: ["gypsophila", "baby's breath", 'babies breath', 'gyp', 'gyps'] },
  'lisianthus':               { category: 'flower', searchTerms: ['lisianthus', 'lisiant'] },
  'sunflowers':               { category: 'flower', searchTerms: ['sunflower', 'sun flower'] },
  'larkspur':                 { category: 'flower', searchTerms: ['larkspur', 'lark'] },
  'freesia':                  { category: 'flower', searchTerms: ['freesia'] },
  'iris':                     { category: 'flower', searchTerms: ['iris'] },
  'peonies':                  { category: 'flower', searchTerms: ['peony', 'peonies'] },
  'ranunculus':               { category: 'flower', searchTerms: ['ranunculus'] },
  'anemone':                  { category: 'flower', searchTerms: ['anemone'] },
  'protea':                   { category: 'flower', searchTerms: ['protea'] },
  'orchid':                   { category: 'flower', searchTerms: ['orchid', 'dendrobium', 'dendro', 'cymbidium'] },
  'thistle':                  { category: 'flower', searchTerms: ['thistle', 'eryngium'] },
  // Phase 1 flower additions
  'bells of ireland':         { category: 'flower', searchTerms: ['bells of ireland', 'bells of irel', 'molucella'] },
  'astilbe':                  { category: 'flower', searchTerms: ['astilbe'] },
  'bird of paradise':         { category: 'flower', searchTerms: ['bird of paradise', 'strelitzia'] },
  'dianthus':                 { category: 'flower', searchTerms: ['dianthus', 'green trick', 'sweet william'] },
  'celosia':                  { category: 'flower', searchTerms: ['celosia', 'cockscomb'] },
  'heather':                  { category: 'flower', searchTerms: ['heather', 'erica'] },
  'leucadendron':             { category: 'flower', searchTerms: ['leucadendron', 'safari sunset'] },
  'star of bethlehem':        { category: 'flower', searchTerms: ['star of bethlehem', 'ornithogalum'] },
  "queen anne's lace":        { category: 'flower', searchTerms: ["queen anne", 'ammi majus'] },
  'lotus pods':               { category: 'flower', searchTerms: ['lotus pod', 'lotus'] },
  'dahlia':                   { category: 'flower', searchTerms: ['dahlia'] },
  // Foliage
  'eucalyptus':               { category: 'foliage', searchTerms: ['eucalyptus', 'eucal'] },
  'pittosporum':              { category: 'foliage', searchTerms: ['pittosporum', 'silver queen pitt'] },
  'ruscus':                   { category: 'foliage', searchTerms: ['ruscus'] },
  'leather leaf':             { category: 'foliage', searchTerms: ['leather leaf', 'leather'] },
  'salal':                    { category: 'foliage', searchTerms: ['salal'] },
  'myrtle':                   { category: 'foliage', searchTerms: ['myrtle'] },
  'sprengeri':                { category: 'foliage', searchTerms: ['sprengeri', 'springeri'] },
  'tree fern':                { category: 'foliage', searchTerms: ['tree fern'] },
  'ming fern':                { category: 'foliage', searchTerms: ['ming fern'] },
  'sword fern':               { category: 'foliage', searchTerms: ['sword fern'] },
  'greens':                   { category: 'foliage', searchTerms: ['greens', 'mixed greens'] },
  // Phase 1 foliage additions
  'ivy':                      { category: 'foliage', searchTerms: ['ivy'] },
  'aspidistra':               { category: 'foliage', searchTerms: ['aspidistra'] },
  'galax':                    { category: 'foliage', searchTerms: ['galax'] },
  'bupleurum':                { category: 'foliage', searchTerms: ['bupleurum'] },
  'jade':                     { category: 'foliage', searchTerms: ['jade'] },
  'lily grass':               { category: 'foliage', searchTerms: ['lily grass', 'liriope'] },
  'huckleberry':              { category: 'foliage', searchTerms: ['huckleberry'] },
  'hosta':                    { category: 'foliage', searchTerms: ['hosta'] },
  'curly willow':             { category: 'foliage', searchTerms: ['curly willow'] },
  'dusty miller':             { category: 'foliage', searchTerms: ['dusty miller'] },
  'boxwood':                  { category: 'foliage', searchTerms: ['boxwood'] },
  'magnolia':                 { category: 'foliage', searchTerms: ['magnolia'] },
  'holly':                    { category: 'foliage', searchTerms: ['holly'] },
  'cedar':                    { category: 'foliage', searchTerms: ['cedar'] },
  'pine':                     { category: 'foliage', searchTerms: ['pine'] },
  'oregonia':                 { category: 'foliage', searchTerms: ['oregonia'] },
  'lycopodium':               { category: 'foliage', searchTerms: ['lycopodium'] },
  'monstera':                 { category: 'foliage', searchTerms: ['monstera'] },
  'acacia':                   { category: 'foliage', searchTerms: ['acacia'] },
};

// Types where color creates a distinct catalog entry.
// Value = short display name (drops redundant "standard" where color is already the differentiator).
const COLOR_MATTERS = {
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
  'lilies':            'lilies',
  'tulips':            'tulips',
  'snapdragons':       'snapdragons',
  'stock':             'stock',
  'delphinium':        'delphinium',
  'statice':           'statice',
  'daisy poms':        'daisy poms',
  'button poms':       'button poms',
  'cushion poms':      'cushion poms',
  'spider mums':       'spider mums',
  'daisies':           'daisies',
  'alstroemeria':      'alstroemeria',
  'dianthus':          'dianthus',
  'heather':           'heather',
  'dahlia':            'dahlia',
};

const COLORS = [
  'hot pink', 'light pink', 'pale pink', 'dusty pink', 'antique pink',
  'deep purple', 'dark orange', 'deep coral', 'lime green', 'pale green',
  'golden yellow', 'antique green', 'pale peach',
  'red', 'white', 'pink', 'yellow', 'orange', 'purple', 'lavender',
  'blue', 'fuchsia', 'coral', 'peach', 'green', 'ivory', 'copper',
  'bronze', 'burgundy', 'rust', 'cream', 'black',
];

// Non-flower decorative / container items that sometimes appear as ingredients
// (recipe parser miscategorization, or vendor line items that aren't products).
const SUPPLY_PATTERNS = [
  /\bfoam\b/, /\bcage\b/, /\btape\b/, /\bteepee\b/, /\bpick\b/,
  /\bwire\b/, /\bmesh\b/, /\bribbon\b/, /\bcard(?:ette)?s?\b/, /\bbow\b/,
  /\bcandle[s]?\b/, /\btaper\b/, /\bpumpkin[s]?\b/, /\bmillimeter\b/,
  /\bglitter\b/, /\bsheer\b/, /\bdecorative\b/, /\bbranches?\b/,
  /\b(?:metallic|ceramic|plastic)\b/, /\bcup[s]?\b/, /\bting\b/,
];

function isSupply(description) {
  const lower = String(description).toLowerCase();
  return SUPPLY_PATTERNS.some(p => p.test(lower));
}

// Common misspellings normalized before classification.
const TYPO_FIXES = [
  [/\bsoliago\b/gi, 'solidago'],
  [/\bsolidgo\b/gi, 'solidago'],
  [/\bdelphinum\b/gi, 'delphinium'],
  [/\bliatrus\b/gi, 'liatris'],
  [/\balstromeria\b/gi, 'alstroemeria'],
  [/\balastromeria\b/gi, 'alstroemeria'],
  [/\brununculus\b/gi, 'ranunculus'],
];

function fixTypos(text) {
  let result = text;
  for (const [pattern, correct] of TYPO_FIXES) {
    result = result.replace(pattern, correct);
  }
  return result;
}

function extractColor(text) {
  // Leftmost match wins; on a tie (same position), the longer color wins.
  // This keeps "rust" from losing to "red" in "rust 'Red Rover' chrysanthemums"
  // and keeps "hot pink" ahead of "pink" in "hot pink roses".
  const lower = text.toLowerCase();
  let best = null;
  for (const color of COLORS) {
    const pos = lower.indexOf(color);
    if (pos < 0) continue;
    if (best === null || pos < best.pos || (pos === best.pos && color.length > best.color.length)) {
      best = { color, pos };
    }
  }
  return best ? best.color : null;
}

function buildCanonicalName(baseType, color) {
  if (!color) return baseType;
  const shortType = COLOR_MATTERS[baseType];
  if (!shortType) return baseType;
  return `${color} ${shortType}`;
}

function lookupVariety(description) {
  const lower = description.toLowerCase();
  const sorted = Object.entries(ROSE_VARIETIES).sort((a, b) => b[0].length - a[0].length);
  for (const [variety, info] of sorted) {
    if (lower.includes(variety)) return { ...info, notes: `variety: ${variety}` };
  }
  return null;
}

function classifyProductType(description) {
  if (isSupply(description)) return null;

  const lower = fixTypos(description.toLowerCase());

  // 1. Rose variety (most specific — type + color)
  const variety = lookupVariety(description);
  if (variety) {
    const baseType = variety.type;
    const color = variety.color;
    return {
      baseType,
      canonicalName: buildCanonicalName(baseType, color),
      color,
      variety: variety.notes ? variety.notes.replace('variety: ', '') : null,
      category: (PRODUCT_TYPES[baseType] && PRODUCT_TYPES[baseType].category) || 'flower',
    };
  }

  // 2. Rose subtypes before generic rose match
  if (/miniature spray|mini spray/.test(lower)) {
    const bt = 'miniature spray roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spray\s*rose/.test(lower)) {
    const bt = 'spray roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/garden\s*rose/.test(lower)) {
    const bt = 'garden roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 3. Mini carnations before standard
  if (/mini\s*carn|mint\s*carn|minicum/.test(lower)) {
    const bt = 'mini carnations', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 4. Mini gerberas
  if (/mini\s*gerb|germini/.test(lower)) {
    const bt = 'mini gerberas', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 5. Lily subtypes
  if (/asiatic/.test(lower)) {
    const bt = 'asiatic lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/casablanca|stargazer|oriental\s*lil|sorbonne/.test(lower)) {
    const bt = 'oriental lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/hybrid\s*lil/.test(lower)) {
    const bt = 'hybrid lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/calla/.test(lower)) {
    const bt = 'calla lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 6. Pom subtypes
  if (/button\s*pom|kermit/.test(lower)) {
    const bt = 'button poms', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/daisy\s*(pom|mum)/.test(lower)) {
    const bt = 'daisy poms', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spider\s*mum|fuji/.test(lower)) {
    const bt = 'spider mums', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 7. Broader product types — longest search term first
  const sortedTypes = Object.entries(PRODUCT_TYPES).sort((a, b) =>
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

module.exports = {
  ROSE_VARIETIES,
  PRODUCT_TYPES,
  COLOR_MATTERS,
  COLORS,
  SUPPLY_PATTERNS,
  isSupply,
  fixTypos,
  extractColor,
  buildCanonicalName,
  lookupVariety,
  classifyProductType,
};

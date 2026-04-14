/**
 * Rebuild flower catalog + match recipe ingredients + match invoice line items.
 * Color-aware: "red roses", "white roses", "blue delphinium" etc. are separate entries.
 * Stem size (cm) is extracted from invoice descriptions and stored in ingredient_costs.
 *
 * Usage: node scripts/rebuild-catalog.js
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

// ---------------------------------------------------------------------------
// Classification logic (mirrors variety-lookup.ts)
// ---------------------------------------------------------------------------

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

const PRODUCT_TYPES = {
  'standard roses':        { category: 'flower', searchTerms: ['rose', 'roses'] },
  'spray roses':           { category: 'flower', searchTerms: ['spray rose', 'spray roses'] },
  'miniature spray roses': { category: 'flower', searchTerms: ['miniature spray', 'mini spray'] },
  'garden roses':          { category: 'flower', searchTerms: ['garden rose', 'garden roses'] },
  'standard carnations':   { category: 'flower', searchTerms: ['carnation', 'carnations', 'carn'] },
  'mini carnations':       { category: 'flower', searchTerms: ['mini carnation', 'mini carn', 'minicum'] },
  'standard gerberas':     { category: 'flower', searchTerms: ['gerbera', 'gerberas', 'gerber'] },
  'mini gerberas':         { category: 'flower', searchTerms: ['mini gerbera', 'germini'] },
  'asiatic lilies':        { category: 'flower', searchTerms: ['asiatic lil'] },
  'oriental lilies':       { category: 'flower', searchTerms: ['oriental lil', 'casablanca', 'stargazer', 'sorbonne'] },
  'hybrid lilies':         { category: 'flower', searchTerms: ['hybrid lil'] },
  'calla lilies':          { category: 'flower', searchTerms: ['calla'] },
  'button poms':           { category: 'flower', searchTerms: ['button pom', 'kermit'] },
  'daisy poms':            { category: 'flower', searchTerms: ['daisy pom', 'daisy mum'] },
  'spider mums':           { category: 'flower', searchTerms: ['spider mum', 'fuji'] },
  'cushion poms':          { category: 'flower', searchTerms: ['cushion pom', 'pomp'] },
  'delphinium':            { category: 'flower', searchTerms: ['delphinium', 'delphinum', 'delph'] },
  'hydrangea':             { category: 'flower', searchTerms: ['hydrangea', 'hydra'] },
  'tulips':                { category: 'flower', searchTerms: ['tulip'] },
  'snapdragons':           { category: 'flower', searchTerms: ['snapdragon', 'snap'] },
  'stock':                 { category: 'flower', searchTerms: ['stock'] },
  'alstroemeria':          { category: 'flower', searchTerms: ['alstroemeria', 'alstr', 'alastr'] },
  'liatris':               { category: 'flower', searchTerms: ['liatris', 'liatrice'] },
  'statice':               { category: 'flower', searchTerms: ['statice', 'sinuata'] },
  'solidago':              { category: 'flower', searchTerms: ['solidago'] },
  'hypericum':             { category: 'flower', searchTerms: ['hypericum', 'hyp', 'hyper'] },
  'waxflower':             { category: 'flower', searchTerms: ['waxflower', 'wax'] },
  'gladiolus':             { category: 'flower', searchTerms: ['gladiolus', 'glads', 'glad'] },
  'limonium':              { category: 'flower', searchTerms: ['limonium', 'caspia'] },
  'aster':                 { category: 'flower', searchTerms: ['aster', 'monte casino'] },
  'gypsophila':            { category: 'flower', searchTerms: ["gypsophila", "baby's breath", 'babies breath', 'gyp', 'gyps'] },
  'lisianthus':            { category: 'flower', searchTerms: ['lisianthus', 'lisiant'] },
  'sunflowers':            { category: 'flower', searchTerms: ['sunflower'] },
  'larkspur':              { category: 'flower', searchTerms: ['larkspur', 'lark'] },
  'freesia':               { category: 'flower', searchTerms: ['freesia'] },
  'iris':                  { category: 'flower', searchTerms: ['iris'] },
  'peony':                 { category: 'flower', searchTerms: ['peony', 'peonies'] },
  'ranunculus':            { category: 'flower', searchTerms: ['ranunculus'] },
  'anemone':               { category: 'flower', searchTerms: ['anemone'] },
  'protea':                { category: 'flower', searchTerms: ['protea'] },
  'orchid':                { category: 'flower', searchTerms: ['orchid', 'dendrobium', 'cymbidium'] },
  'eucalyptus':            { category: 'foliage', searchTerms: ['eucalyptus', 'eucal'] },
  'pittosporum':           { category: 'foliage', searchTerms: ['pittosporum'] },
  'ruscus':                { category: 'foliage', searchTerms: ['ruscus'] },
  'leather leaf':          { category: 'foliage', searchTerms: ['leather leaf', 'leather'] },
  'salal':                 { category: 'foliage', searchTerms: ['salal'] },
  'myrtle':                { category: 'foliage', searchTerms: ['myrtle'] },
  'sprengeri':             { category: 'foliage', searchTerms: ['sprengeri', 'springeri'] },
  'tree fern':             { category: 'foliage', searchTerms: ['tree fern'] },
  'ming fern':             { category: 'foliage', searchTerms: ['ming fern'] },
  'greens':                { category: 'foliage', searchTerms: ['greens', 'mixed greens'] },
};

// Types where color creates a separate catalog entry
const COLOR_MATTERS = {
  'standard roses': 'roses', 'spray roses': 'spray roses', 'garden roses': 'garden roses',
  'miniature spray roses': 'miniature spray roses',
  'standard carnations': 'carnations', 'mini carnations': 'mini carnations',
  'standard gerberas': 'gerberas', 'mini gerberas': 'mini gerberas',
  'asiatic lilies': 'asiatic lilies', 'oriental lilies': 'oriental lilies',
  'hybrid lilies': 'hybrid lilies', 'calla lilies': 'calla lilies',
  'tulips': 'tulips', 'snapdragons': 'snapdragons', 'stock': 'stock',
  'delphinium': 'delphinium', 'statice': 'statice',
  'daisy poms': 'daisy poms', 'button poms': 'button poms',
  'alstroemeria': 'alstroemeria',
};

const COLORS = [
  'hot pink', 'light pink', 'pale pink', 'dusty pink', 'antique pink',
  'deep purple', 'dark orange', 'deep coral', 'lime green', 'pale green',
  'golden yellow', 'antique green', 'pale peach',
  'red', 'white', 'pink', 'yellow', 'orange', 'purple', 'lavender',
  'blue', 'fuchsia', 'coral', 'peach', 'green', 'ivory', 'copper',
  'bronze', 'burgundy', 'rust', 'cream', 'black',
];

function extractColor(text) {
  const lower = text.toLowerCase();
  for (const color of COLORS) {
    if (lower.includes(color)) return color;
  }
  return null;
}

function buildCanonicalName(baseType, color) {
  if (!color) return baseType;
  const shortType = COLOR_MATTERS[baseType];
  if (!shortType) return baseType; // foliage or single-color types
  return `${color} ${shortType}`;
}

function extractStemSize(description) {
  const match = description.match(/\b(\d{2,3})\s*(?:cm|CM)\b/);
  return match ? parseInt(match[1], 10) : null;
}

function classifyProductType(description) {
  const lower = description.toLowerCase();

  // 1. Rose variety lookup (most specific)
  const sortedVarieties = Object.entries(ROSE_VARIETIES).sort((a, b) => b[0].length - a[0].length);
  for (const [variety, info] of sortedVarieties) {
    if (lower.includes(variety)) {
      const baseType = info.type;
      const color = info.color;
      return { baseType, canonicalName: buildCanonicalName(baseType, color), color, variety, category: 'flower' };
    }
  }

  // 2. Rose subtypes
  if (/miniature spray|mini spray/i.test(lower)) {
    const bt = 'miniature spray roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spray\s*rose/i.test(lower)) {
    const bt = 'spray roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/garden\s*rose/i.test(lower)) {
    const bt = 'garden roses', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 3. Mini carnations before standard
  if (/mini\s*carn|mint\s*carn|minicum/i.test(lower)) {
    const bt = 'mini carnations', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 4. Mini gerberas
  if (/mini\s*gerb|germini/i.test(lower)) {
    const bt = 'mini gerberas', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 5. Lily subtypes
  if (/asiatic/i.test(lower)) {
    const bt = 'asiatic lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/casablanca|stargazer|oriental\s*lil|sorbonne/i.test(lower)) {
    const bt = 'oriental lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/hybrid\s*lil/i.test(lower)) {
    const bt = 'hybrid lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/calla/i.test(lower)) {
    const bt = 'calla lilies', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 6. Pom subtypes
  if (/button\s*pom|kermit/i.test(lower)) {
    const bt = 'button poms', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/daisy\s*(pom|mum)/i.test(lower)) {
    const bt = 'daisy poms', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }
  if (/spider\s*mum|fuji/i.test(lower)) {
    const bt = 'spider mums', c = extractColor(lower);
    return { baseType: bt, canonicalName: buildCanonicalName(bt, c), color: c, variety: null, category: 'flower' };
  }

  // 7. Broader types (longest search term wins)
  const sortedTypes = Object.entries(PRODUCT_TYPES)
    .sort((a, b) =>
      Math.max(...b[1].searchTerms.map(t => t.length)) -
      Math.max(...a[1].searchTerms.map(t => t.length))
    );

  for (const [baseType, info] of sortedTypes) {
    for (const term of info.searchTerms) {
      if (lower.includes(term)) {
        const color = info.category === 'foliage' ? null : extractColor(lower);
        return { baseType, canonicalName: buildCanonicalName(baseType, color), color, variety: null, category: info.category };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ---- Step 1: Wipe and rebuild catalog ----
  console.log('\n[1/3] Rebuilding flower catalog...');
  await client.query('DELETE FROM flower_aliases');
  await client.query('DELETE FROM ingredient_costs');
  await client.query("UPDATE recipe_ingredients SET flower_id = NULL, match_status = 'pending', match_confidence = NULL");
  await client.query('DELETE FROM flower_catalog');

  const { rows: ingredients } = await client.query(
    'SELECT DISTINCT ingredient_name, is_foliage FROM recipe_ingredients'
  );
  console.log(`  Processing ${ingredients.length} unique ingredient names...`);

  // Build catalog entries (canonical_name → { category, base_type })
  const catalogEntries = new Map();
  for (const ing of ingredients) {
    const cl = classifyProductType(ing.ingredient_name);
    if (!cl) continue;
    // Force foliage flag from recipe if set
    const category = ing.is_foliage ? 'foliage' : cl.category;
    catalogEntries.set(cl.canonicalName, { category, base_type: cl.baseType });
  }

  for (const [name, info] of catalogEntries) {
    await client.query(
      'INSERT INTO flower_catalog (canonical_name, category, base_type) VALUES ($1, $2, $3) ON CONFLICT (canonical_name) DO UPDATE SET base_type = EXCLUDED.base_type',
      [name, info.category, info.base_type]
    );
  }
  console.log(`  Created ${catalogEntries.size} catalog entries`);

  // ---- Step 2: Match recipe ingredients to catalog ----
  console.log('\n[2/3] Matching recipe ingredients to catalog...');
  const { rows: catalog } = await client.query('SELECT id, canonical_name FROM flower_catalog');
  const catalogMap = new Map(catalog.map(c => [c.canonical_name, c.id]));

  const { rows: allIngredients } = await client.query(
    'SELECT id, ingredient_name FROM recipe_ingredients WHERE flower_id IS NULL'
  );

  let matched = 0, unmatched = 0;
  const byFlower = new Map(); // flowerId → [ingredientId, ...]
  for (const ing of allIngredients) {
    const cl = classifyProductType(ing.ingredient_name);
    if (!cl || !catalogMap.has(cl.canonicalName)) { unmatched++; continue; }
    const flowerId = catalogMap.get(cl.canonicalName);
    if (!byFlower.has(flowerId)) byFlower.set(flowerId, []);
    byFlower.get(flowerId).push(ing.id);
  }

  for (const [flowerId, ids] of byFlower) {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    await client.query(
      `UPDATE recipe_ingredients SET flower_id = $1, match_status = 'auto_matched', match_confidence = 0.9 WHERE id IN (${placeholders})`,
      [flowerId, ...ids]
    );
    matched += ids.length;
  }
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`);

  // ---- Step 3: Match invoice line items to catalog ----
  console.log('\n[3/3] Matching invoice line items to catalog...');
  const { rows: lineItems } = await client.query(`
    SELECT li.id, li.description, li.unit_price, li.cost_per_stem, r.vendor_id, r.invoice_date
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
  `);

  const aliasRows = [];   // [flowerId, alias, vendorId, confidence]
  const costRows = [];    // [flowerId, vendorId, unitCost, costPer, lineItemId, invoiceDate, stemSizeCm]
  let liMatched = 0, liUnmatched = 0;

  for (const item of lineItems) {
    const cl = classifyProductType(item.description);
    if (!cl || !catalogMap.has(cl.canonicalName)) { liUnmatched++; continue; }
    const flowerId = catalogMap.get(cl.canonicalName);
    const stemSize = extractStemSize(item.description);

    aliasRows.push([flowerId, item.description, item.vendor_id, 0.9]);
    const costValue = item.cost_per_stem ?? item.unit_price;
    if (costValue != null && Number(costValue) > 0) {
      // Parse date for parsed_date column
      let parsedDate = null;
      const dateStr = item.invoice_date;
      if (dateStr) {
        if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) parsedDate = dateStr.substring(0, 10);
        else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
          const [m, d, y] = dateStr.split('/');
          parsedDate = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
          const [m, d, y] = dateStr.split('/');
          const fullYear = Number(y) > 50 ? `19${y}` : `20${y}`;
          parsedDate = `${fullYear}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
      }
      costRows.push([flowerId, item.vendor_id, Number(costValue), 'stem', item.id, item.invoice_date, stemSize, parsedDate]);
    }
    liMatched++;
  }

  const batchSize = 100;

  // Batch insert aliases
  for (let i = 0; i < aliasRows.length; i += batchSize) {
    const batch = aliasRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((_, j) => {
      const o = j * 4;
      values.push(...batch[j]);
      return `($${o+1},$${o+2},$${o+3},$${o+4})`;
    });
    await client.query(
      `INSERT INTO flower_aliases (flower_id, alias, vendor_id, confidence) VALUES ${placeholders.join(',')} ON CONFLICT (alias, vendor_id) DO NOTHING`,
      values
    );
  }

  // Batch insert costs (with stem_size_cm)
  for (let i = 0; i < costRows.length; i += batchSize) {
    const batch = costRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((_, j) => {
      const o = j * 8;
      values.push(...batch[j]);
      return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8})`;
    });
    await client.query(
      `INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date, stem_size_cm, parsed_date) VALUES ${placeholders.join(',')}`,
      values
    );
  }

  console.log(`  Line items matched: ${liMatched}, unmatched: ${liUnmatched}`);
  console.log(`  Aliases: ${aliasRows.length}, cost records: ${costRows.length}`);

  // ---- Set is_current flag (2024+ rule) ----
  console.log('\n[4/3] Setting cost currency (2024+ rule)...');
  await client.query('ALTER TABLE ingredient_costs ADD COLUMN IF NOT EXISTS is_current BOOLEAN DEFAULT false');
  await client.query('UPDATE ingredient_costs SET is_current = false');
  const { rowCount: marked2024 } = await client.query("UPDATE ingredient_costs SET is_current = true WHERE parsed_date >= '2024-01-01'");
  const { rowCount: markedFallback } = await client.query(`
    UPDATE ingredient_costs SET is_current = true
    WHERE id IN (
      SELECT DISTINCT ON (flower_id) id
      FROM ingredient_costs
      WHERE flower_id NOT IN (
        SELECT DISTINCT flower_id FROM ingredient_costs WHERE parsed_date >= '2024-01-01'
      )
      ORDER BY flower_id, parsed_date DESC NULLS LAST, id DESC
    )
  `);
  console.log(`  Current: ${marked2024} rows (2024+), ${markedFallback} fallback rows`);

  // ---- Summary ----
  const { rows: [stats] } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM flower_catalog) as total,
      (SELECT COUNT(*) FROM flower_catalog WHERE category = 'flower') as flowers,
      (SELECT COUNT(*) FROM flower_catalog WHERE category = 'foliage') as foliage,
      (SELECT COUNT(DISTINCT base_type) FROM flower_catalog) as base_types,
      (SELECT COUNT(*) FROM recipe_ingredients WHERE flower_id IS NOT NULL) as ingredients_matched,
      (SELECT COUNT(*) FROM flower_aliases) as aliases,
      (SELECT COUNT(*) FROM ingredient_costs) as cost_records,
      (SELECT COUNT(*) FROM ingredient_costs WHERE stem_size_cm IS NOT NULL) as with_stem_size
  `);
  console.log(`\nDone.`);
  console.log(`  Catalog: ${stats.total} entries (${stats.flowers} flowers, ${stats.foliage} foliage) across ${stats.base_types} base types`);
  console.log(`  Recipe ingredients matched: ${stats.ingredients_matched}`);
  console.log(`  Aliases: ${stats.aliases}, cost records: ${stats.cost_records} (${stats.with_stem_size} with stem size)`);

  // Show sample color breakdown for roses
  const { rows: roseSample } = await client.query(`
    SELECT canonical_name, base_type,
      (SELECT COUNT(*) FROM ingredient_costs ic2 WHERE ic2.flower_id = fc.id) as cost_records
    FROM flower_catalog fc WHERE base_type = 'standard roses' ORDER BY canonical_name
  `);
  if (roseSample.length) {
    console.log('\n  Standard roses breakdown:');
    for (const r of roseSample) {
      console.log(`    ${r.canonical_name.padEnd(30)} ${r.cost_records} cost records`);
    }
  }

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

/**
 * Rebuild flower catalog + match recipe ingredients + match invoice line items.
 * Replaces POST /api/catalog (which times out on Vercel for large datasets).
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
// Inline port of variety-lookup.ts + name-normalizer.ts
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
  'vendela':           { type: 'standard roses', color: 'cream/ivory' },
  'rosita vendela':    { type: 'standard roses', color: 'cream/ivory' },
  'sahara':            { type: 'standard roses', color: 'cream/sand' },
  'brighton':          { type: 'standard roses', color: 'peach' },
  'tara':              { type: 'standard roses', color: 'peach' },
  'faith':             { type: 'standard roses', color: 'peach' },
  'shimmer':           { type: 'standard roses', color: 'peach/light pink' },
  'nena':              { type: 'standard roses', color: 'light pink' },
  'nina':              { type: 'standard roses', color: 'light pink' },
  'mother of pearl':   { type: 'standard roses', color: 'light pink' },
  'pink martini':      { type: 'standard roses', color: 'pink' },
  'senorita':          { type: 'standard roses', color: 'pink' },
  'engagement':        { type: 'standard roses', color: 'pink' },
  'vintage pink':      { type: 'standard roses', color: 'antique pink' },
  'secret garden':     { type: 'standard roses', color: 'pink blend' },
  'deep purple':       { type: 'standard roses', color: 'deep purple' },
  'ocean song':        { type: 'standard roses', color: 'lavender' },
  'polo':              { type: 'standard roses', color: 'lavender' },
  'country blues':     { type: 'standard roses', color: 'lavender/blue' },
  'proud':             { type: 'standard roses', color: 'hot pink' },
  'gotcha':            { type: 'standard roses', color: 'hot pink' },
  'pink floyd':        { type: 'standard roses', color: 'hot pink' },
  'cancun':            { type: 'standard roses', color: 'orange/hot pink' },
  'high & flame':      { type: 'standard roses', color: 'orange/yellow bicolor' },
  'high magic':        { type: 'standard roses', color: 'orange/yellow bicolor' },
  'free spirit':       { type: 'standard roses', color: 'coral/peach' },
  'orange crush':      { type: 'standard roses', color: 'orange' },
  'coffee break':      { type: 'standard roses', color: 'copper/brown' },
  'iguana':            { type: 'standard roses', color: 'green' },
  'deja vu':           { type: 'standard roses', color: 'dusty pink' },
  'creme de la creme': { type: 'standard roses', color: 'cream' },
  'new yellow':        { type: 'standard roses', color: 'yellow' },
  'tiffany':           { type: 'standard roses', color: 'peach/pink' },
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
  'oriental lilies':       { category: 'flower', searchTerms: ['oriental lil', 'casablanca', 'stargazer'] },
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
  'gypsophila':            { category: 'flower', searchTerms: ['gypsophila', 'baby\'s breath', 'babies breath', 'gyp', 'gyps'] },
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

const FOLIAGE_TYPES = new Set(['foliage']);
const COLORS = [
  'hot pink','light pink','pale pink','dusty pink','antique pink',
  'deep purple','dark orange','deep coral','lime-green','lime green',
  'apple-green','golden yellow','antique green','pale green','pale peach',
  'red','white','pink','yellow','orange','purple','lavender',
  'blue','fuchsia','coral','peach','green','ivory','copper',
  'bronze','burgundy','rust','cream','black',
];

function extractColor(text) {
  const lower = text.toLowerCase();
  for (const color of COLORS) {
    if (lower.includes(color)) return color;
  }
  return null;
}

function classifyProductType(description) {
  const lower = description.toLowerCase();

  // Rose variety check first (most specific)
  const sorted = Object.entries(ROSE_VARIETIES).sort((a, b) => b[0].length - a[0].length);
  for (const [variety, info] of sorted) {
    if (lower.includes(variety)) return { type: info.type, color: info.color, variety };
  }

  if (/miniature spray|mini spray/i.test(lower)) return { type: 'miniature spray roses', color: extractColor(lower), variety: null };
  if (/spray\s*rose/i.test(lower)) return { type: 'spray roses', color: extractColor(lower), variety: null };
  if (/garden\s*rose/i.test(lower)) return { type: 'garden roses', color: extractColor(lower), variety: null };
  if (/mini\s*carn|mint\s*carn|minicum/i.test(lower)) return { type: 'mini carnations', color: extractColor(lower), variety: null };
  if (/mini\s*gerb|germini/i.test(lower)) return { type: 'mini gerberas', color: extractColor(lower), variety: null };
  if (/asiatic/i.test(lower)) return { type: 'asiatic lilies', color: extractColor(lower), variety: null };
  if (/casablanca|stargazer|oriental\s*lil/i.test(lower)) return { type: 'oriental lilies', color: extractColor(lower), variety: null };
  if (/sorbonne/i.test(lower)) return { type: 'oriental lilies', color: 'pink', variety: 'sorbonne' };
  if (/hybrid\s*lil/i.test(lower)) return { type: 'hybrid lilies', color: extractColor(lower), variety: null };
  if (/calla/i.test(lower)) return { type: 'calla lilies', color: extractColor(lower), variety: null };
  if (/button\s*pom|kermit/i.test(lower)) return { type: 'button poms', color: extractColor(lower), variety: null };
  if (/daisy\s*(pom|mum)/i.test(lower)) return { type: 'daisy poms', color: extractColor(lower), variety: null };
  if (/spider\s*mum|fuji/i.test(lower)) return { type: 'spider mums', color: extractColor(lower), variety: null };

  // Broader product types (longest search term first)
  const sortedTypes = Object.entries(PRODUCT_TYPES)
    .sort((a, b) => Math.max(...b[1].searchTerms.map(t => t.length)) - Math.max(...a[1].searchTerms.map(t => t.length)));

  for (const [type, info] of sortedTypes) {
    for (const term of info.searchTerms) {
      if (lower.includes(term)) return { type, color: extractColor(lower), variety: null };
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

  // ---- Step 1: Rebuild catalog from recipe ingredients ----
  console.log('\n[1/3] Rebuilding flower catalog...');
  await client.query('DELETE FROM flower_aliases');
  await client.query('DELETE FROM ingredient_costs');
  await client.query('UPDATE recipe_ingredients SET flower_id = NULL, match_status = \'pending\', match_confidence = NULL');
  await client.query('DELETE FROM flower_catalog');

  const { rows: ingredients } = await client.query('SELECT DISTINCT ingredient_name, is_foliage FROM recipe_ingredients');
  console.log(`  Processing ${ingredients.length} unique ingredient names...`);

  const catalogEntries = new Map(); // canonical_name -> category
  for (const ing of ingredients) {
    const classification = classifyProductType(ing.ingredient_name);
    if (!classification) continue;
    const category = ing.is_foliage ? 'foliage' : (PRODUCT_TYPES[classification.type]?.category || 'flower');
    catalogEntries.set(classification.type, category);
  }

  // Batch insert catalog entries
  for (const [name, category] of catalogEntries) {
    await client.query(
      'INSERT INTO flower_catalog (canonical_name, category) VALUES ($1, $2) ON CONFLICT (canonical_name) DO NOTHING',
      [name, category]
    );
  }
  console.log(`  Created ${catalogEntries.size} catalog entries`);

  // ---- Step 2: Match recipe ingredients to catalog ----
  console.log('\n[2/3] Matching recipe ingredients to catalog...');
  const { rows: catalog } = await client.query('SELECT id, canonical_name FROM flower_catalog');
  const catalogMap = new Map(catalog.map(c => [c.canonical_name, c.id]));

  const { rows: allIngredients } = await client.query('SELECT id, ingredient_name, is_foliage FROM recipe_ingredients WHERE flower_id IS NULL');
  let matched = 0, unmatched = 0;

  // Group by product type to do fewer queries
  const byType = new Map(); // type -> [ingredient_id, ...]
  for (const ing of allIngredients) {
    const classification = classifyProductType(ing.ingredient_name);
    if (!classification || !catalogMap.has(classification.type)) { unmatched++; continue; }
    const flowerId = catalogMap.get(classification.type);
    if (!byType.has(flowerId)) byType.set(flowerId, []);
    byType.get(flowerId).push(ing.id);
  }

  // Batch update: one query per catalog type
  for (const [flowerId, ids] of byType) {
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

  // Group by (flower_id, vendor_id) for batch alias inserts
  const aliasRows = [];
  const costRows = [];
  let liMatched = 0, liUnmatched = 0;

  for (const item of lineItems) {
    const classification = classifyProductType(item.description);
    if (!classification || !catalogMap.has(classification.type)) { liUnmatched++; continue; }
    const flowerId = catalogMap.get(classification.type);
    aliasRows.push([flowerId, item.description, item.vendor_id, 0.9]);
    const costValue = item.cost_per_stem ?? item.unit_price;
    if (costValue != null && Number(costValue) > 0) {
      costRows.push([flowerId, item.vendor_id, Number(costValue), 'stem', item.id, item.invoice_date]);
    }
    liMatched++;
  }

  // Batch insert aliases (100 at a time)
  const batchSize = 100;
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

  // Batch insert costs (100 at a time)
  for (let i = 0; i < costRows.length; i += batchSize) {
    const batch = costRows.slice(i, i + batchSize);
    const values = [];
    const placeholders = batch.map((_, j) => {
      const o = j * 6;
      values.push(...batch[j]);
      return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6})`;
    });
    await client.query(
      `INSERT INTO ingredient_costs (flower_id, vendor_id, unit_cost, cost_per, source_line_item_id, invoice_date) VALUES ${placeholders.join(',')}`,
      values
    );
  }

  console.log(`  Line items matched: ${liMatched}, unmatched: ${liUnmatched}`);
  console.log(`  Aliases created: ${aliasRows.length}, cost records: ${costRows.length}`);

  // ---- Summary ----
  const { rows: [stats] } = await client.query(`
    SELECT
      (SELECT COUNT(*) FROM flower_catalog) as catalog_entries,
      (SELECT COUNT(*) FROM recipe_ingredients WHERE flower_id IS NOT NULL) as ingredients_matched,
      (SELECT COUNT(*) FROM flower_aliases) as aliases,
      (SELECT COUNT(*) FROM ingredient_costs) as cost_records
  `);
  console.log(`\nDone. Catalog: ${stats.catalog_entries} entries, ${stats.ingredients_matched} ingredients matched, ${stats.aliases} aliases, ${stats.cost_records} cost records`);

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

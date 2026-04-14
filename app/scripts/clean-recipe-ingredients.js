/**
 * Clean recipe_ingredients data:
 *   1. Split multi-ingredient rows (>60 chars with embedded quantities)
 *   2. Merge line-break splits (color + flower type, seeded + eucalyptus, etc.)
 *   3. Log standalone color orphans for manual review
 *
 * Usage:
 *   node scripts/clean-recipe-ingredients.js          # dry-run (default)
 *   node scripts/clean-recipe-ingredients.js --apply   # apply changes
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

const DRY_RUN = !process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// Known flower/foliage terms for splitting multi-ingredient rows
// ---------------------------------------------------------------------------
const KNOWN_STEMS = [
  // flowers
  'roses', 'rose', 'carnations', 'carnation', 'mini carnations', 'mini carnation',
  'gerberas', 'gerbera', 'mini gerberas', 'sunflowers', 'sunflower',
  'tulips', 'tulip', 'lilies', 'lily', 'hydrangea', 'hydrangeas',
  'delphinium', 'snapdragons', 'snapdragon', 'stock', 'lisianthus',
  'alstroemeria', 'asters', 'aster', 'star of bethlehem',
  'spray roses', 'spray chrysanthemums', 'chrysanthemums',
  'daisy poms', 'button poms', 'cushion poms', 'spider mums', 'fuji mums',
  'hypericum', 'waxflower', 'solidago', 'statice', 'liatris',
  'freesia', 'iris', 'larkspur', 'ranunculus', 'anemone', 'peony', 'peonies',
  'orchid', 'orchids', 'protea', 'bells of ireland',
  'gypsophila', "baby's breath", 'babies breath', 'limonium',
  // foliage
  'eucalyptus', 'seeded eucalyptus', 'baby blue eucalyptus', 'silver dollar eucalyptus',
  'leather leaf', 'myrtle', 'ruscus', 'italian ruscus', 'israeli ruscus',
  'salal', 'pittosporum', 'variegated pittosporum', 'mini pittosporum',
  'sprengeri', 'tree fern', 'sword fern', 'ming fern',
  'ivy', 'galax', 'galax leaves', 'hosta leaves', 'aspidistra',
  'boxwood', 'cedar', 'holly', 'magnolia', 'magnolias', 'pine',
  'leland', 'noble', 'oregonia', 'curly willow', 'lily grass',
  'bupleurum', 'liriope',
  // preserved/dried
  'preserved baby eucalyptus',
];

// Non-flower items to flag
const NON_FLOWER = [
  'ribbon', 'bow', 'cones', 'branches', 'ornaments', 'wire', 'container',
  'pick', 'eyes', 'pipe cleaners', 'plastic', 'grass', 'nest', 'bark',
  'ting ting', 'balls', 'mesh', 'eggs', 'decoration', 'straw',
];

const COLORS = [
  'hot pink', 'light pink', 'pale pink', 'dusty pink', 'antique pink',
  'deep purple', 'dark orange', 'antique green', 'baby blue',
  'two tone pink and white',
  'red', 'white', 'pink', 'yellow', 'orange', 'purple', 'lavender',
  'blue', 'fuchsia', 'coral', 'peach', 'green', 'ivory', 'copper',
  'bronze', 'burgundy', 'cream', 'black', 'silver', 'gold',
];

// ---------------------------------------------------------------------------
// 1. Split multi-ingredient rows
// ---------------------------------------------------------------------------
function splitMultiIngredient(text) {
  // Try to parse patterns like: "white carnations 6 star of bethlehem 4 ..."
  // Strategy: find all [color?] [known_stem] patterns, extract qty if a number precedes or follows
  const lower = text.toLowerCase();
  const parts = [];

  // Sort known stems longest first so "mini carnations" matches before "carnations"
  const sortedStems = [...KNOWN_STEMS].sort((a, b) => b.length - a.length);

  let remaining = lower;
  const found = [];

  // First pass: find all known stems and their positions
  for (const stem of sortedStems) {
    let idx = remaining.indexOf(stem);
    while (idx !== -1) {
      // Check it's not part of a longer already-found match
      const alreadyCovered = found.some(f => idx >= f.start && idx < f.end);
      // Check word boundaries to avoid "Easter" matching "aster"
      const charBefore = idx > 0 ? remaining[idx - 1] : ' ';
      const charAfter = idx + stem.length < remaining.length ? remaining[idx + stem.length] : ' ';
      const isWordBound = /[\s,;(]/.test(charBefore) || idx === 0;
      const isWordEnd = /[\s,;)]/.test(charAfter) || idx + stem.length === remaining.length;
      if (!alreadyCovered && isWordBound && isWordEnd) {
        found.push({ stem, start: idx, end: idx + stem.length });
      }
      idx = remaining.indexOf(stem, idx + 1);
    }
  }

  // Sort by position
  found.sort((a, b) => a.start - b.start);

  // Remove overlapping matches (keep longest)
  const deduped = [];
  for (const f of found) {
    const overlaps = deduped.some(d =>
      (f.start >= d.start && f.start < d.end) || (f.end > d.start && f.end <= d.end)
    );
    if (!overlaps) deduped.push(f);
  }

  if (deduped.length <= 1) return null; // Not a multi-ingredient row

  for (const match of deduped) {
    // Look for a color before the stem
    let color = null;
    const beforeStem = lower.substring(0, match.start).trim();
    for (const c of COLORS) {
      if (beforeStem.endsWith(c)) {
        color = c;
        break;
      }
    }

    // Look for a quantity: number right AFTER the stem (this is the natural
    // position in "white carnations 6 star of bethlehem 4" format)
    let qty = null;
    const textAfter = lower.substring(match.end).trim();
    const qtyAfterMatch = textAfter.match(/^(\d+)/);
    if (qtyAfterMatch) {
      qty = parseInt(qtyAfterMatch[1], 10);
    } else {
      // Fallback: number right before the color/stem
      const colorOrStemStart = color ? match.start - color.length - 1 : match.start;
      const textBefore = lower.substring(0, colorOrStemStart).trim();
      const qtyBeforeMatch = textBefore.match(/(\d+)\s*$/);
      if (qtyBeforeMatch) qty = parseInt(qtyBeforeMatch[1], 10);
    }

    const ingredientName = color ? `${color} ${match.stem}` : match.stem;
    const isFlower = !NON_FLOWER.some(nf => match.stem.includes(nf));

    parts.push({
      ingredient_name: ingredientName,
      quantity: qty,
      is_flower: isFlower ? 1 : 0,
      is_foliage: isFlowerOrFoliage(match.stem) === 'foliage' ? 1 : 0,
    });
  }

  // Also capture non-flower items from the remaining text
  const coveredRanges = deduped.map(d => [d.start, d.end]);
  let uncovered = '';
  let pos = 0;
  for (const [start, end] of coveredRanges) {
    uncovered += lower.substring(pos, start) + ' ';
    pos = end;
  }
  uncovered += lower.substring(pos);
  // Clean up numbers and extra spaces from uncovered
  uncovered = uncovered.replace(/\d+/g, '').replace(/\s+/g, ' ').trim();

  // Parse non-flower items from uncovered text
  const nonFlowerItems = [];
  const nonFlowerPatterns = [
    'snow tipped cones', 'silver ribbon', 'silver branches',
    'gold ribbon', 'red ribbon', 'white ribbon', 'satin ribbon',
    'sheer ribbon', 'wired ribbon', 'polka dot ribbon',
    'dried mushroom decoration', 'bird nest', 'bark covered wire',
    'pine straw', 'christmas greens', 'seasonal evergreens',
  ];
  for (const pat of nonFlowerPatterns) {
    if (uncovered.includes(pat)) {
      nonFlowerItems.push({ ingredient_name: pat, quantity: null, is_flower: 0, is_foliage: 0 });
    }
  }

  return parts.length > 1 ? [...parts, ...nonFlowerItems] : null;
}

function isFlowerOrFoliage(stem) {
  const foliageTerms = [
    'eucalyptus', 'leather leaf', 'myrtle', 'ruscus', 'salal', 'pittosporum',
    'sprengeri', 'fern', 'ivy', 'galax', 'hosta', 'aspidistra', 'boxwood',
    'cedar', 'holly', 'magnolia', 'pine', 'noble', 'leland', 'oregonia',
    'curly willow', 'lily grass', 'bupleurum', 'liriope',
  ];
  return foliageTerms.some(f => stem.includes(f)) ? 'foliage' : 'flower';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(DRY_RUN ? '=== DRY RUN (pass --apply to commit changes) ===' : '=== APPLYING CHANGES ===');
  console.log();

  let splitCount = 0;
  let mergeCount = 0;
  let deleteCount = 0;
  let insertCount = 0;

  // -----------------------------------------------------------------------
  // STEP 1: Split multi-ingredient rows (>60 chars)
  // -----------------------------------------------------------------------
  console.log('--- STEP 1: Split multi-ingredient rows ---');
  const longRows = await client.query(
    'SELECT ri.id, ri.recipe_id, ri.ingredient_name, ri.quantity, ri.unit, ri.is_foliage, r.name as recipe_name FROM recipe_ingredients ri JOIN recipes r ON ri.recipe_id = r.id WHERE LENGTH(ri.ingredient_name) > 60 ORDER BY r.name'
  );

  for (const row of longRows.rows) {
    const parts = splitMultiIngredient(row.ingredient_name);
    if (!parts || parts.length <= 1) {
      console.log(`  SKIP (no split): [${row.recipe_name}] "${row.ingredient_name.substring(0, 80)}..."`);
      continue;
    }

    console.log(`  SPLIT: [${row.recipe_name}] "${row.ingredient_name.substring(0, 80)}..."`);
    for (const p of parts) {
      console.log(`    -> "${p.ingredient_name}" qty:${p.quantity} flower:${p.is_flower} foliage:${p.is_foliage}`);
    }

    if (!DRY_RUN) {
      // Delete original
      await client.query('DELETE FROM recipe_ingredients WHERE id = $1', [row.id]);
      deleteCount++;

      // Insert parts
      for (const p of parts) {
        await client.query(
          'INSERT INTO recipe_ingredients (recipe_id, ingredient_name, quantity, unit, is_foliage, match_status) VALUES ($1, $2, $3, $4, $5, $6)',
          [row.recipe_id, p.ingredient_name, p.quantity, 'stem', p.is_foliage, 'pending']
        );
        insertCount++;
      }
    }
    splitCount++;
  }
  console.log(`  ${splitCount} rows split\n`);

  // -----------------------------------------------------------------------
  // STEP 2: Merge line-break pairs
  // -----------------------------------------------------------------------
  console.log('--- STEP 2: Merge line-break splits ---');

  // 2a: "seeded" + "eucalyptus" -> "seeded eucalyptus"
  // 2b: "silver dollar" + "eucalyptus" -> "silver dollar eucalyptus"
  // 2c: "baby blue" + "eucalyptus" -> "baby blue eucalyptus"
  // 2d: color + flower type
  const mergePairs = await client.query(`
    SELECT a.id as id_a, a.recipe_id, a.ingredient_name as name_a, a.quantity as qty_a,
           b.id as id_b, b.ingredient_name as name_b, b.quantity as qty_b,
           r.name as recipe_name
    FROM recipe_ingredients a
    JOIN recipe_ingredients b ON a.recipe_id = b.recipe_id AND b.id = a.id + 1
    JOIN recipes r ON a.recipe_id = r.id
    WHERE (
      a.ingredient_name ~* $1
      AND b.ingredient_name ~* $2
    )
    OR (a.ingredient_name ~* '^seeded$' AND b.ingredient_name ~* '^eucalyptus$')
    OR (a.ingredient_name ~* 'silver dollar$' AND b.ingredient_name ~* '^eucalyptus$')
    OR (a.ingredient_name ~* 'baby blue$' AND b.ingredient_name ~* '^eucalyptus$')
    ORDER BY r.name, a.id
  `, [
    '(red|white|pink|blue|yellow|purple|green|orange|coral|dusty|hot pink|light pink|antique green|two tone pink and white|mini spray|spray|miniature)$',
    '^(roses?|carnations?|mums?|poms?|lil|gerber|daisy|daisies|snapdragon|delphinium|larkspur|hydrangea|stock|sunflower|aster|tulip|iris|orchid|chrysanthemum|ruscus|eucalyptus|fern)',
  ]);

  for (const pair of mergePairs.rows) {
    const merged = `${pair.name_a} ${pair.name_b}`;
    // Use qty from row A if it has one, otherwise row B
    const qty = pair.qty_a ?? pair.qty_b;

    console.log(`  MERGE: [${pair.recipe_name}] "${pair.name_a}" + "${pair.name_b}" => "${merged}" qty:${qty}`);

    if (!DRY_RUN) {
      // Update row A with merged name
      await client.query(
        'UPDATE recipe_ingredients SET ingredient_name = $1, quantity = $2, match_status = $3 WHERE id = $4',
        [merged, qty, 'pending', pair.id_a]
      );
      // Delete row B
      await client.query('DELETE FROM recipe_ingredients WHERE id = $1', [pair.id_b]);
      deleteCount++;
    }
    mergeCount++;
  }
  console.log(`  ${mergeCount} pairs merged\n`);

  // -----------------------------------------------------------------------
  // STEP 3: Log standalone color orphans (not auto-fixed)
  // -----------------------------------------------------------------------
  console.log('--- STEP 3: Standalone color orphans (manual review needed) ---');
  const orphans = await client.query(`
    SELECT ri.id, ri.ingredient_name, ri.quantity, r.name as recipe_name,
      (SELECT b.ingredient_name FROM recipe_ingredients b WHERE b.recipe_id = ri.recipe_id AND b.id = ri.id + 1) as next_ingredient,
      (SELECT b.ingredient_name FROM recipe_ingredients b WHERE b.recipe_id = ri.recipe_id AND b.id = ri.id - 1) as prev_ingredient
    FROM recipe_ingredients ri
    JOIN recipes r ON ri.recipe_id = r.id
    WHERE ri.ingredient_name ~* '^(red|white|pink|yellow|blue|purple|green|orange|coral|peach|lavender|fuchsia|cream|dusty|hot pink|light pink)$'
    ORDER BY r.name
  `);

  // Filter out any that were already handled in step 2
  const mergedIds = new Set(mergePairs.rows.map(p => p.id_a));
  const remaining = orphans.rows.filter(o => !mergedIds.has(o.id));

  for (const o of remaining) {
    console.log(`  [${o.recipe_name}] "${o.ingredient_name}" qty:${o.quantity} | prev: "${o.prev_ingredient}" | next: "${o.next_ingredient}"`);
  }
  console.log(`  ${remaining.length} orphans need manual review\n`);

  // -----------------------------------------------------------------------
  // STEP 4: Fix standalone flower-type orphans (roses, lily, fern, carnation)
  // These are likely valid but need a check -- some may be line-break remnants
  // -----------------------------------------------------------------------
  console.log('--- STEP 4: Standalone flower words (likely valid but check) ---');
  const flowerOrphans = await client.query(`
    SELECT ri.id, ri.ingredient_name, ri.quantity, r.name as recipe_name,
      (SELECT b.ingredient_name FROM recipe_ingredients b WHERE b.recipe_id = ri.recipe_id AND b.id = ri.id - 1) as prev_ingredient
    FROM recipe_ingredients ri
    JOIN recipes r ON ri.recipe_id = r.id
    WHERE ri.ingredient_name ~* '^(roses?|carnations?|lily|fern)$'
      AND ri.quantity IS NULL
    ORDER BY r.name
  `);

  for (const o of flowerOrphans.rows) {
    console.log(`  [${o.recipe_name}] "${o.ingredient_name}" qty:${o.quantity} | prev: "${o.prev_ingredient}"`);
  }
  console.log(`  ${flowerOrphans.rows.length} standalone flower words (null qty, possibly broken)\n`);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('=== SUMMARY ===');
  console.log(`  Multi-ingredient rows split: ${splitCount}`);
  console.log(`  Line-break pairs merged: ${mergeCount}`);
  console.log(`  Rows deleted: ${deleteCount}`);
  console.log(`  Rows inserted: ${insertCount}`);
  console.log(`  Color orphans for manual review: ${remaining.length}`);
  console.log(`  Standalone flower words to check: ${flowerOrphans.rows.length}`);

  if (DRY_RUN) {
    console.log('\n  Run with --apply to commit these changes.');
  } else {
    console.log('\n  Changes committed to database.');
  }

  await client.end();
}

main().catch(err => { console.error(err); process.exit(1); });

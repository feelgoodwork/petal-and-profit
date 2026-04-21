/**
 * Phase 0 diagnostic: audit unmatched recipe_ingredients and line_items.
 *
 * Categorizes every unmatched row by suspected root cause so we can measure
 * the impact of each subsequent cleansing phase (dictionary expansion, orphan
 * merge, fuzzy matcher, Claude classifier, manual review).
 *
 * Usage:
 *   node scripts/audit-unmatched.js               # console summary
 *   node scripts/audit-unmatched.js --csv         # also write CSV to ./audit-output/
 *   node scripts/audit-unmatched.js --top 50      # show top N per category (default 20)
 */
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const WRITE_CSV = process.argv.includes('--csv');
const topIdx = process.argv.indexOf('--top');
const TOP_N = topIdx >= 0 ? parseInt(process.argv[topIdx + 1], 10) || 20 : 20;

const sql = neon(process.env.DATABASE_URL);

// --- Heuristic rules -----------------------------------------------------

// Supplies / non-flower items masquerading as ingredients
const SUPPLY_PATTERNS = [
  /\bfoam\b/i, /\bcage\b/i, /\btape\b/i, /\bteepee\b/i, /\bpick\b/i,
  /\bwire\b/i, /\bmesh\b/i, /\bribbon\b/i, /\bcard\b/i, /\bbow\b/i,
];

// Misspellings we already know about. Value is the correct term.
const KNOWN_TYPOS = {
  'soliago': 'solidago',
  'solidgo': 'solidago',
  'delphinum': 'delphinium',
  'liatrus': 'liatris',
  'liatrice': 'liatris',
  'springeri': 'sprengeri',
  'alstromeria': 'alstroemeria',
  'alastromeria': 'alstroemeria',
};

// Standalone color/adjective/fragment tokens that should never be ingredients
// on their own (they're the leftovers of PDF line-break splits).
const ORPHAN_FRAGMENTS = new Set([
  'variegated', 'leaf', 'leaves', 'grass', 'foliage', 'greens',
  'dusty', 'blue', 'green', 'red', 'white', 'pink', 'purple',
  'yellow', 'orange', 'lavender', 'peach', 'coral', 'cream',
  'seeded', 'hot', 'light', 'pale', 'dark', 'antique', 'deep',
  'mini', 'standard', 'small', 'large', 'medium',
]);

// Real flowers/foliage the classifier doesn't know about yet.
// (substring match on lowercased name)
const DICTIONARY_GAPS = [
  'bells of ireland', 'ivy', 'aspidistra', 'galax', 'bupleurum', 'jade',
  'sword fern', 'lily grass', 'huckleberry', 'hosta', 'curly willow',
  'dusty miller', 'star of bethlehem', 'leucadendron', 'dianthus',
  'astilbe', 'bird of paradise', 'dendrobium', 'peony', 'peonies',
  'celosia', 'monte casino', 'safari sunset', 'boxwood', 'magnolia',
  'holly', 'cedar', 'pine', 'oregonia', 'liriope', 'italian ruscus',
  'israeli ruscus', 'queen anne', "queen anne's lace",
];

function categorize(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return 'empty';
  const lower = trimmed.toLowerCase();
  const words = lower.split(/\s+/);

  // 1. Non-flower supplies
  for (const p of SUPPLY_PATTERNS) {
    if (p.test(lower)) return 'non_flower_supply';
  }

  // 2. Known typos
  for (const typo of Object.keys(KNOWN_TYPOS)) {
    if (lower.includes(typo)) return 'typo';
  }

  // 3. Orphan fragment: single adjective/color/noun stub
  if (words.length === 1 && ORPHAN_FRAGMENTS.has(lower)) return 'orphan_fragment';
  // Unclosed quote (e.g. `lavender 'Monte`)
  const quoteCount = (trimmed.match(/['"‘’“”]/g) || []).length;
  if (quoteCount % 2 === 1) return 'orphan_fragment';

  // 4. Generic "lily/lilies" without a subtype qualifier
  if (/\blil(y|ies)\b/.test(lower) &&
      !/asiatic|oriental|hybrid|calla|casablanca|stargazer|sorbonne/.test(lower)) {
    return 'generic_lily';
  }

  // 5. Dictionary gap (real flower/foliage we don't track)
  for (const k of DICTIONARY_GAPS) {
    if (lower.includes(k)) return 'dictionary_gap';
  }

  // 6. Everything else
  return 'long_tail';
}

// --- Data fetch ----------------------------------------------------------

async function fetchUnmatchedRecipeIngredients() {
  // Exclude rows flagged as 'non_ingredient' (supplies the rebuild script
  // intentionally skips) so they don't inflate the unmatched count.
  return await sql`
    SELECT
      ingredient_name,
      COUNT(*)::int AS occurrences,
      COUNT(DISTINCT recipe_id)::int AS distinct_recipes,
      BOOL_OR(is_foliage = 1) AS any_foliage
    FROM recipe_ingredients
    WHERE flower_id IS NULL
      AND COALESCE(match_status, 'pending') <> 'non_ingredient'
    GROUP BY ingredient_name
    ORDER BY COUNT(*) DESC
  `;
}

async function fetchUnmatchedLineItems() {
  return await sql`
    SELECT
      li.description AS ingredient_name,
      COUNT(*)::int AS occurrences,
      COUNT(DISTINCT li.receipt_id)::int AS distinct_receipts
    FROM line_items li
    JOIN receipts r ON li.receipt_id = r.id
    WHERE li.is_flower = 1
    AND NOT EXISTS (
      SELECT 1 FROM flower_aliases fa
      WHERE fa.alias = li.description AND fa.vendor_id = r.vendor_id
    )
    GROUP BY li.description
    ORDER BY COUNT(*) DESC
  `;
}

async function fetchCaseVariantStats() {
  return await sql`
    SELECT
      LOWER(ingredient_name) AS low_name,
      COUNT(DISTINCT ingredient_name)::int AS variants,
      SUM(CASE WHEN flower_id IS NULL THEN 1 ELSE 0 END)::int AS unmatched_rows
    FROM recipe_ingredients
    GROUP BY LOWER(ingredient_name)
    HAVING COUNT(DISTINCT ingredient_name) > 1
    ORDER BY unmatched_rows DESC
  `;
}

async function fetchRecipeIngredientTotal() {
  const [row] = await sql`SELECT COUNT(*)::int AS n FROM recipe_ingredients`;
  return row.n;
}

async function fetchLineItemTotal() {
  const [row] = await sql`SELECT COUNT(*)::int AS n FROM line_items WHERE is_flower = 1`;
  return row.n;
}

// --- Rendering -----------------------------------------------------------

const CATEGORY_ORDER = [
  'dictionary_gap',
  'generic_lily',
  'orphan_fragment',
  'typo',
  'non_flower_supply',
  'long_tail',
  'empty',
];

const CATEGORY_LABELS = {
  dictionary_gap:    'Dictionary gap (real flower/foliage not in classifier)',
  generic_lily:      'Generic "lily/lilies" with no subtype qualifier',
  orphan_fragment:   'Orphan fragment (PDF line-break split residue)',
  typo:              'Known typo',
  non_flower_supply: 'Non-flower supply miscategorized',
  long_tail:         'Long tail (obscure, one-offs, or genuine unknowns)',
  empty:             'Empty / whitespace-only name',
};

function summarize(rows) {
  const buckets = {};
  for (const cat of CATEGORY_ORDER) buckets[cat] = { rows: [], totalOccurrences: 0 };
  for (const row of rows) {
    const cat = categorize(row.ingredient_name);
    buckets[cat].rows.push({ ...row, category: cat });
    buckets[cat].totalOccurrences += row.occurrences;
  }
  return buckets;
}

function pad(s, n) { return String(s).padEnd(n); }

function printBucketSummary(label, buckets, totalDistinct, totalOccurrences) {
  console.log(`\n=== ${label} ===`);
  console.log(`Distinct names: ${totalDistinct} | Total unmatched rows: ${totalOccurrences}`);
  console.log('');
  console.log(pad('Category', 58), pad('Distinct', 10), pad('Rows', 8), 'Share');
  console.log('-'.repeat(90));
  for (const cat of CATEGORY_ORDER) {
    const b = buckets[cat];
    if (b.rows.length === 0) continue;
    const pct = ((b.totalOccurrences / totalOccurrences) * 100).toFixed(1) + '%';
    console.log(
      pad(CATEGORY_LABELS[cat], 58),
      pad(b.rows.length, 10),
      pad(b.totalOccurrences, 8),
      pct,
    );
  }
}

function printTopExamples(label, buckets) {
  console.log(`\n--- Top ${TOP_N} per category: ${label} ---`);
  for (const cat of CATEGORY_ORDER) {
    const b = buckets[cat];
    if (b.rows.length === 0) continue;
    console.log(`\n[${cat}] ${CATEGORY_LABELS[cat]} (${b.rows.length} distinct, ${b.totalOccurrences} rows)`);
    for (const row of b.rows.slice(0, TOP_N)) {
      console.log(`  ${pad(row.occurrences, 5)} ${row.ingredient_name}`);
    }
  }
}

function writeCsv(label, buckets) {
  const dir = path.join(__dirname, 'audit-output');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = path.join(dir, `unmatched-${label}-${stamp}.csv`);
  const header = 'category,ingredient_name,occurrences\n';
  const lines = [];
  for (const cat of CATEGORY_ORDER) {
    for (const row of buckets[cat].rows) {
      const name = String(row.ingredient_name).replace(/"/g, '""');
      lines.push(`${cat},"${name}",${row.occurrences}`);
    }
  }
  fs.writeFileSync(file, header + lines.join('\n'));
  console.log(`\nCSV written: ${file}`);
}

// --- Main ----------------------------------------------------------------

(async () => {
  console.log('Phase 0 audit of unmatched data\n');

  const [recipeRows, lineItemRows, caseVariants, totalRecipeIng, totalLineItems] = await Promise.all([
    fetchUnmatchedRecipeIngredients(),
    fetchUnmatchedLineItems(),
    fetchCaseVariantStats(),
    fetchRecipeIngredientTotal(),
    fetchLineItemTotal(),
  ]);

  // ---- Recipe ingredients ----
  const recipeBuckets = summarize(recipeRows);
  const recipeDistinct = recipeRows.length;
  const recipeOccurrences = recipeRows.reduce((s, r) => s + r.occurrences, 0);
  const recipeUnmatchedPct = ((recipeOccurrences / totalRecipeIng) * 100).toFixed(1);

  console.log(`Recipe ingredients total: ${totalRecipeIng} | unmatched: ${recipeOccurrences} (${recipeUnmatchedPct}%)`);
  printBucketSummary('RECIPE INGREDIENTS', recipeBuckets, recipeDistinct, recipeOccurrences);
  printTopExamples('RECIPE INGREDIENTS', recipeBuckets);

  // ---- Line items ----
  const lineBuckets = summarize(lineItemRows);
  const lineDistinct = lineItemRows.length;
  const lineOccurrences = lineItemRows.reduce((s, r) => s + r.occurrences, 0);
  const lineUnmatchedPct = ((lineOccurrences / totalLineItems) * 100).toFixed(1);

  console.log(`\n\nLine items total (is_flower=1): ${totalLineItems} | unmatched: ${lineOccurrences} (${lineUnmatchedPct}%)`);
  printBucketSummary('LINE ITEMS', lineBuckets, lineDistinct, lineOccurrences);
  printTopExamples('LINE ITEMS', lineBuckets);

  // ---- Case variants artifact ----
  console.log(`\n\n=== Case-variant duplicates (same name, different casing) ===`);
  console.log(`${caseVariants.length} groups produce redundant rows the classifier treats as distinct.`);
  if (caseVariants.length > 0) {
    console.log(`Top 10:`);
    for (const v of caseVariants.slice(0, 10)) {
      console.log(`  ${pad(v.unmatched_rows, 5)} unmatched rows across ${v.variants} variants of "${v.low_name}"`);
    }
  }

  if (WRITE_CSV) {
    writeCsv('recipe-ingredients', recipeBuckets);
    writeCsv('line-items', lineBuckets);
  }

  // ---- Baseline snapshot ----
  console.log('\n\n=== Phase 0 baseline (save these numbers to compare against after each phase) ===');
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    recipe_ingredients: {
      total: totalRecipeIng,
      unmatched_rows: recipeOccurrences,
      unmatched_distinct: recipeDistinct,
      unmatched_pct: Number(recipeUnmatchedPct),
      by_category: Object.fromEntries(
        CATEGORY_ORDER.map(c => [c, {
          distinct: recipeBuckets[c].rows.length,
          rows: recipeBuckets[c].totalOccurrences,
        }])
      ),
    },
    line_items: {
      total: totalLineItems,
      unmatched_rows: lineOccurrences,
      unmatched_distinct: lineDistinct,
      unmatched_pct: Number(lineUnmatchedPct),
      by_category: Object.fromEntries(
        CATEGORY_ORDER.map(c => [c, {
          distinct: lineBuckets[c].rows.length,
          rows: lineBuckets[c].totalOccurrences,
        }])
      ),
    },
    case_variant_groups: caseVariants.length,
  }, null, 2));
})();

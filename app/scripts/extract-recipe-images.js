/**
 * Extract recipe images from the all-categories PDF.
 *
 * Approach: fixed quadrant crops (2x2 grid) + Claude Vision to identify
 * which recipe name is in each position.
 *
 * Usage:
 *   node scripts/extract-recipe-images.js              # all pages
 *   node scripts/extract-recipe-images.js --page=1     # single page
 *   node scripts/extract-recipe-images.js --dry-run    # preview only
 */
const { fromPath } = require('pdf2pic');
const sharp = require('sharp');
const Anthropic = require('@anthropic-ai/sdk').default;
const { Client } = require('pg');
const Fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const PAGE_ARG = process.argv.find(a => a.startsWith('--page='));
const SINGLE_PAGE = PAGE_ARG ? parseInt(PAGE_ARG.split('=')[1]) : null;

const PDF_PATH = path.join(
  process.env.GDRIVE_DATA_PATH,
  'recipes/Copy of all-categories.pdf'
);
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'recipes');
const TEMP_DIR = '/tmp/recipe-images';

// Fixed crop regions for the 2x2 grid (percentages of page)
// Each crop captures the product photo area for that quadrant
const QUADRANTS = [
  { pos: 'TL', left: 0.20, top: 0.02, width: 0.30, height: 0.44 },
  { pos: 'TR', left: 0.68, top: 0.02, width: 0.30, height: 0.44 },
  { pos: 'BL', left: 0.20, top: 0.48, width: 0.30, height: 0.44 },
  { pos: 'BR', left: 0.68, top: 0.48, width: 0.30, height: 0.44 },
];

function matchRecipe(name, recipes, fuse) {
  const searchName = name.trim();
  if (!searchName) return null;

  // Exact (case-insensitive)
  const exact = recipes.find(r => r.name.toLowerCase() === searchName.toLowerCase());
  if (exact) return exact.id;

  // Substring
  const sub = recipes.find(r =>
    r.name.toLowerCase().includes(searchName.toLowerCase()) ||
    searchName.toLowerCase().includes(r.name.toLowerCase())
  );
  if (sub) return sub.id;

  // Fuzzy
  const results = fuse.search(searchName);
  if (results.length > 0 && results[0].score < 0.35) return results[0].item.id;

  return null;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const anthropic = new Anthropic();
  const client = new Client({ connectionString: process.env.DATABASE_URL, keepAlive: true });
  await client.connect();

  const { rows: recipes } = await client.query('SELECT id, name FROM recipes');
  const fuse = new Fuse(recipes, { keys: ['name'], threshold: 0.35, includeScore: true });
  console.log('Recipes loaded:', recipes.length);

  const converter = fromPath(PDF_PATH, {
    density: 300, saveFilename: 'page', savePath: TEMP_DIR,
    format: 'png', width: 2400, height: 3100,
  });

  // Find total pages
  let totalPages = SINGLE_PAGE || 1;
  if (!SINGLE_PAGE) {
    let lo = 1, hi = 300;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      try {
        await converter(mid, { responseType: 'image' });
        lo = mid;
      } catch { hi = mid - 1; }
    }
    totalPages = lo;
  }
  console.log('Total pages:', totalPages);

  let totalExtracted = 0;
  let totalMatched = 0;
  let totalSkipped = 0;
  const startPage = SINGLE_PAGE || 1;
  const endPage = SINGLE_PAGE || totalPages;

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    process.stdout.write(`Page ${pageNum}/${endPage}... `);

    let pagePath;
    try {
      const result = await converter(pageNum, { responseType: 'image' });
      pagePath = result.path;
    } catch {
      console.log('SKIP (conversion failed)');
      continue;
    }

    const pageBuffer = fs.readFileSync(pagePath);
    const base64 = pageBuffer.toString('base64');
    const meta = await sharp(pagePath).metadata();

    // Ask Claude Vision for the recipe names in each quadrant position
    let positions;
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
            { type: 'text', text: `This page from a florist catalog has a 2x2 grid of flower arrangements. Return ONLY a JSON object with the recipe name (the teal/green italic title) in each position. If a position has no recipe, use null.

{"TL": "Recipe Name", "TR": "Recipe Name", "BL": "Recipe Name", "BR": "Recipe Name"}

Return ONLY the JSON, no other text.` }
          ]
        }]
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { console.log('SKIP (no JSON)'); continue; }
      positions = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log('SKIP (vision: ' + e.message + ')');
      continue;
    }

    let pageMatched = 0;

    for (const q of QUADRANTS) {
      const recipeName = positions[q.pos];
      if (!recipeName) continue;
      totalExtracted++;

      const recipeId = matchRecipe(recipeName, recipes, fuse);
      if (!recipeId) { totalSkipped++; continue; }

      const outPath = path.join(OUTPUT_DIR, `${recipeId}.jpg`);
      if (fs.existsSync(outPath)) continue; // Already have it

      if (DRY_RUN) {
        console.log(`  ${q.pos}: "${recipeName}" => recipe ${recipeId}`);
        pageMatched++; totalMatched++;
        continue;
      }

      try {
        const l = Math.round(q.left * meta.width);
        const t = Math.round(q.top * meta.height);
        const w = Math.round(q.width * meta.width);
        const h = Math.round(q.height * meta.height);

        await sharp(pagePath)
          .extract({ left: l, top: t, width: w, height: h })
          .resize(425, 425, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(outPath);

        pageMatched++;
        totalMatched++;
      } catch {
        totalSkipped++;
      }
    }

    console.log(`${Object.values(positions).filter(Boolean).length} recipes, ${pageMatched} saved`);

    try { fs.unlinkSync(pagePath); } catch {}

    // Rate limit
    if (pageNum < endPage) await new Promise(r => setTimeout(r, 300));
  }

  // Update DB
  if (!DRY_RUN && totalMatched > 0) {
    await client.query('ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT');
    const imageFiles = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.jpg'));
    let updated = 0;
    for (const f of imageFiles) {
      const recipeId = parseInt(f.replace('.jpg', ''));
      if (!isNaN(recipeId)) {
        await client.query('UPDATE recipes SET image_url = $1 WHERE id = $2', [`/recipes/${f}`, recipeId]);
        updated++;
      }
    }
    console.log('\nUpdated image_url for', updated, 'recipes');
  }

  console.log('\n=== Summary ===');
  console.log('Recipes found:', totalExtracted);
  console.log('Images saved:', totalMatched);
  console.log('Skipped:', totalSkipped);

  await client.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

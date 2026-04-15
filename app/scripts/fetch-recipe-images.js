/**
 * Fetch recipe images from Flower Shop Network CDN.
 * Uses item codes from sales data to look up product pages,
 * extracts the CDN image URL, and downloads the 425px JPG.
 *
 * Usage:
 *   node scripts/fetch-recipe-images.js              # all recipes
 *   node scripts/fetch-recipe-images.js --dry-run     # preview only
 *   node scripts/fetch-recipe-images.js --force        # re-download existing
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#][^=]*)=(.*)/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  }
}

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'recipes');
const sql = neon(process.env.DATABASE_URL);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks), headers: res.headers }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function extractImageUrl(itemCode) {
  // Fetch the FSN product page (slug doesn't matter, code is enough)
  const pageUrl = `https://www.flowershopnetwork.com/flower-pictures/${itemCode.toLowerCase()}/img/`;
  try {
    const { status, body } = await fetchUrl(pageUrl);
    if (status !== 200) return null;

    const html = body.toString('utf-8');

    // Look for CDN image URL with the item code
    const codeUpper = itemCode.toUpperCase();
    const codeLower = itemCode.toLowerCase();

    // Pattern: cdn.atwilltech.com/flowerdatabase/{letter}/{slug}-{CODE}.425.jpg
    const pattern425 = new RegExp(
      `https://cdn\\.atwilltech\\.com/flowerdatabase/[^"'\\s]+${itemCode}[^"'\\s]*\\.425\\.jpg`,
      'i'
    );
    const match425 = html.match(pattern425);
    if (match425) return match425[0];

    // Try any size with this code
    const patternAny = new RegExp(
      `https://cdn\\.atwilltech\\.com/flowerdatabase/[^"'\\s]+${itemCode}[^"'\\s]*\\.(\\d+)\\.jpg`,
      'i'
    );
    const matchAny = html.match(patternAny);
    if (matchAny) {
      // Replace size with 425
      return matchAny[0].replace(/\.\d+\.jpg$/, '.425.jpg');
    }

    // Fallback: any CDN image that looks like a product image (not a generic category image)
    const patternGeneric = /https:\/\/cdn\.atwilltech\.com\/flowerdatabase\/[^"'\s]+\.425\.jpg/i;
    const matchGeneric = html.match(patternGeneric);
    if (matchGeneric) return matchGeneric[0];

    return null;
  } catch {
    return null;
  }
}

async function downloadImage(url, destPath) {
  try {
    const { status, body, headers } = await fetchUrl(url);
    if (status !== 200) return false;
    const contentType = headers['content-type'] || '';
    if (!contentType.includes('image')) return false;
    fs.writeFileSync(destPath, body);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Get unique item codes mapped to recipes
  const rows = await sql`
    SELECT DISTINCT ON (s.item_code)
      s.item_code, s.recipe_id
    FROM sales s
    WHERE s.item_code IS NOT NULL
      AND s.recipe_id IS NOT NULL
      AND s.item_code ~ ${'^(VA|RO|SY|AO|PL|UTF|MOF)'}
    ORDER BY s.item_code, s.id DESC
  `;

  // Deduplicate by recipe_id (some recipes have multiple codes)
  const byRecipe = new Map();
  for (const r of rows) {
    if (!byRecipe.has(r.recipe_id)) {
      byRecipe.set(r.recipe_id, r.item_code);
    }
  }

  console.log(`Recipes with FSN codes: ${byRecipe.size}`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let alreadyExists = 0;
  let i = 0;

  for (const [recipeId, itemCode] of byRecipe) {
    i++;
    const outPath = path.join(OUTPUT_DIR, `${recipeId}.jpg`);

    // Skip if already exists (unless --force)
    if (!FORCE && fs.existsSync(outPath)) {
      const stat = fs.statSync(outPath);
      if (stat.size > 5000) { // Skip if file is reasonably sized (not a bad crop)
        alreadyExists++;
        continue;
      }
    }

    if (DRY_RUN) {
      process.stdout.write(`[${i}/${byRecipe.size}] ${itemCode} => recipe ${recipeId}\r`);
      continue;
    }

    // Extract CDN image URL from FSN product page
    const imageUrl = await extractImageUrl(itemCode);
    if (!imageUrl) {
      failed++;
      continue;
    }

    // Download image
    const ok = await downloadImage(imageUrl, outPath);
    if (ok) {
      downloaded++;
    } else {
      failed++;
    }

    if (i % 10 === 0) {
      process.stdout.write(`[${i}/${byRecipe.size}] ${downloaded} downloaded, ${failed} failed\r`);
    }

    // Rate limit: 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n\n=== Summary ===`);
  console.log(`Total recipes with FSN codes: ${byRecipe.size}`);
  console.log(`Already had images: ${alreadyExists}`);
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);

  // Update DB with image URLs
  if (!DRY_RUN && downloaded > 0) {
    await sql`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT`;
    const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.jpg'));
    for (const f of files) {
      const id = parseInt(f.replace('.jpg', ''));
      if (!isNaN(id)) {
        await sql`UPDATE recipes SET image_url = ${'/recipes/' + f} WHERE id = ${id}`;
      }
    }
    console.log(`Updated image_url for ${files.length} recipes`);
  }
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });

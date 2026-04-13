import fs from 'fs';

interface ParsedIngredient {
  ingredient_name: string;
  quantity: number | null;
  unit: string;
  is_foliage: boolean;
}

interface ParsedRecipe {
  name: string;
  sell_price: number;
  container: string;
  ingredients: ParsedIngredient[];
}

async function extractPdfPages(filePath: string): Promise<string[]> {
  const { extractText } = await import('unpdf');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const result = await extractText(data);
  return result.text as string[];
}

/**
 * Parse recipes from a page.
 *
 * Strategy: Use "Shown at USD $XX" as anchors.
 * - Lines before the first "Shown at" = category header + first recipe name
 * - Lines between two "Shown at" markers = previous recipe content + next recipe name
 * - Recipe name = the last line(s) before "Shown at" that look like a title
 *   (typically capitalized, not a number, not a flower/supply name)
 */
function parsePageRecipes(pageText: string, categoryName: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];
  const lines = pageText.split('\n').map(l => l.trim()).filter(Boolean);

  // Remove footer
  const footerIdx = lines.findIndex(l => l.includes("Milano's UpTowne Florist"));
  const cleanLines = footerIdx >= 0 ? lines.slice(0, footerIdx) : [...lines];

  // Remove category header
  if (cleanLines[0]?.toLowerCase() === categoryName.toLowerCase()) {
    cleanLines.shift();
  }

  // Find all "Shown at USD $XX" line indices
  const priceLines: Array<{ idx: number; price: number }> = [];
  for (let i = 0; i < cleanLines.length; i++) {
    const m = cleanLines[i].match(/^Shown at USD \$(\d+)/);
    if (m) priceLines.push({ idx: i, price: parseInt(m[1], 10) });
  }

  if (priceLines.length === 0) return recipes;

  for (let p = 0; p < priceLines.length; p++) {
    const priceIdx = priceLines[p].idx;
    const price = priceLines[p].price;

    // Determine recipe name: walk backward from the price line
    // The name is the contiguous block of "title-like" lines right before "Shown at"
    // A title line: doesn't start with a number (not an ingredient), isn't a supply/foliage,
    // doesn't look like a flower name continuation
    const prevBoundary = p > 0 ? priceLines[p - 1].idx + 1 : 0;
    let nameStart = priceIdx - 1;

    // Walk backward: recipe name lines are at the boundary between content and next recipe
    while (nameStart > prevBoundary) {
      const candidate = cleanLines[nameStart - 1];
      // Stop if this looks like recipe content (ingredient, supply, foliage, container)
      if (looksLikeContent(candidate)) break;
      nameStart--;
    }

    const name = cleanLines.slice(nameStart, priceIdx).join(' ').trim();

    // Determine content: lines after price until the name of the next recipe
    const nextNameStart = p < priceLines.length - 1
      ? findNextNameStart(cleanLines, priceLines[p + 1].idx, priceLines[p].idx + 1)
      : cleanLines.length;

    const contentLines = cleanLines.slice(priceIdx + 1, nextNameStart);

    // Parse content into container + ingredients
    const { container, ingredients } = parseContent(contentLines);

    if (name && price > 0) {
      recipes.push({ name, sell_price: price, container, ingredients });
    }
  }

  return recipes;
}

/**
 * Find where the next recipe's name starts (walking backward from its price line).
 */
function findNextNameStart(lines: string[], nextPriceIdx: number, minIdx: number): number {
  let nameStart = nextPriceIdx - 1;
  while (nameStart > minIdx) {
    const candidate = lines[nameStart - 1];
    if (looksLikeContent(candidate)) break;
    nameStart--;
  }
  return nameStart;
}

/**
 * Does this line look like recipe content (ingredient, supply, foliage, container)?
 * If so, it's NOT a recipe name.
 */
function looksLikeContent(line: string): boolean {
  // Starts with a number (ingredient with quantity, or container dimension)
  if (/^\d/.test(line)) return true;
  // Known supplies
  if (/^(wet floral foam|silver mesh ribbon|black ribbon|ribbon)/i.test(line)) return true;
  // Foliage line
  if (/^foliage:/i.test(line)) return true;
  // Known foliage name
  if (isFoliageName(line)) return true;
  // Known flower name that's clearly a continuation (lowercase start, known flower word)
  if (/^[a-z]/.test(line) && (isFlowerName(line) || isFlowerFragment(line))) return true;
  // Container line
  if (/(vase|basket|bowl|pail|jar|urn|pot|mug|cube|liner)/i.test(line) && /[""\u201C\u201D]/.test(line)) return true;
  // Starts with lowercase (likely continuation of previous line)
  if (/^[a-z]/.test(line)) return true;

  return false;
}

function isFlowerFragment(text: string): boolean {
  const lower = text.toLowerCase();
  const fragments = ['poms', 'roses', 'carnations', 'alstroemeria', 'delphinium',
    'aster', 'spray roses', 'button poms', 'daisy poms', 'spider mums',
    'berries', 'statice', 'caspia', 'vase'];
  return fragments.some(f => lower === f || lower.startsWith(f));
}

/**
 * Parse container and ingredients from content lines.
 */
function parseContent(lines: string[]): { container: string; ingredients: ParsedIngredient[] } {
  let container = '';
  const ingredients: ParsedIngredient[] = [];
  let i = 0;

  // Container is the first line if it has dimensions
  if (i < lines.length && looksLikeContainer(lines[i])) {
    container = lines[i];
    i++;
    // Container continuation
    while (i < lines.length && isContainerContinuation(lines[i])) {
      container += ' ' + lines[i];
      i++;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const remaining = lines.slice(i + 1);

    // Skip supplies
    if (/^(wet floral foam|silver mesh ribbon|black ribbon)/i.test(line)) { i++; continue; }

    // Foliage section
    if (/^foliage:/i.test(line)) {
      let foliageText = line.replace(/^foliage:\s*/i, '');
      // Continuation lines (lowercase, foliage names)
      while (i + 1 < lines.length && isFoliageContinuation(lines[i + 1], lines.slice(i + 2))) {
        i++;
        foliageText += ', ' + lines[i];
      }
      for (const item of foliageText.split(',').map(s => s.trim()).filter(Boolean)) {
        ingredients.push({ ingredient_name: item, quantity: null, unit: 'stem', is_foliage: true });
      }
      i++;
      continue;
    }

    // Standalone foliage (no number, recognized name)
    if (isFoliageName(line) && !/^\d/.test(line) &&
        !(remaining.length > 0 && /^Shown at USD/i.test(remaining[0]))) {
      ingredients.push({ ingredient_name: line, quantity: null, unit: 'stem', is_foliage: true });
      i++;
      continue;
    }

    // Ingredient with quantity
    const ingMatch = line.match(/^(\d+(?:\s+\d+\/\d+)?(?:-\d+)?)\s+(.+)$/);
    if (ingMatch) {
      let desc = ingMatch[2];
      // Handle line wraps
      while (i + 1 < lines.length && isIngredientWrap(lines[i + 1], lines.slice(i + 2))) {
        i++;
        desc += ' ' + lines[i];
      }
      const qty = parseFraction(ingMatch[1]);
      const cleanDesc = desc.replace(/^stems?\s+/i, '');
      ingredients.push({
        ingredient_name: cleanDesc,
        quantity: qty,
        unit: 'stem',
        is_foliage: isFoliageName(cleanDesc),
      });
      i++;
      continue;
    }

    // Standalone flower
    if (isFlowerName(line)) {
      ingredients.push({ ingredient_name: line, quantity: 1, unit: 'stem', is_foliage: false });
      i++;
      continue;
    }

    i++;
  }

  return { container, ingredients };
}

function looksLikeContainer(line: string): boolean {
  return (/[""\u201C\u201D]/.test(line) || /^\d/.test(line)) &&
    /(vase|basket|bowl|pail|jar|urn|pot|mug|cube|liner|bud vase)/i.test(line);
}

function isContainerContinuation(line: string): boolean {
  return !/^\d+\s+\w/.test(line) && !line.startsWith('foliage:') &&
    /(handle|liner|face|dots)/i.test(line);
}

function isFoliageContinuation(line: string, nextLines: string[]): boolean {
  if (/^\d/.test(line)) return false;
  if (line.startsWith('foliage:')) return false;
  if (/^Shown/i.test(line)) return false;
  if (nextLines.length > 0 && /^Shown at USD/i.test(nextLines[0])) return false;
  return isFoliageName(line) || /^[a-z]/.test(line);
}

function isIngredientWrap(line: string, nextLines: string[]): boolean {
  if (/^\d/.test(line)) return false;
  if (line.startsWith('foliage:')) return false;
  if (/^Shown at/i.test(line)) return false;
  if (/^(wet floral|silver mesh|black ribbon)/i.test(line)) return false;
  if (looksLikeContainer(line)) return false;
  // If next line is "Shown at USD", this line is part of a recipe name, not a wrap
  if (nextLines.length > 0 && /^Shown at USD/i.test(nextLines[0])) return false;
  // Lowercase start or known fragment = continuation
  return /^[a-z]/.test(line) || isFlowerFragment(line);
}

function parseFraction(str: string): number {
  if (str.includes('-') && !str.includes('/')) {
    const parts = str.split('-').map(Number);
    return parts.length === 2 ? (parts[0] + parts[1]) / 2 : parts[0];
  }
  const parts = str.trim().split(/\s+/);
  if (parts.length === 1) return parseFloat(parts[0]);
  const whole = parseInt(parts[0], 10);
  const fracMatch = parts[1]?.match(/(\d+)\/(\d+)/);
  if (fracMatch) return whole + parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
  return whole;
}

const FOLIAGE_KEYWORDS = [
  'pittosporum', 'sprengeri', 'springeri', 'myrtle', 'leather leaf', 'salal',
  'eucalyptus', 'seeded eucalyptus', 'aspidistra', 'tree fern', 'ming fern',
  'ruscus', 'curly willow', 'bupleurum', 'variegated',
];

function isFoliageName(text: string): boolean {
  const lower = text.toLowerCase();
  return FOLIAGE_KEYWORDS.some(f => lower.includes(f)) ||
    /^(foliage|greenery|fern|willow|eucalyptus)/i.test(text);
}

function isFlowerName(text: string): boolean {
  const lower = text.toLowerCase();
  const flowers = ['rose', 'lily', 'lilies', 'gerbera', 'carnation', 'delphinium', 'delphinum',
    'hydrangea', 'tulip', 'snapdragon', 'stock', 'alstroemeria', 'liatris', 'liatrice',
    'statice', 'solidago', 'hypericum', 'pom', 'aster', 'waxflower', 'gladiolus',
    'mum', 'daisy', 'barronia', 'limonium', 'privet', 'caspia', 'lotus'];
  return flowers.some(f => lower.includes(f));
}

export async function parseRecipePdf(filePath: string, categoryName: string): Promise<ParsedRecipe[]> {
  const pages = await extractPdfPages(filePath);
  const allRecipes: ParsedRecipe[] = [];
  for (const pageText of pages) {
    allRecipes.push(...parsePageRecipes(pageText, categoryName));
  }
  return allRecipes;
}

export function getCategoryFromFilename(filename: string): string {
  return filename
    .replace(/^Copy of\s+/, '')
    .replace(/-\d{4}-\d{2}-\d{2}-\d+\.pdf$/i, '')
    .trim();
}

export type { ParsedRecipe, ParsedIngredient };
export { extractPdfPages };

/**
 * Normalize flower names to product-type level.
 *
 * "Freedom Roses 70 CM" → type: "standard roses", variety: "freedom", color: "red"
 * "hot pink miniature spray roses" → type: "miniature spray roses", color: "hot pink"
 * "ROSE COLOR 60CMS GOTCHA HOT PINK" → type: "standard roses", variety: "gotcha", color: "hot pink"
 */

import { classifyProductType } from './variety-lookup';

export interface NormalizedName {
  original: string;
  productType: string | null;
  color: string | null;
  variety: string | null;
  size: string | null;
}

// Size patterns to extract (not strip - we keep for reference)
const SIZE_PATTERN = /(\d+)\s*(?:cm|CM|mm|MM)\b/;

export function normalizeName(name: string): NormalizedName {
  const original = name;

  // Extract size
  const sizeMatch = name.match(SIZE_PATTERN);
  const size = sizeMatch ? sizeMatch[0] : null;

  // Classify into product type
  const classification = classifyProductType(name);

  return {
    original,
    productType: classification?.type || null,
    color: classification?.color || null,
    variety: classification?.variety || null,
    size,
  };
}

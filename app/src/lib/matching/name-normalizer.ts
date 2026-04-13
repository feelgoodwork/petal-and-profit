import { classifyProductType } from './variety-lookup';

export interface NormalizedName {
  original: string;
  canonicalName: string | null;  // e.g. "red roses", "blue delphinium", "standard roses"
  baseType: string | null;       // e.g. "standard roses", "delphinium"
  color: string | null;
  variety: string | null;
  stemSizeCm: number | null;
}

const STEM_SIZE_PATTERN = /\b(\d{2,3})\s*(?:cm|CM)\b/;

export function normalizeName(name: string): NormalizedName {
  const sizeMatch = name.match(STEM_SIZE_PATTERN);
  const stemSizeCm = sizeMatch ? parseInt(sizeMatch[1], 10) : null;

  const cl = classifyProductType(name);

  return {
    original: name,
    canonicalName: cl?.canonicalName ?? null,
    baseType: cl?.baseType ?? null,
    color: cl?.color ?? null,
    variety: cl?.variety ?? null,
    stemSizeCm,
  };
}

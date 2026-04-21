/**
 * TypeScript-typed entry point for the product classifier.
 *
 * The actual data and logic live in classifier-data.js so both this module
 * (imported by the Next.js app) and the plain-Node rebuild-catalog.js script
 * can share a single source of truth. Do not duplicate classifier logic
 * here — edit classifier-data.js instead.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const data = require('./classifier-data.js') as {
  ROSE_VARIETIES: Record<string, { type: string; color: string }>;
  PRODUCT_TYPES: Record<string, { category: string; searchTerms: string[] }>;
  COLOR_MATTERS: Record<string, string>;
  COLORS: string[];
  isSupply: (description: string) => boolean;
  extractColor: (text: string) => string | null;
  buildCanonicalName: (baseType: string, color: string | null) => string;
  lookupVariety: (description: string) => { type: string; color: string; notes?: string } | null;
  classifyProductType: (description: string) => Classification | null;
};

export interface VarietyInfo {
  type: string;
  color: string;
  notes?: string;
}

export interface Classification {
  baseType: string;
  canonicalName: string;
  color: string | null;
  variety: string | null;
  category: string;
}

export const ROSE_VARIETIES: Record<string, VarietyInfo> = data.ROSE_VARIETIES;
export const PRODUCT_TYPES = data.PRODUCT_TYPES;

export const isSupply = data.isSupply;
export const extractColor = data.extractColor;
export const buildCanonicalName = data.buildCanonicalName;
export const lookupVariety = data.lookupVariety as (description: string) => VarietyInfo | null;
export const classifyProductType = data.classifyProductType;

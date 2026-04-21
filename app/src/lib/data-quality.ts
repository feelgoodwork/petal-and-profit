import fs from 'fs';
import path from 'path';

export interface DataQualityRules {
  version: number;
  updated_at?: string;
  notes?: string;
  typo_fixes: Record<string, { to: string; why?: string }>;
  not_a_flower_patterns: Array<{ pattern: string; why?: string }>;
  composite_ingredient_patterns: Array<{ pattern: string; why?: string }>;
  price_ceilings_per_stem: Record<string, number>;
  known_bunch_sizes: Record<string, number>;
}

let _cached: DataQualityRules | null = null;

function rulesPath(): string {
  // Works both in Next.js (cwd=app) and when scripts are invoked from app/.
  return path.join(process.cwd(), 'src', 'lib', 'data-quality-rules.json');
}

export function loadRules(): DataQualityRules {
  if (_cached) return _cached;
  const txt = fs.readFileSync(rulesPath(), 'utf-8');
  _cached = JSON.parse(txt) as DataQualityRules;
  return _cached;
}

/**
 * Per-base-type sanity ceiling. Falls back to _default when we don't have a
 * specific value for the base_type.
 */
export function priceCeilingFor(baseType: string | null | undefined): number {
  const r = loadRules();
  if (baseType && baseType in r.price_ceilings_per_stem) {
    return r.price_ceilings_per_stem[baseType];
  }
  return r.price_ceilings_per_stem._default ?? 15;
}

export function isNotAFlower(description: string): { match: true; why?: string } | { match: false } {
  const r = loadRules();
  for (const p of r.not_a_flower_patterns) {
    const re = new RegExp(p.pattern, 'i');
    if (re.test(description)) return { match: true, why: p.why };
  }
  return { match: false };
}

export function isComposite(description: string): { match: true; why?: string } | { match: false } {
  const r = loadRules();
  for (const p of r.composite_ingredient_patterns) {
    const re = new RegExp(p.pattern, 'i');
    if (re.test(description)) return { match: true, why: p.why };
  }
  return { match: false };
}

/**
 * Typo-fix a description using the rules file. Word-boundary replacements.
 * This is complementary to the smaller TYPO_FIXES hardcoded in
 * classifier-data.js; eventually the hardcoded list should drain to this file.
 */
export function applyTypoFixes(description: string): string {
  const r = loadRules();
  let out = description;
  for (const [typo, info] of Object.entries(r.typo_fixes)) {
    const re = new RegExp(`\\b${typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    out = out.replace(re, info.to);
  }
  return out;
}

/** For scripts that don't want to bring in the full DB helpers. */
export function __resetCache() {
  _cached = null;
}

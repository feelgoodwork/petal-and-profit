'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface IngredientMatch {
  truth: { ingredient_name: string; line_item_type: string | null; quantity: number | null } | null;
  ours: { ingredient_name: string; quantity: number | null; is_foliage: number } | null;
  match: 'exact' | 'fuzzy' | 'truth_only' | 'ours_only';
  similarity?: number;
  qty_match: boolean;
}

interface RecipeComparison {
  truth_name: string;
  our_name: string | null;
  our_id: number | null;
  name_match: 'exact' | 'fuzzy' | 'truth_only';
  name_similarity?: number;
  truth_ingredient_count: number;
  our_ingredient_count: number;
  exact_ingredient_matches: number;
  fuzzy_ingredient_matches: number;
  truth_only_ingredients: number;
  ours_only_ingredients: number;
  qty_mismatches: number;
  ingredients: IngredientMatch[];
}

interface Report {
  generated_at: string;
  truth_count: number;
  our_count: number;
  recipes: RecipeComparison[];
  ours_only_recipes: Array<{ id: number; name: string }>;
  summary: {
    arrangements_exact: number;
    arrangements_fuzzy: number;
    arrangements_truth_only: number;
    arrangements_ours_only: number;
    truth_ingredients_total: number;
    our_ingredients_total: number;
    ingredient_exact: number;
    ingredient_fuzzy: number;
    ingredient_truth_only: number;
    ingredient_ours_only: number;
    qty_mismatches: number;
  };
}

type Filter = 'all' | 'matched' | 'mismatches' | 'unmatched_truth' | 'unmatched_ours';

const NAME_BADGE: Record<RecipeComparison['name_match'], string> = {
  exact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fuzzy: 'bg-amber-50 text-amber-700 border-amber-200',
  truth_only: 'bg-rose-50 text-rose-700 border-rose-200',
};

const ING_ROW_COLOR: Record<IngredientMatch['match'], string> = {
  exact: 'text-stone-700',
  fuzzy: 'text-amber-700',
  truth_only: 'text-rose-700',
  ours_only: 'text-sky-700',
};

function pct(n: number, d: number): string {
  if (!d) return '0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default function RecipeTruthComparisonPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch('/api/admin/recipe-truth-comparison')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then(setReport)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const filteredRecipes = useMemo(() => {
    if (!report) return [];
    let rows = report.recipes;
    if (filter === 'matched') rows = rows.filter(r => r.name_match !== 'truth_only');
    if (filter === 'mismatches') rows = rows.filter(r => r.name_match !== 'truth_only' && (r.truth_only_ingredients + r.ours_only_ingredients + r.qty_mismatches) > 0);
    if (filter === 'unmatched_truth') rows = rows.filter(r => r.name_match === 'truth_only');
    if (filter === 'unmatched_ours') return [];
    if (search.trim()) {
      const s = search.toLowerCase();
      rows = rows.filter(r => r.truth_name.toLowerCase().includes(s) || (r.our_name?.toLowerCase().includes(s) ?? false));
    }
    return rows;
  }, [report, filter, search]);

  const oursOnlyFiltered = useMemo(() => {
    if (!report) return [];
    if (filter !== 'unmatched_ours' && filter !== 'all') return [];
    if (filter === 'all' && search.trim() === '') return report.ours_only_recipes;
    if (search.trim()) return report.ours_only_recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()));
    return report.ours_only_recipes;
  }, [report, filter, search]);

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (loading && !report) return <div className="p-8 text-stone-500">Loading…</div>;
  if (error) return <div className="p-8 text-rose-700">{error}</div>;
  if (!report) return null;

  const s = report.summary;
  const totalArrangements = s.arrangements_exact + s.arrangements_fuzzy + s.arrangements_truth_only;
  const totalMatchedIngs = s.ingredient_exact + s.ingredient_fuzzy;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Recipe Truth Comparison</h1>
        <p className="text-sm text-stone-500 mt-1">
          How our cleaned recipe data lines up with the FSN truth set ({report.truth_count} arrangements, {s.truth_ingredients_total} flower-like ingredients).
          Generated {new Date(report.generated_at).toLocaleString()}.
        </p>
      </div>

      {/* Scorecard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <ScoreCard label="Arrangements matched" value={`${s.arrangements_exact + s.arrangements_fuzzy} / ${report.truth_count}`} sub={`${pct(s.arrangements_exact + s.arrangements_fuzzy, report.truth_count)} coverage`} tone="emerald" />
        <ScoreCard label="Exact / fuzzy name" value={`${s.arrangements_exact} / ${s.arrangements_fuzzy}`} sub="strict vs close-match" tone="stone" />
        <ScoreCard label="Missing from ours" value={String(s.arrangements_truth_only)} sub="in truth, not in our DB" tone="rose" />
        <ScoreCard label="Extra in ours" value={String(s.arrangements_ours_only)} sub="in our DB, not in truth" tone="sky" />

        <ScoreCard label="Ingredients matched" value={`${totalMatchedIngs} / ${s.truth_ingredients_total}`} sub={`${pct(totalMatchedIngs, s.truth_ingredients_total)} coverage`} tone="emerald" />
        <ScoreCard label="Exact / fuzzy ingredient" value={`${s.ingredient_exact} / ${s.ingredient_fuzzy}`} sub="strict vs close-match" tone="stone" />
        <ScoreCard label="Missing ingredients" value={String(s.ingredient_truth_only)} sub="in truth, not in ours" tone="rose" />
        <ScoreCard label="Quantity mismatches" value={String(s.qty_mismatches)} sub="matched but qty disagrees" tone="amber" />
      </div>

      <div className="text-xs text-stone-500 mb-4">
        Comparison restricted to <code className="bg-stone-100 px-1 rounded">stem</code>, <code className="bg-stone-100 px-1 rounded">foliage</code>, <code className="bg-stone-100 px-1 rounded">filler flower</code>, and <code className="bg-stone-100 px-1 rounded">filler</code> line items per scope.
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {(
          [
            ['all', `All (${totalArrangements + s.arrangements_ours_only})`],
            ['matched', `Matched (${s.arrangements_exact + s.arrangements_fuzzy})`],
            ['mismatches', 'Matched w/ mismatches'],
            ['unmatched_truth', `Missing from ours (${s.arrangements_truth_only})`],
            ['unmatched_ours', `Extra in ours (${s.arrangements_ours_only})`],
          ] as Array<[Filter, string]>
        ).map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1 text-xs rounded-full border ${
              filter === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
            }`}>
            {label}
          </button>
        ))}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search arrangement name…"
          className="ml-auto px-3 py-1 text-sm border rounded-md w-64"
        />
      </div>

      {/* Recipe list */}
      <div className="space-y-2">
        {filteredRecipes.map(r => {
          const key = r.truth_name;
          const isExpanded = expanded.has(key);
          const hasIssues = r.truth_only_ingredients + r.ours_only_ingredients + r.qty_mismatches > 0;
          return (
            <Card key={key} className={r.name_match === 'truth_only' ? 'border-rose-200' : ''}>
              <CardContent className="py-3">
                <button onClick={() => toggle(key)} className="w-full text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={NAME_BADGE[r.name_match]}>
                      {r.name_match === 'exact' ? 'exact' : r.name_match === 'fuzzy' ? `fuzzy ${(r.name_similarity ?? 0).toFixed(2)}` : 'missing'}
                    </Badge>
                    <span className="font-medium text-stone-900">{r.truth_name}</span>
                    {r.our_name && r.our_name !== r.truth_name && (
                      <span className="text-xs text-stone-500">→ ours: {r.our_name}</span>
                    )}
                    <div className="ml-auto flex items-center gap-2 text-xs">
                      {r.name_match !== 'truth_only' && (
                        <>
                          <span className="text-stone-500">{r.exact_ingredient_matches + r.fuzzy_ingredient_matches}/{r.truth_ingredient_count} ings</span>
                          {r.truth_only_ingredients > 0 && <Badge variant="outline" className="text-rose-700 border-rose-200 bg-rose-50">−{r.truth_only_ingredients}</Badge>}
                          {r.ours_only_ingredients > 0 && <Badge variant="outline" className="text-sky-700 border-sky-200 bg-sky-50">+{r.ours_only_ingredients}</Badge>}
                          {r.qty_mismatches > 0 && <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50">qty×{r.qty_mismatches}</Badge>}
                          {!hasIssues && <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50">clean</Badge>}
                        </>
                      )}
                      <span className="text-stone-300">{isExpanded ? '▾' : '▸'}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && r.name_match !== 'truth_only' && (
                  <div className="mt-3 border-t pt-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-stone-500">
                          <th className="text-left font-normal pb-1 w-20">match</th>
                          <th className="text-left font-normal pb-1">truth</th>
                          <th className="text-right font-normal pb-1 w-12">qty</th>
                          <th className="text-left font-normal pb-1">ours</th>
                          <th className="text-right font-normal pb-1 w-12">qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.ingredients.map((ing, i) => (
                          <tr key={i} className={`${ING_ROW_COLOR[ing.match]} border-t border-stone-100`}>
                            <td className="py-1">
                              <span className="text-[10px] uppercase tracking-wide">
                                {ing.match}{ing.match === 'fuzzy' && ing.similarity ? ` ${ing.similarity.toFixed(2)}` : ''}
                              </span>
                            </td>
                            <td className="py-1">
                              {ing.truth ? (
                                <>
                                  {ing.truth.ingredient_name}
                                  {ing.truth.line_item_type && <span className="text-stone-400 text-[10px] ml-1">({ing.truth.line_item_type})</span>}
                                </>
                              ) : <span className="text-stone-300">—</span>}
                            </td>
                            <td className="py-1 text-right">{ing.truth?.quantity ?? ''}</td>
                            <td className="py-1">
                              {ing.ours ? (
                                <>
                                  {ing.ours.ingredient_name}
                                  {ing.ours.is_foliage ? <span className="text-stone-400 text-[10px] ml-1">(foliage)</span> : null}
                                </>
                              ) : <span className="text-stone-300">—</span>}
                            </td>
                            <td className={`py-1 text-right ${ing.match !== 'truth_only' && ing.match !== 'ours_only' && !ing.qty_match ? 'text-amber-700 font-medium' : ''}`}>
                              {ing.ours?.quantity ?? ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* "Extra in ours" list — only when filter says so */}
        {oursOnlyFiltered.length > 0 && (
          <Card className="border-sky-200 mt-6">
            <CardContent className="py-3">
              <h3 className="text-sm font-medium text-stone-900 mb-2">Extra arrangements in our DB ({oursOnlyFiltered.length})</h3>
              <p className="text-xs text-stone-500 mb-3">Recipe names in our DB that did not match any truth-set arrangement (even fuzzy). Many of these are likely parser noise — leftover headers, fragments, or stray characters that should have been merged.</p>
              <ul className="text-sm text-stone-700 space-y-0.5 max-h-96 overflow-y-auto">
                {oursOnlyFiltered.map(o => (
                  <li key={o.id} className="font-mono text-xs">{o.name}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ScoreCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: 'emerald' | 'rose' | 'sky' | 'stone' | 'amber' }) {
  const accents: Record<string, string> = {
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    sky: 'text-sky-700',
    stone: 'text-stone-700',
    amber: 'text-amber-700',
  };
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[10px] uppercase tracking-wider text-stone-400">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${accents[tone]}`}>{value}</div>
        <div className="text-[11px] text-stone-500 mt-0.5">{sub}</div>
      </CardContent>
    </Card>
  );
}

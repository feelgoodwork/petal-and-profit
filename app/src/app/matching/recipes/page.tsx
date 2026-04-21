'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Suggestion {
  id: number;
  recipe_id: number;
  recipe_name: string;
  ingredient_name: string;
  match_status: string | null;
  match_confidence: number | null;
  suggested_flower_id: number | null;
  suggested_canonical: string | null;
  suggested_category: string | null;
  siblings: string | null;
}

interface CatalogEntry {
  id: number;
  canonical_name: string;
  category: string;
  base_type: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  claude_suggested: 'Claude',
  fuzzy_suggested: 'Fuzzy',
  pending: 'Pending',
};

const STATUS_COLORS: Record<string, string> = {
  claude_suggested: 'text-purple-700 border-purple-300 bg-purple-50',
  fuzzy_suggested: 'text-blue-700 border-blue-300 bg-blue-50',
  pending: 'text-stone-600 border-stone-300 bg-stone-50',
};

export default function RecipeMatchingPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'claude_suggested' | 'fuzzy_suggested' | 'pending'>('all');
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, string>>({});

  async function fetchAll() {
    setLoading(true);
    try {
      const res = await fetch('/api/matching/recipes');
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data.suggestions);
        setCatalog(data.catalog);
      }
    } finally {
      setLoading(false);
    }
  }

  async function act(id: number, body: Record<string, unknown>) {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      await fetch('/api/matching/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ingredient_id: id }),
      });
      setSuggestions(prev => prev.filter(s => s.id !== id));
      setOverrides(prev => { const n = { ...prev }; delete n[id]; return n; });
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  async function confirmAllHighConfidence() {
    const toConfirm = visible.filter(s =>
      s.suggested_flower_id != null &&
      (s.match_confidence ?? 0) >= 0.85
    );
    for (const s of toConfirm) {
      await act(s.id, { action: 'confirm', flower_id: s.suggested_flower_id });
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const visible = useMemo(() => {
    if (filter === 'all') return suggestions;
    return suggestions.filter(s => (s.match_status ?? 'pending') === filter);
  }, [suggestions, filter]);

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = { all: suggestions.length };
    for (const s of suggestions) {
      const k = s.match_status ?? 'pending';
      counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [suggestions]);

  const catalogIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of catalog) m.set(c.canonical_name.toLowerCase(), c.id);
    return m;
  }, [catalog]);

  function findCatalogMatch(text: string): CatalogEntry | null {
    const lower = text.trim().toLowerCase();
    if (!lower) return null;
    const exactId = catalogIdByName.get(lower);
    if (exactId != null) return catalog.find(c => c.id === exactId) ?? null;
    return catalog.find(c => c.canonical_name.toLowerCase().startsWith(lower)) ?? null;
  }

  const highConfidenceCount = visible.filter(s =>
    s.suggested_flower_id != null && (s.match_confidence ?? 0) >= 0.85
  ).length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Recipe Ingredient Review</h1>
          <p className="text-sm text-stone-500 mt-1">
            {suggestions.length} rows awaiting review — confirm, override, or mark as non-ingredient.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAll} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {highConfidenceCount > 0 && (
            <Button onClick={confirmAllHighConfidence}>
              Confirm all ≥85% ({highConfidenceCount})
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'claude_suggested', 'fuzzy_suggested', 'pending'] as const).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1 text-xs rounded-full border ${
              filter === k ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
            }`}
          >
            {k === 'all' ? 'All' : (STATUS_LABELS[k] ?? k)} ({byStatus[k] ?? 0})
          </button>
        ))}
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">Nothing to review</p>
          <p className="text-sm">
            All recipe ingredients are matched, rejected, or marked as non-ingredient.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const busy = busyIds.has(s.id);
            const override = overrides[s.id] ?? '';
            const overrideMatch = override ? findCatalogMatch(override) : null;
            const statusKey = s.match_status ?? 'pending';
            const confidence = s.match_confidence ?? 0;
            return (
              <Card key={s.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={STATUS_COLORS[statusKey] ?? ''}>
                          {STATUS_LABELS[statusKey] ?? statusKey}
                          {confidence > 0 && ` · ${(confidence * 100).toFixed(0)}%`}
                        </Badge>
                        <span className="text-xs text-stone-400 truncate">
                          {s.recipe_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium text-stone-900">
                          {s.ingredient_name}
                        </p>
                        {s.suggested_canonical && (
                          <>
                            <span className="text-stone-300">→</span>
                            <p className="text-sm text-emerald-700">
                              {s.suggested_canonical}
                              <span className="text-stone-400 ml-1">({s.suggested_category})</span>
                            </p>
                          </>
                        )}
                      </div>
                      {s.siblings && (
                        <p className="text-xs text-stone-400 mt-1 truncate">
                          siblings: {s.siblings}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {s.suggested_flower_id != null && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => act(s.id, { action: 'confirm', flower_id: s.suggested_flower_id })}
                        >
                          Confirm
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => act(s.id, { action: 'reject' })}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => act(s.id, { action: 'mark_non_ingredient' })}
                        title="Mark as non-ingredient (supply, note, etc.)"
                      >
                        Not an ingredient
                      </Button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="text"
                      placeholder="Override with a different catalog entry…"
                      value={override}
                      onChange={(e) => setOverrides(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="h-8 text-xs max-w-xs"
                      list={`catalog-${s.id}`}
                    />
                    <datalist id={`catalog-${s.id}`}>
                      {catalog.map(c => (
                        <option key={c.id} value={c.canonical_name}>{c.category}</option>
                      ))}
                    </datalist>
                    {overrideMatch && (
                      <>
                        <span className="text-xs text-stone-400">
                          → <span className="text-emerald-700">{overrideMatch.canonical_name}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => act(s.id, { action: 'set', flower_id: overrideMatch.id })}
                        >
                          Set
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

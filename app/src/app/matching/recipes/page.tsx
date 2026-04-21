'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface RecipeSuggestion {
  id: number;
  recipe_id: number;
  recipe_name: string;
  category_name: string | null;
  source_file: string | null;
  ingredient_name: string;
  match_status: string | null;
  match_confidence: number | null;
  suggested_flower_id: number | null;
  suggested_canonical: string | null;
  suggested_category: string | null;
  siblings: string | null;
}

interface InvoiceSuggestion {
  id: number;
  description: string;
  receipt_id: number;
  receipt_file_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  unit_price: number | null;
  cost_per_stem: number | null;
  suggested_flower_id: number | null;
  suggested_canonical: string | null;
  suggested_category: string | null;
  is_supply: boolean;
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
  claude_matched: 'Claude ✓',
  fuzzy_matched: 'Fuzzy ✓',
};

const STATUS_COLORS: Record<string, string> = {
  claude_suggested: 'text-purple-700 border-purple-300 bg-purple-50',
  fuzzy_suggested: 'text-blue-700 border-blue-300 bg-blue-50',
  pending: 'text-stone-600 border-stone-300 bg-stone-50',
  claude_matched: 'text-emerald-700 border-emerald-300 bg-emerald-50',
  fuzzy_matched: 'text-emerald-700 border-emerald-300 bg-emerald-50',
};

type Mode = 'recipes' | 'invoices';

export default function ReviewPage() {
  const [mode, setMode] = useState<Mode>('recipes');

  const [recipeSuggestions, setRecipeSuggestions] = useState<RecipeSuggestion[]>([]);
  const [invoiceSuggestions, setInvoiceSuggestions] = useState<InvoiceSuggestion[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);

  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  async function fetchAll() {
    setLoading(true);
    try {
      const [recipeRes, invoiceRes] = await Promise.all([
        fetch('/api/matching/recipes'),
        fetch('/api/matching/line-items'),
      ]);
      if (recipeRes.ok) {
        const data = await recipeRes.json();
        setRecipeSuggestions(data.suggestions);
        setCatalog(data.catalog);
      }
      if (invoiceRes.ok) {
        const data = await invoiceRes.json();
        setInvoiceSuggestions(data.suggestions);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  const busyKey = (kind: Mode, id: number) => `${kind}-${id}`;

  async function actRecipe(id: number, body: Record<string, unknown>) {
    const key = busyKey('recipes', id);
    setBusyIds(prev => new Set(prev).add(key));
    try {
      await fetch('/api/matching/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, ingredient_id: id }),
      });
      setRecipeSuggestions(prev => prev.filter(s => s.id !== id));
      setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  async function actInvoice(id: number, body: Record<string, unknown>) {
    const key = busyKey('invoices', id);
    setBusyIds(prev => new Set(prev).add(key));
    try {
      await fetch('/api/matching/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, line_item_id: id }),
      });
      setInvoiceSuggestions(prev => prev.filter(s => s.id !== id));
      setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  async function confirmAllHighConfidenceRecipes() {
    const toConfirm = recipeSuggestions.filter(s =>
      s.suggested_flower_id != null && (s.match_confidence ?? 0) >= 0.85
    );
    for (const s of toConfirm) {
      await actRecipe(s.id, { action: 'confirm', flower_id: s.suggested_flower_id });
    }
  }

  async function confirmAllClassifiedInvoices() {
    // Invoice items have no pre-stored confidence; "high-confidence" here
    // means the classifier produced a catalog match directly (not a guess).
    const toConfirm = invoiceSuggestions.filter(s => s.suggested_flower_id != null && !s.is_supply);
    for (const s of toConfirm) {
      await actInvoice(s.id, { action: 'confirm', flower_id: s.suggested_flower_id });
    }
  }

  const catalogByLowerName = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(c.canonical_name.toLowerCase(), c);
    return m;
  }, [catalog]);

  function findCatalogMatch(text: string): CatalogEntry | null {
    const lower = text.trim().toLowerCase();
    if (!lower) return null;
    const exact = catalogByLowerName.get(lower);
    if (exact) return exact;
    return catalog.find(c => c.canonical_name.toLowerCase().startsWith(lower)) ?? null;
  }

  const recipeHighConf = recipeSuggestions.filter(s =>
    s.suggested_flower_id != null && (s.match_confidence ?? 0) >= 0.85
  ).length;

  const invoiceAutoMatchable = invoiceSuggestions.filter(s =>
    s.suggested_flower_id != null && !s.is_supply
  ).length;

  const totalQueue = recipeSuggestions.length + invoiceSuggestions.length;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Review Queue</h1>
          <p className="text-sm text-stone-500 mt-1">
            {totalQueue} total ({recipeSuggestions.length} recipe ingredients, {invoiceSuggestions.length} invoice lines)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchAll} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {mode === 'recipes' && recipeHighConf > 0 && (
            <Button onClick={confirmAllHighConfidenceRecipes}>
              Confirm recipes ≥85% ({recipeHighConf})
            </Button>
          )}
          {mode === 'invoices' && invoiceAutoMatchable > 0 && (
            <Button onClick={confirmAllClassifiedInvoices}>
              Confirm classifier-matched ({invoiceAutoMatchable})
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('recipes')}
          className={`px-4 py-2 text-sm rounded-md border ${
            mode === 'recipes' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
          }`}
        >
          Recipe ingredients ({recipeSuggestions.length})
        </button>
        <button
          onClick={() => setMode('invoices')}
          className={`px-4 py-2 text-sm rounded-md border ${
            mode === 'invoices' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
          }`}
        >
          Invoice line items ({invoiceSuggestions.length})
        </button>
      </div>

      {mode === 'recipes' ? (
        <RecipeList
          suggestions={recipeSuggestions}
          catalog={catalog}
          busyIds={busyIds}
          overrides={overrides}
          setOverrides={setOverrides}
          act={actRecipe}
          findCatalogMatch={findCatalogMatch}
        />
      ) : (
        <InvoiceList
          suggestions={invoiceSuggestions}
          catalog={catalog}
          busyIds={busyIds}
          overrides={overrides}
          setOverrides={setOverrides}
          act={actInvoice}
          findCatalogMatch={findCatalogMatch}
        />
      )}
    </div>
  );
}

interface RecipeListProps {
  suggestions: RecipeSuggestion[];
  catalog: CatalogEntry[];
  busyIds: Set<string>;
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  act: (id: number, body: Record<string, unknown>) => Promise<void>;
  findCatalogMatch: (text: string) => CatalogEntry | null;
}

function RecipeList({ suggestions, catalog, busyIds, overrides, setOverrides, act, findCatalogMatch }: RecipeListProps) {
  if (suggestions.length === 0) {
    return (
      <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
        <p className="text-lg mb-2">No recipe ingredients to review</p>
        <p className="text-sm">All recipes are matched, rejected, or marked as non-ingredient.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {suggestions.map(s => {
        const key = `recipes-${s.id}`;
        const busy = busyIds.has(key);
        const override = overrides[key] ?? '';
        const overrideMatch = override ? findCatalogMatch(override) : null;
        const statusKey = s.match_status ?? 'pending';
        const confidence = s.match_confidence ?? 0;
        return (
          <Card key={s.id}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge variant="outline" className={STATUS_COLORS[statusKey] ?? ''}>
                      {STATUS_LABELS[statusKey] ?? statusKey}
                      {confidence > 0 && ` · ${(confidence * 100).toFixed(0)}%`}
                    </Badge>
                    <Link
                      href={`/recipes/${s.recipe_id}`}
                      target="_blank"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      {s.recipe_name} ↗
                    </Link>
                    {s.category_name && (
                      <span className="text-xs text-stone-400">
                        · {s.category_name}
                        {s.source_file && ` · ${s.source_file}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-medium text-stone-900">{s.ingredient_name}</p>
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
                    <p className="text-xs text-stone-400 mt-1 line-clamp-1" title={s.siblings}>
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
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => act(s.id, { action: 'reject' })}>
                    Reject
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => act(s.id, { action: 'mark_non_ingredient' })}
                    title="Mark as non-ingredient (supply, note, etc.)">
                    Not an ingredient
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Override with a different catalog entry…"
                  value={override}
                  onChange={(e) => setOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                  className="h-8 text-xs max-w-xs"
                  list={`catalog-r-${s.id}`}
                />
                <datalist id={`catalog-r-${s.id}`}>
                  {catalog.map(c => (
                    <option key={c.id} value={c.canonical_name}>{c.category}</option>
                  ))}
                </datalist>
                {overrideMatch && (
                  <>
                    <span className="text-xs text-stone-400">
                      → <span className="text-emerald-700">{overrideMatch.canonical_name}</span>
                    </span>
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => act(s.id, { action: 'set', flower_id: overrideMatch.id })}>
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
  );
}

interface InvoiceListProps {
  suggestions: InvoiceSuggestion[];
  catalog: CatalogEntry[];
  busyIds: Set<string>;
  overrides: Record<string, string>;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  act: (id: number, body: Record<string, unknown>) => Promise<void>;
  findCatalogMatch: (text: string) => CatalogEntry | null;
}

function InvoiceList({ suggestions, catalog, busyIds, overrides, setOverrides, act, findCatalogMatch }: InvoiceListProps) {
  if (suggestions.length === 0) {
    return (
      <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
        <p className="text-lg mb-2">No invoice line items to review</p>
        <p className="text-sm">All invoice items are matched or marked as non-flower.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {suggestions.map(s => {
        const key = `invoices-${s.id}`;
        const busy = busyIds.has(key);
        const override = overrides[key] ?? '';
        const overrideMatch = override ? findCatalogMatch(override) : null;
        const costLabel = s.cost_per_stem != null
          ? `$${Number(s.cost_per_stem).toFixed(2)}/stem`
          : s.unit_price != null
          ? `$${Number(s.unit_price).toFixed(2)}/unit`
          : '';
        return (
          <Card key={s.id} className={s.is_supply ? 'border-amber-200' : ''}>
            <CardContent className="py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {s.is_supply && (
                      <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                        Supply?
                      </Badge>
                    )}
                    <Link
                      href={`/receipts/${s.receipt_id}`}
                      target="_blank"
                      className="text-xs text-blue-700 hover:underline"
                    >
                      {s.vendor_name ?? 'Unknown vendor'} ↗
                    </Link>
                    <span className="text-xs text-stone-400">
                      {s.invoice_number && ` · inv #${s.invoice_number}`}
                      {s.invoice_date && ` · ${s.invoice_date}`}
                      {s.receipt_file_name && ` · ${s.receipt_file_name}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm font-medium text-stone-900">{s.description}</p>
                    {costLabel && <span className="text-xs text-stone-400">{costLabel}</span>}
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
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.suggested_flower_id != null && !s.is_supply && (
                    <Button size="sm" disabled={busy}
                      onClick={() => act(s.id, { action: 'confirm', flower_id: s.suggested_flower_id })}>
                      Confirm
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => act(s.id, { action: 'mark_non_flower' })}
                    title="Mark as non-flower supply">
                    Not a flower
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => act(s.id, { action: 'reject' })}>
                    Skip
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="text"
                  placeholder="Set catalog entry (typeahead)…"
                  value={override}
                  onChange={(e) => setOverrides(prev => ({ ...prev, [key]: e.target.value }))}
                  className="h-8 text-xs max-w-xs"
                  list={`catalog-i-${s.id}`}
                />
                <datalist id={`catalog-i-${s.id}`}>
                  {catalog.map(c => (
                    <option key={c.id} value={c.canonical_name}>{c.category}</option>
                  ))}
                </datalist>
                {overrideMatch && (
                  <>
                    <span className="text-xs text-stone-400">
                      → <span className="text-emerald-700">{overrideMatch.canonical_name}</span>
                    </span>
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => act(s.id, { action: 'set', flower_id: overrideMatch.id })}>
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
  );
}

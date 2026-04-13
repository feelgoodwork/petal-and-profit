'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface Ingredient {
  id: number;
  ingredient_name: string;
  flower_id: number | null;
  canonical_name: string | null;
  quantity: number | null;
  is_foliage: number;
  match_status: string;
  avg_cost: number | null;
  min_cost: number | null;
  max_cost: number | null;
  cost_count: number;
  latest_cost: number | null;
  latest_cost_date: string | null;
}

interface CostSummary {
  total_cost: number;
  total_cost_latest: number;
  gross_margin: number;
  gross_margin_latest: number;
  margin_pct: number | null;
  margin_pct_latest: number | null;
  costed_ingredients: number;
  missing_ingredients: number;
}

interface CatalogEntry {
  id: number;
  canonical_name: string;
  category: string;
}

interface RecipeDetail {
  id: number;
  name: string;
  sell_price: number;
  container: string | null;
  category_name: string;
  ingredients: Ingredient[];
  cost_summary: CostSummary;
}

export default function RecipeDetailPage() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [editIng, setEditIng] = useState<Ingredient | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  function fetchRecipe() {
    fetch(`/api/recipes/${id}`).then(r => r.json()).then(setRecipe);
  }

  useEffect(() => {
    fetchRecipe();
    fetch('/api/catalog').then(r => r.json()).then(setCatalog);
  }, [id]);

  async function updateIngredient(ingredientId: number, updates: Record<string, unknown>) {
    await fetch(`/api/recipes/${id}/ingredients`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient_id: ingredientId, ...updates }),
    });
    fetchRecipe();
  }

  async function addIngredient(data: Record<string, unknown>) {
    await fetch(`/api/recipes/${id}/ingredients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    fetchRecipe();
    setAddingNew(false);
  }

  async function removeIngredient(ingredientId: number) {
    if (!confirm('Remove this ingredient?')) return;
    await fetch(`/api/recipes/${id}/ingredients`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient_id: ingredientId }),
    });
    fetchRecipe();
  }

  if (!recipe) return <div className="p-8 text-stone-400">Loading...</div>;

  const flowers = recipe.ingredients.filter(i => !i.is_foliage);
  const foliage = recipe.ingredients.filter(i => i.is_foliage);
  const cs = recipe.cost_summary;

  function marginColor(pct: number | null): string {
    if (pct === null) return 'text-stone-400';
    if (pct >= 70) return 'text-emerald-700';
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-600';
  }

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/recipes" className="text-sm text-stone-400 hover:text-stone-600 mb-4 block">
        &larr; Back to recipes
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-stone-900">{recipe.name}</h1>
          <Badge variant="outline">{recipe.category_name}</Badge>
        </div>
        {recipe.container && <p className="text-sm text-stone-500 mt-1">Container: {recipe.container}</p>}
      </div>

      {/* Cost Summary - Latest (what it costs today) */}
      <div className="mb-2">
        <p className="text-xs text-stone-400 uppercase tracking-wider mb-2">Cost Today (most recent vendor prices)</p>
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-stone-400 uppercase">Sell Price</p>
            <p className="text-2xl font-mono font-medium text-stone-900">${recipe.sell_price.toFixed(2)}</p>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-stone-400 uppercase">Flower Cost</p>
            <p className="text-2xl font-mono font-medium text-stone-900">
              {cs.total_cost_latest > 0 ? `$${cs.total_cost_latest.toFixed(2)}` : '-'}
            </p>
            {cs.missing_ingredients > 0 && (
              <p className="text-[10px] text-amber-600 mt-1">{cs.missing_ingredients} not costed</p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4">
            <p className="text-xs text-stone-400 uppercase">Margin</p>
            <p className={`text-2xl font-mono font-medium ${marginColor(cs.margin_pct_latest)}`}>
              {cs.total_cost_latest > 0 ? `$${cs.gross_margin_latest.toFixed(2)}` : '-'}
            </p>
          </div>
          <div className={`border rounded-lg p-4 ${cs.margin_pct_latest && cs.margin_pct_latest >= 50 ? 'bg-emerald-50 border-emerald-200' : cs.margin_pct_latest ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
            <p className="text-xs text-stone-400 uppercase">Margin %</p>
            <p className={`text-2xl font-mono font-medium ${marginColor(cs.margin_pct_latest)}`}>
              {cs.margin_pct_latest != null ? `${cs.margin_pct_latest.toFixed(1)}%` : '-'}
            </p>
          </div>
        </div>
      </div>
      {/* Historical average comparison */}
      {cs.total_cost > 0 && cs.total_cost !== cs.total_cost_latest && (
        <p className="text-xs text-stone-400 mb-8">
          Historical avg: ${cs.total_cost.toFixed(2)} cost / ${cs.gross_margin.toFixed(2)} margin / {cs.margin_pct?.toFixed(1)}%
          {cs.total_cost_latest > cs.total_cost
            ? <span className="text-red-500 ml-1">(costs rising)</span>
            : <span className="text-emerald-600 ml-1">(costs falling)</span>}
        </p>
      )}
      {cs.total_cost === cs.total_cost_latest && <div className="mb-8" />}

      {/* Flowers */}
      <IngredientTable
        title="Flowers & Fillers"
        ingredients={flowers}
        catalog={catalog}
        onEdit={setEditIng}
        onRemove={removeIngredient}
      />

      {/* Foliage */}
      <IngredientTable
        title="Foliage & Greenery"
        ingredients={foliage}
        catalog={catalog}
        onEdit={setEditIng}
        onRemove={removeIngredient}
        isFoliage
      />

      {/* Total row */}
      {cs.total_cost > 0 && (
        <div className="flex justify-end mb-6">
          <div className="bg-stone-100 rounded-lg px-6 py-3">
            <span className="text-sm text-stone-600 mr-4">Total Flower Cost:</span>
            <span className="text-lg font-mono font-medium">${cs.total_cost.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Add Ingredient */}
      <div className="mb-8">
        <Button variant="outline" size="sm" onClick={() => setAddingNew(true)}>
          + Add Ingredient
        </Button>
      </div>

      {/* Edit Dialog */}
      {editIng && (
        <EditIngredientDialog
          ingredient={editIng}
          catalog={catalog}
          onSave={async (updates) => {
            await updateIngredient(editIng.id, updates);
            setEditIng(null);
          }}
          onClose={() => setEditIng(null)}
        />
      )}

      {/* Add Dialog */}
      {addingNew && (
        <AddIngredientDialog
          catalog={catalog}
          onSave={addIngredient}
          onClose={() => setAddingNew(false)}
        />
      )}
    </div>
  );
}

function IngredientTable({
  title, ingredients, catalog, onEdit, onRemove, isFoliage,
}: {
  title: string;
  ingredients: Ingredient[];
  catalog: CatalogEntry[];
  onEdit: (i: Ingredient) => void;
  onRemove: (id: number) => void;
  isFoliage?: boolean;
}) {
  if (ingredients.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">{title}</h2>
      <div className="border rounded-lg bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead>Mapped To</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              {!isFoliage && <TableHead className="text-right">Latest $/Stem</TableHead>}
              {!isFoliage && <TableHead className="text-right">Avg $/Stem</TableHead>}
              {!isFoliage && <TableHead className="text-right">Line Cost</TableHead>}
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ingredients.map((ing) => {
              const latestCost = ing.latest_cost != null ? Number(ing.latest_cost) : null;
              const avgCostVal = ing.avg_cost != null && Number(ing.cost_count) > 0 ? Number(ing.avg_cost) : null;
              const costForLine = latestCost ?? avgCostVal;
              const lineCost = costForLine != null ? (Number(ing.quantity) || 1) * costForLine : null;
              return (
                <TableRow key={ing.id} className={Number(ing.cost_count) === 0 && !isFoliage ? 'bg-amber-50/50' : ''}>
                  <TableCell className="font-medium">{ing.ingredient_name}</TableCell>
                  <TableCell>
                    {ing.canonical_name ? (
                      <Link href={`/catalog/${ing.flower_id}`} className="text-emerald-700 hover:underline text-sm capitalize">
                        {ing.canonical_name}
                      </Link>
                    ) : (
                      <span className="text-stone-300 text-sm">unmatched</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{ing.quantity ?? '-'}</TableCell>
                  {!isFoliage && (
                    <TableCell className="text-right font-mono text-sm">
                      {latestCost != null ? (
                        <span title={ing.latest_cost_date ? `From ${ing.latest_cost_date}` : ''}>
                          ${latestCost.toFixed(2)}
                        </span>
                      ) : <span className="text-amber-500 text-xs">no data</span>}
                    </TableCell>
                  )}
                  {!isFoliage && (
                    <TableCell className="text-right font-mono text-sm text-stone-400">
                      {avgCostVal != null ? `$${avgCostVal.toFixed(2)}` : '-'}
                    </TableCell>
                  )}
                  {!isFoliage && (
                    <TableCell className="text-right font-mono text-sm font-medium">
                      {lineCost != null ? `$${lineCost.toFixed(2)}` : '-'}
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => onEdit(ing)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-red-500 hover:text-red-700" onClick={() => onRemove(ing.id)}>X</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function EditIngredientDialog({
  ingredient, catalog, onSave, onClose,
}: {
  ingredient: Ingredient;
  catalog: CatalogEntry[];
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(ingredient.ingredient_name);
  const [qty, setQty] = useState(String(ingredient.quantity ?? ''));
  const [flowerId, setFlowerId] = useState(String(ingredient.flower_id ?? ''));
  const [isFoliage, setIsFoliage] = useState(!!ingredient.is_foliage);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    if (name !== ingredient.ingredient_name) updates.ingredient_name = name;
    if (qty !== String(ingredient.quantity ?? '')) updates.quantity = parseFloat(qty) || null;
    if (flowerId !== String(ingredient.flower_id ?? '')) updates.flower_id = flowerId ? parseInt(flowerId) : null;
    if (isFoliage !== !!ingredient.is_foliage) updates.is_foliage = isFoliage;
    await onSave(updates);
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Edit Ingredient</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Ingredient Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Quantity</label>
              <Input type="number" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="text-sm text-stone-600">
                <input type="checkbox" checked={isFoliage} onChange={(e) => setIsFoliage(e.target.checked)} className="mr-2" />
                Foliage/Greenery
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Map to Catalog Entry</label>
            <Select value={flowerId} onValueChange={(v) => setFlowerId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select product type..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- None --</SelectItem>
                {catalog.filter(c => c.category === 'flower').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name}</SelectItem>
                ))}
                {catalog.filter(c => c.category === 'foliage').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name} (foliage)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddIngredientDialog({
  catalog, onSave, onClose,
}: {
  catalog: CatalogEntry[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [flowerId, setFlowerId] = useState('');
  const [isFoliage, setIsFoliage] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name) return;
    setSaving(true);
    await onSave({
      ingredient_name: name,
      quantity: parseFloat(qty) || null,
      flower_id: flowerId ? parseInt(flowerId) : null,
      is_foliage: isFoliage,
    });
    setSaving(false);
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Ingredient</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Ingredient Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. hot pink spray roses" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-stone-500 uppercase block mb-1">Quantity</label>
              <Input type="number" step="0.5" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="3" />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <label className="text-sm text-stone-600">
                <input type="checkbox" checked={isFoliage} onChange={(e) => setIsFoliage(e.target.checked)} className="mr-2" />
                Foliage/Greenery
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-stone-500 uppercase block mb-1">Map to Catalog Entry</label>
            <Select value={flowerId} onValueChange={(v) => setFlowerId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Select product type..." /></SelectTrigger>
              <SelectContent>
                {catalog.filter(c => c.category === 'flower').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name}</SelectItem>
                ))}
                {catalog.filter(c => c.category === 'foliage').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.canonical_name} (foliage)</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name}>{saving ? 'Adding...' : 'Add Ingredient'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

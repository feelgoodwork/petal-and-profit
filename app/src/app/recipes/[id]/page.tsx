'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
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
}

interface CostSummary {
  total_cost: number;
  gross_margin: number;
  margin_pct: number | null;
  costed_ingredients: number;
  missing_ingredients: number;
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

  useEffect(() => {
    fetch(`/api/recipes/${id}`)
      .then(r => r.json())
      .then(setRecipe);
  }, [id]);

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
        {recipe.container && (
          <p className="text-sm text-stone-500 mt-1">Container: {recipe.container}</p>
        )}
      </div>

      {/* Cost Summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase">Sell Price</p>
          <p className="text-2xl font-mono font-medium text-stone-900">${recipe.sell_price.toFixed(2)}</p>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase">Flower Cost</p>
          <p className="text-2xl font-mono font-medium text-stone-900">
            {cs.total_cost > 0 ? `$${cs.total_cost.toFixed(2)}` : '-'}
          </p>
          {cs.missing_ingredients > 0 && (
            <p className="text-[10px] text-amber-600 mt-1">{cs.missing_ingredients} ingredients not costed</p>
          )}
        </div>
        <div className="bg-white border rounded-lg p-4">
          <p className="text-xs text-stone-400 uppercase">Gross Margin</p>
          <p className={`text-2xl font-mono font-medium ${marginColor(cs.margin_pct)}`}>
            {cs.total_cost > 0 ? `$${cs.gross_margin.toFixed(2)}` : '-'}
          </p>
        </div>
        <div className={`border rounded-lg p-4 ${cs.margin_pct && cs.margin_pct >= 50 ? 'bg-emerald-50 border-emerald-200' : cs.margin_pct ? 'bg-amber-50 border-amber-200' : 'bg-white'}`}>
          <p className="text-xs text-stone-400 uppercase">Margin %</p>
          <p className={`text-2xl font-mono font-medium ${marginColor(cs.margin_pct)}`}>
            {cs.margin_pct != null ? `${cs.margin_pct.toFixed(1)}%` : '-'}
          </p>
        </div>
      </div>

      {/* Flowers & Fillers */}
      {flowers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">Flowers & Fillers</h2>
          <div className="border rounded-lg bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Matched To</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost/Stem</TableHead>
                  <TableHead className="text-right">Line Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flowers.map((ing) => {
                  const lineCost = ing.avg_cost != null && ing.cost_count > 0
                    ? (ing.quantity || 1) * ing.avg_cost : null;
                  return (
                    <TableRow key={ing.id} className={ing.cost_count === 0 ? 'bg-amber-50/50' : ''}>
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
                      <TableCell className="text-right font-mono text-sm">
                        {ing.avg_cost != null && ing.cost_count > 0 ? (
                          <span title={`${ing.cost_count} price points, range $${ing.min_cost?.toFixed(2)}-$${ing.max_cost?.toFixed(2)}`}>
                            ${ing.avg_cost.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        {lineCost != null ? `$${lineCost.toFixed(2)}` : (
                          <span className="text-amber-500 text-xs">no cost data</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Total row */}
                <TableRow className="border-t-2">
                  <TableCell colSpan={4} className="text-right font-medium text-stone-700">Total Flower Cost</TableCell>
                  <TableCell className="text-right font-mono font-medium text-stone-900">
                    {cs.total_cost > 0 ? `$${cs.total_cost.toFixed(2)}` : '-'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Foliage */}
      {foliage.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">Foliage & Greenery</h2>
          <div className="border rounded-lg bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead>Matched To</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Cost/Stem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {foliage.map((ing) => (
                  <TableRow key={ing.id}>
                    <TableCell className="text-stone-600">{ing.ingredient_name}</TableCell>
                    <TableCell>
                      {ing.canonical_name ? (
                        <Link href={`/catalog/${ing.flower_id}`} className="text-emerald-700 hover:underline text-sm capitalize">
                          {ing.canonical_name}
                        </Link>
                      ) : (
                        <span className="text-stone-300 text-sm">unmatched</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-stone-400">{ing.quantity ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-stone-400">
                      {ing.avg_cost != null && ing.cost_count > 0 ? `$${ing.avg_cost.toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

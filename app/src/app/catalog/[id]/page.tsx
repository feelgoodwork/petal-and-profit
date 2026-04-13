'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface CatalogDetail {
  id: number;
  canonical_name: string;
  category: string;
  aliases: Array<{ alias: string; vendor_name: string; confidence: number }>;
  line_items: Array<{
    id: number; description: string; quantity: number | null;
    unit_price: number | null; line_total: number | null;
    invoice_date: string | null; invoice_number: string | null;
    vendor_name: string;
  }>;
  costs: Array<{
    unit_cost: number; vendor_name: string; invoice_date: string | null;
  }>;
  recipe_usage: Array<{
    recipe_name: string; recipe_id: number; sell_price: number;
    quantity: number | null; ingredient_name: string;
  }>;
}

export default function CatalogDetailPage() {
  const { id } = useParams();
  const [data, setData] = useState<CatalogDetail | null>(null);

  useEffect(() => {
    fetch(`/api/catalog/${id}`)
      .then(r => r.json())
      .then(setData);
  }, [id]);

  if (!data) return <div className="p-8 text-stone-400">Loading...</div>;

  // Group line items by vendor for the price view
  const byVendor: Record<string, typeof data.line_items> = {};
  for (const item of data.line_items) {
    const key = item.vendor_name;
    if (!byVendor[key]) byVendor[key] = [];
    byVendor[key].push(item);
  }

  const avgCost = data.costs.length > 0
    ? data.costs.reduce((s, c) => s + c.unit_cost, 0) / data.costs.length
    : null;

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/catalog" className="text-sm text-stone-400 hover:text-stone-600 mb-4 block">
        &larr; Back to catalog
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900 capitalize">{data.canonical_name}</h1>
        <div className="flex items-center gap-3 mt-1">
          <Badge variant="outline">{data.category}</Badge>
          {avgCost && (
            <span className="text-sm text-stone-500">
              Avg cost: <span className="font-mono font-medium text-emerald-700">${avgCost.toFixed(2)}</span>/stem
            </span>
          )}
          <span className="text-sm text-stone-400">{data.line_items.length} invoice line items</span>
          <span className="text-sm text-stone-400">{data.recipe_usage.length} recipe uses</span>
        </div>
      </div>

      {/* Price Summary */}
      {data.costs.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Avg/Stem</p>
            <p className="text-xl font-mono font-medium text-emerald-700">
              ${avgCost?.toFixed(2)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Min</p>
            <p className="text-xl font-mono">
              ${Math.min(...data.costs.map(c => c.unit_cost)).toFixed(2)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Max</p>
            <p className="text-xl font-mono">
              ${Math.max(...data.costs.map(c => c.unit_cost)).toFixed(2)}
            </p>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <p className="text-xs text-stone-400 uppercase">Price Points</p>
            <p className="text-xl font-mono">{data.costs.length}</p>
          </div>
        </div>
      )}

      {/* Used In Recipes */}
      {data.recipe_usage.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">Used in Recipes</h2>
          <div className="border rounded-lg bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipe</TableHead>
                  <TableHead>As</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Sell Price</TableHead>
                  <TableHead className="text-right">Ingredient Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recipe_usage.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Link href={`/recipes/${r.recipe_id}`} className="text-emerald-700 hover:underline font-medium">
                        {r.recipe_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-stone-500">{r.ingredient_name}</TableCell>
                    <TableCell className="text-right">{r.quantity ?? '-'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${r.sell_price.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {avgCost && r.quantity ? `$${(avgCost * r.quantity).toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* All Invoice Line Items - The Price Explorer */}
      <div className="mb-8">
        <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
          All Invoice Line Items ({data.line_items.length})
        </h2>
        <div className="border rounded-lg bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.line_items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-sm">{item.description}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{item.vendor_name}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-stone-500">{item.invoice_date || '-'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.quantity ?? '-'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.unit_price != null ? `$${item.unit_price.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {item.line_total != null ? `$${item.line_total.toFixed(2)}` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Vendor Aliases */}
      {data.aliases.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
            Known Aliases ({data.aliases.length})
          </h2>
          <div className="border rounded-lg bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {data.aliases.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-stone-100 text-sm">
                  {a.alias}
                  <Badge variant="outline" className="text-[9px] ml-1">{a.vendor_name}</Badge>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

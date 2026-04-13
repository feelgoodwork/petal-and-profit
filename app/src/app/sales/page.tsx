'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import Link from 'next/link';

interface TopSeller {
  description: string;
  recipe_id: number | null;
  recipe_name: string | null;
  times_sold: string;
  total_qty: string;
  avg_sale_price: number | null;
  total_revenue: number | null;
  first_sold: string | null;
  last_sold: string | null;
  total_flower_cost: number | null;
  margin_pct: number | null;
}

interface SalesData {
  top_sellers: TopSeller[];
  stats: {
    total_sales: string;
    total_orders: string;
    total_revenue: number;
    earliest_date: string;
    latest_date: string;
    matched_recipes: string;
  };
  by_occasion: Array<{ occasion: string; count: string; revenue: number }>;
  monthly: Array<{ month: string; sales: string; revenue: number }>;
}

export default function SalesPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fetchSales() {
    const res = await fetch('/api/sales');
    if (res.ok) setData(await res.json());
  }

  async function importSales() {
    setImporting(true);
    setResult(null);
    const res = await fetch('/api/sales/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const d = await res.json();
    if (d.success) {
      setResult(`Imported ${d.total_imported} line items from ${Object.keys(d.by_file).length} files`);
      fetchSales();
    } else {
      setResult(`Error: ${d.error}`);
    }
    setImporting(false);
  }

  useEffect(() => { fetchSales(); }, []);

  function marginColor(pct: number | null): string {
    if (pct === null) return 'text-stone-400';
    if (pct >= 70) return 'text-emerald-700';
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-600';
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Sales</h1>
          <p className="text-sm text-stone-500 mt-1">
            {data ? `${Number(data.stats.total_orders).toLocaleString()} orders, $${Number(data.stats.total_revenue || 0).toLocaleString()} revenue` : 'Loading...'}
          </p>
        </div>
        <Button onClick={importSales} disabled={importing}>
          {importing ? 'Importing...' : 'Import Sales Data'}
        </Button>
      </div>

      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-6 text-sm text-emerald-800">{result}</div>
      )}

      {data && Number(data.stats.total_sales) > 0 && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-stone-400 uppercase">Total Orders</p>
              <p className="text-2xl font-mono font-medium">{Number(data.stats.total_orders).toLocaleString()}</p>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-stone-400 uppercase">Revenue</p>
              <p className="text-2xl font-mono font-medium">${Number(data.stats.total_revenue || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-stone-400 uppercase">Date Range</p>
              <p className="text-sm font-mono">{data.stats.earliest_date} to {data.stats.latest_date}</p>
            </div>
            <div className="bg-white border rounded-lg p-3">
              <p className="text-xs text-stone-400 uppercase">Matched to Recipes</p>
              <p className="text-2xl font-mono font-medium text-emerald-700">{data.stats.matched_recipes}</p>
            </div>
          </div>

          {/* Top Sellers */}
          <div className="mb-8">
            <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">Top Sellers (with profitability)</h2>
            <div className="border rounded-lg bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arrangement</TableHead>
                    <TableHead>Recipe Match</TableHead>
                    <TableHead className="text-right">Times Sold</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Flower Cost</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Est. Total Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top_sellers.map((s, i) => {
                    const sold = Number(s.times_sold);
                    const avgPrice = s.avg_sale_price ? Number(s.avg_sale_price) : null;
                    const flowerCost = s.total_flower_cost ? Number(s.total_flower_cost) : null;
                    const estProfit = avgPrice && flowerCost ? (avgPrice - flowerCost) * sold : null;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{s.description}</TableCell>
                        <TableCell>
                          {s.recipe_id ? (
                            <Link href={`/recipes/${s.recipe_id}`} className="text-emerald-700 hover:underline text-sm">
                              {s.recipe_name}
                            </Link>
                          ) : (
                            <span className="text-stone-300 text-xs">no match</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">{sold}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {avgPrice ? `$${avgPrice.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {s.total_revenue ? `$${Number(s.total_revenue).toFixed(0)}` : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {flowerCost ? `$${flowerCost.toFixed(2)}` : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${marginColor(s.margin_pct ? Number(s.margin_pct) : null)}`}>
                          {s.margin_pct ? `${Number(s.margin_pct).toFixed(1)}%` : '-'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${estProfit && estProfit > 0 ? 'text-emerald-700' : estProfit ? 'text-red-600' : ''}`}>
                          {estProfit ? `$${estProfit.toFixed(0)}` : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* By Occasion */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">By Occasion</h2>
              <div className="border rounded-lg bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Occasion</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_occasion.slice(0, 12).map((o) => (
                      <TableRow key={o.occasion}>
                        <TableCell className="text-sm">{o.occasion}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{o.count}</TableCell>
                        <TableCell className="text-right font-mono text-sm">${Number(o.revenue || 0).toFixed(0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">Monthly Revenue</h2>
              <div className="border rounded-lg bg-white p-4 max-h-80 overflow-auto">
                {data.monthly.map((m) => (
                  <div key={m.month} className="flex items-center gap-3 py-1">
                    <span className="text-xs text-stone-500 w-16 font-mono">{m.month}</span>
                    <div className="flex-1 bg-stone-100 rounded-full h-4 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-4 rounded-full"
                        style={{ width: `${Math.min(100, (Number(m.revenue) / Math.max(...data.monthly.map(x => Number(x.revenue)))) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-stone-600 w-20 text-right">${Number(m.revenue || 0).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {data && Number(data.stats.total_sales) === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No sales data imported yet</p>
          <p className="text-sm">Click "Import Sales Data" to load from the Sales xlsx files</p>
        </div>
      )}
    </div>
  );
}

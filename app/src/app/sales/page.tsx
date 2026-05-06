'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
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

interface OrderRow {
  order_number: string;
  order_date: string;
  source: string | null;
  occasion: string | null;
  line_count: number;
  order_total: number | null;
  total_qty: number | null;
  primary_description: string | null;
  has_recipe_match: boolean;
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
  orders: OrderRow[] | null;
  range: {
    from: string | null;
    to: string | null;
    days: number | null;
    includes_orders: boolean;
  };
}

const RANGE_PRESETS: Array<{ label: string; days: number | null }> = [
  { label: 'All time', days: null },
  { label: 'Last 30d', days: 30 },
  { label: 'Last 90d', days: 90 },
  { label: 'Last 6mo', days: 183 },
  { label: 'Last 1y', days: 365 },
];

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type SortKey = 'times_sold' | 'total_revenue' | 'total_flower_cost' | 'margin_pct';
type SortDir = 'asc' | 'desc';

export default function SalesPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('times_sold');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  async function fetchSales(fromVal: string, toVal: string) {
    const params = new URLSearchParams();
    if (fromVal) params.set('from', fromVal);
    if (toVal) params.set('to', toVal);
    const qs = params.toString();
    const res = await fetch('/api/sales' + (qs ? `?${qs}` : ''));
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
      fetchSales(from, to);
    } else {
      setResult(`Error: ${d.error}`);
    }
    setImporting(false);
  }

  useEffect(() => { fetchSales(from, to); }, [from, to]);

  function applyPreset(days: number | null) {
    if (days == null) {
      setFrom(''); setTo('');
      return;
    }
    const today = new Date();
    const start = new Date(today.getTime() - days * 86400000);
    setFrom(ymd(start));
    setTo(ymd(today));
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortedSellers(rows: TopSeller[]): TopSeller[] {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] == null ? null : Number(a[sortKey]);
      const bv = b[sortKey] == null ? null : Number(b[sortKey]);
      // Push nulls to the bottom regardless of direction
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * dir;
    });
  }

  function sortIndicator(key: SortKey): string {
    if (key !== sortKey) return '';
    return sortDir === 'desc' ? ' ↓' : ' ↑';
  }

  function marginColor(pct: number | null): string {
    if (pct === null) return 'text-stone-400';
    if (pct >= 70) return 'text-emerald-700';
    if (pct >= 50) return 'text-emerald-600';
    if (pct >= 30) return 'text-amber-600';
    return 'text-red-600';
  }

  const rangeLabel = (() => {
    if (!data) return '';
    const r = data.range;
    if (!r.from && !r.to) return 'All time';
    if (r.from && r.to) return `${r.from} → ${r.to} (${r.days} days)`;
    if (r.from) return `From ${r.from}`;
    return `Through ${r.to}`;
  })();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Sales</h1>
          <p className="text-sm text-stone-500 mt-1">
            {data ? `${Number(data.stats.total_orders).toLocaleString()} orders, $${Number(data.stats.total_revenue || 0).toLocaleString()} revenue` : 'Loading...'}
            <span className="text-stone-400"> · {rangeLabel}</span>
          </p>
        </div>
        <Button onClick={importSales} disabled={importing}>
          {importing ? 'Importing...' : 'Import Sales Data'}
        </Button>
      </div>

      {/* Date range controls */}
      <div className="bg-white border rounded-lg p-3 mb-6 flex flex-wrap gap-3 items-center">
        <span className="text-xs uppercase tracking-wider text-stone-500">Date range</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="px-2 py-1 text-sm border rounded-md"
            aria-label="From date"
          />
          <span className="text-stone-400 text-sm">→</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="px-2 py-1 text-sm border rounded-md"
            aria-label="To date"
          />
          {(from || to) && (
            <button
              onClick={() => { setFrom(''); setTo(''); }}
              className="text-xs text-stone-500 hover:text-stone-700 underline ml-1"
            >
              clear
            </button>
          )}
        </div>
        <div className="flex gap-1 ml-auto">
          {RANGE_PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="px-2 py-1 text-xs rounded-md border bg-white text-stone-600 hover:bg-stone-50"
            >
              {p.label}
            </button>
          ))}
        </div>
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
            <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
              Top Sellers (with profitability)
              {data.top_sellers.length > 0 && (
                <span className="text-stone-400 ml-2 normal-case font-normal">
                  · {data.top_sellers.length.toLocaleString()} unique items
                </span>
              )}
            </h2>
            <div className="border rounded-lg bg-white max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
                  <TableRow>
                    <TableHead>Arrangement</TableHead>
                    <TableHead>Recipe Match</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-stone-900"
                      onClick={() => toggleSort('times_sold')}
                    >
                      Times Sold{sortIndicator('times_sold')}
                    </TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-stone-900"
                      onClick={() => toggleSort('total_revenue')}
                    >
                      Total Revenue{sortIndicator('total_revenue')}
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-stone-900"
                      onClick={() => toggleSort('total_flower_cost')}
                    >
                      Flower Cost{sortIndicator('total_flower_cost')}
                    </TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none hover:text-stone-900"
                      onClick={() => toggleSort('margin_pct')}
                    >
                      Margin{sortIndicator('margin_pct')}
                    </TableHead>
                    <TableHead className="text-right">Est. Total Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSellers(data.top_sellers).map((s, i) => {
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

          {/* Orders list — only when range <= 6 months */}
          {data.orders && data.orders.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider mb-2">
                Orders ({data.orders.length.toLocaleString()})
                {data.orders.length === 5000 && <span className="text-stone-400 ml-2 text-xs">capped at 5,000</span>}
              </h2>
              <div className="border rounded-lg bg-white max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-white shadow-sm">
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Primary Item</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Occasion</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Recipe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((o) => (
                      <TableRow key={o.order_number}>
                        <TableCell className="font-mono text-xs">{o.order_number}</TableCell>
                        <TableCell className="font-mono text-xs">{o.order_date}</TableCell>
                        <TableCell className="text-sm">{o.primary_description}</TableCell>
                        <TableCell className="text-xs text-stone-500">{o.source ?? '-'}</TableCell>
                        <TableCell className="text-xs text-stone-500">{o.occasion ?? '-'}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{o.line_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{o.total_qty ?? '-'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">${Number(o.order_total || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          {o.has_recipe_match ? (
                            <span className="text-emerald-700 text-xs">matched</span>
                          ) : (
                            <span className="text-stone-300 text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {data.range.from && data.range.to && !data.range.includes_orders && (
            <div className="text-xs text-stone-500 italic mb-4">
              Range exceeds 6 months — narrow to under 6 months to see individual orders.
            </div>
          )}
        </>
      )}

      {data && Number(data.stats.total_sales) === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No sales data in this date range</p>
          <p className="text-sm">{(from || to) ? 'Try widening the range or click "All time".' : 'Click "Import Sales Data" to load from the Sales xlsx files.'}</p>
        </div>
      )}
    </div>
  );
}

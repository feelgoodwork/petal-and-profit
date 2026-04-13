'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Stats {
  vendors: number;
  receipts: number;
  receipts_extracted: number;
  receipts_reviewed: number;
  line_items: number;
  recipes: number;
  recipes_costed: number;
  catalog_entries: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/init', { method: 'POST' })
      .then(r => r.json())
      .then(() => fetch('/api/stats'))
      .then(r => r.json())
      .then(data => setStats(data))
      .catch(e => setError(e.message));
  }, []);

  const cards = [
    { title: 'Receipts', value: stats?.receipts ?? 0, sub: `${stats?.receipts_extracted ?? 0} extracted`, href: '/receipts', color: 'text-blue-600' },
    { title: 'Line Items', value: stats?.line_items ?? 0, sub: 'from all receipts', href: '/receipts', color: 'text-amber-600' },
    { title: 'Recipes', value: stats?.recipes ?? 0, sub: `${stats?.recipes_costed ?? 0} fully costed`, href: '/recipes', color: 'text-emerald-600' },
    { title: 'Flower Catalog', value: stats?.catalog_entries ?? 0, sub: 'canonical entries', href: '/catalog', color: 'text-purple-600' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900">Dashboard</h1>
        <p className="text-sm text-stone-500 mt-1">Uptowne Florist receipt-to-profitability pipeline</p>
        {error && <p className="text-sm text-red-500 mt-2">Error: {error}</p>}
        {!stats && !error && <p className="text-sm text-stone-400 mt-2">Loading...</p>}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <Link key={card.title} href={card.href}>
            <div className="border rounded-xl bg-white p-4 hover:shadow-md transition-shadow">
              <p className="text-sm font-medium text-stone-500 mb-2">{card.title}</p>
              <p className={`text-3xl font-semibold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-stone-400 mt-1">{card.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-medium text-stone-700 uppercase tracking-wider">Pipeline Steps</h2>
        {[
          { step: 1, label: 'Import & classify receipts', href: '/receipts', done: (stats?.receipts ?? 0) > 0 },
          { step: 2, label: 'Extract line items', href: '/receipts', done: (stats?.receipts_extracted ?? 0) > 0 },
          { step: 3, label: 'Human review of items', href: '/receipts', done: (stats?.receipts_reviewed ?? 0) > 0 },
          { step: 4, label: 'Import recipes', href: '/recipes', done: (stats?.recipes ?? 0) > 0 },
          { step: 5, label: 'Fuzzy match items to recipes', href: '/matching', done: false },
          { step: 6, label: 'Human review of matches', href: '/matching', done: false },
          { step: 7, label: 'View profitability', href: '/profitability', done: false },
        ].map((item) => (
          <Link key={item.step} href={item.href} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-white hover:bg-stone-50">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${item.done ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400'}`}>{item.step}</span>
            <span className="text-sm text-stone-700">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

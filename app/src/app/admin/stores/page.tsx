'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Store {
  id: number;
  slug: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
}

export default function AdminStoresPage() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/stores')
      .then(async r => {
        if (r.ok) {
          const d = await r.json();
          setStores(d.stores);
        } else {
          const e = await r.json().catch(() => ({}));
          setError(e.error || `HTTP ${r.status}`);
        }
      })
      .catch(e => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Stores</h1>
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-md text-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Stores</h1>
          <p className="text-sm text-stone-500 mt-1">
            {stores ? `${stores.length} store${stores.length === 1 ? '' : 's'} registered` : 'Loading…'}
          </p>
        </div>
        <Link href="/admin/stores/new">
          <Button>+ Add new store</Button>
        </Link>
      </div>

      {stores && stores.length === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">No stores yet</p>
          <p className="text-sm">Click &quot;Add new store&quot; to register your first store.</p>
        </div>
      )}

      {stores && stores.length > 0 && (
        <div className="space-y-2">
          {stores.map(s => (
            <Card key={s.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <p className="font-medium text-stone-900">{s.name}</p>
                      <Badge variant="outline" className="text-xs text-stone-500">{s.slug}</Badge>
                      {!s.is_active && (
                        <Badge variant="outline" className="text-xs text-amber-700 border-amber-300">inactive</Badge>
                      )}
                    </div>
                    {s.notes && <p className="text-sm text-stone-500 mt-1">{s.notes}</p>}
                    <p className="text-xs text-stone-400 mt-1">
                      {s.member_count} member{s.member_count === 1 ? '' : 's'} · created {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

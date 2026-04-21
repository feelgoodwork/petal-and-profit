'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Step = 'form' | 'creating' | 'done';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function NewStorePage() {
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ store: { id: number; slug: string; name: string }; init: { vendors_seeded: number }; switched_to: boolean } | null>(null);
  const router = useRouter();

  function onNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStep('creating');
    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, database_url: databaseUrl, notes: notes || null, auto_switch: true }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setResult(body);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('form');
    }
  }

  if (step === 'done' && result) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold text-stone-900 mb-2">Store created</h1>
        <p className="text-sm text-stone-500 mb-6">
          <span className="font-medium text-stone-900">{result.store.name}</span> is ready.
          Seeded {result.init.vendors_seeded} default vendor{result.init.vendors_seeded === 1 ? '' : 's'}.
          {result.switched_to && ' Your session is now pointing at this store.'}
        </p>

        <div className="bg-white border rounded-lg p-6">
          <h2 className="text-lg font-medium text-stone-900 mb-4">Next: upload your starting data</h2>
          <p className="text-sm text-stone-500 mb-4">
            The new store&apos;s database is empty. Use the existing pages (they operate on whichever store your session is pointed at — now this one):
          </p>
          <div className="space-y-3">
            <Link href="/receipts" className="flex items-start gap-3 p-3 border rounded-md hover:border-emerald-300 hover:bg-emerald-50/30">
              <span className="text-emerald-700 font-medium">1</span>
              <div>
                <p className="font-medium text-stone-900">Upload invoices / receipts</p>
                <p className="text-xs text-stone-500">PDF invoices from vendors. Gets you cost data.</p>
              </div>
            </Link>
            <Link href="/recipes" className="flex items-start gap-3 p-3 border rounded-md hover:border-emerald-300 hover:bg-emerald-50/30">
              <span className="text-emerald-700 font-medium">2</span>
              <div>
                <p className="font-medium text-stone-900">Import recipe PDFs</p>
                <p className="text-xs text-stone-500">The category PDFs with arrangement recipes.</p>
              </div>
            </Link>
            <Link href="/sales" className="flex items-start gap-3 p-3 border rounded-md hover:border-emerald-300 hover:bg-emerald-50/30">
              <span className="text-emerald-700 font-medium">3</span>
              <div>
                <p className="font-medium text-stone-900">Import sales data</p>
                <p className="text-xs text-stone-500">xlsx sales exports for historical matching.</p>
              </div>
            </Link>
          </div>

          <div className="mt-6 text-xs text-stone-400">
            Once data is loaded, run the batch pipeline locally against this store&apos;s <code>DATABASE_URL</code>:
            <pre className="mt-2 bg-stone-50 p-3 rounded text-stone-600 overflow-x-auto text-xs">
              {`DATABASE_URL='<this store url>' node scripts/rebuild-catalog.js
DATABASE_URL='<this store url>' node scripts/rebuild-profitability.js`}
            </pre>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <Button onClick={() => router.push('/admin/stores')}>Back to stores</Button>
          <Button variant="outline" onClick={() => router.push('/')}>Go to dashboard</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold text-stone-900 mb-2">Add new store</h1>
      <p className="text-sm text-stone-500 mb-6">
        Register a new customer store and initialize its database. You&apos;ll need to provision a Neon project for the store first and paste its connection string below.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Store name</label>
          <Input
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Milano's UpTowne Florist"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Slug</label>
          <Input
            value={slug}
            onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
            placeholder="uptowne"
            pattern="[a-z][a-z0-9-]{1,40}"
            required
          />
          <p className="text-xs text-stone-400 mt-1">Lowercase letters, numbers, hyphens. Used internally.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Database URL</label>
          <Input
            value={databaseUrl}
            onChange={e => setDatabaseUrl(e.target.value)}
            placeholder="postgresql://user:password@host/db?sslmode=require"
            required
            type="text"
            className="font-mono text-xs"
          />
          <p className="text-xs text-stone-400 mt-1">
            Pooled Neon URL. The schema will be initialized on submit — make sure the URL is correct before submitting.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Notes (optional)</label>
          <Input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Onboarding date, contact person, etc."
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={step === 'creating'}>
            {step === 'creating' ? 'Creating…' : 'Create store & initialize DB'}
          </Button>
          <Link href="/admin/stores">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
}

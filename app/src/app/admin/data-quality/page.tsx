'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

interface Finding {
  id: number;
  kind: string;
  severity: string;
  subject_type: string | null;
  subject_id: number | null;
  summary: string;
  details: Record<string, unknown>;
  suggested_fix: string | null;
  rule_snippet: string | null;
  status: string;
  created_at: string;
}

interface Count { kind: string; status: string; n: number; }

const KIND_LABELS: Record<string, string> = {
  price_outlier: 'Price outlier',
  duplicate_catalog: 'Duplicate catalog entry',
  unused_catalog: 'Unused catalog entry',
  quantity_outlier: 'Quantity outlier',
  recipe_cost_anomaly: 'Recipe margin anomaly',
  composite_description: 'Composite vendor line',
  not_a_flower: 'Not a flower',
};

const SEV_COLORS: Record<string, string> = {
  high: 'text-red-700 border-red-300 bg-red-50',
  medium: 'text-amber-700 border-amber-300 bg-amber-50',
  low: 'text-stone-600 border-stone-300 bg-stone-50',
};

const HAS_AUTO_FIX = new Set(['price_outlier', 'not_a_flower', 'composite_description', 'unused_catalog', 'duplicate_catalog']);

export default function DataQualityPage() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [counts, setCounts] = useState<Count[]>([]);
  const [status, setStatus] = useState<'open' | 'accepted' | 'dismissed'>('open');
  const [kind, setKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status });
      if (kind) params.set('kind', kind);
      const res = await fetch('/api/admin/data-quality?' + params);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFindings(data.findings);
      setCounts(data.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, [status, kind]);

  async function act(id: number, action: 'accept' | 'dismiss' | 'apply_fix') {
    setBusyIds(prev => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/data-quality/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setError(e.error || `HTTP ${res.status}`);
        return;
      }
      setFindings(prev => prev.filter(f => f.id !== id));
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  const kindCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of counts.filter(c => c.status === status)) m[c.kind] = c.n;
    return m;
  }, [counts, status]);

  const totalForStatus = Object.values(kindCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Data Quality</h1>
          <p className="text-sm text-stone-500 mt-1">
            {totalForStatus} {status} findings
            {kind && ` · ${KIND_LABELS[kind] ?? kind}`}
          </p>
        </div>
        <div className="text-xs text-stone-400 max-w-xs text-right">
          Re-run the scan after data imports: <code className="bg-stone-100 px-1 rounded">node scripts/scan-data-quality.js</code>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        {(['open', 'accepted', 'dismissed'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1 text-sm rounded-md border ${
              status === s ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)} ({counts.filter(c => c.status === s).reduce((a, b) => a + b.n, 0)})
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setKind(null)}
          className={`px-3 py-1 text-xs rounded-full border ${
            !kind ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-300'
          }`}>
          All ({totalForStatus})
        </button>
        {Object.entries(KIND_LABELS).map(([k, label]) => (
          <button key={k} onClick={() => setKind(kind === k ? null : k)}
            disabled={!kindCounts[k]}
            className={`px-3 py-1 text-xs rounded-full border ${
              kind === k ? 'bg-stone-900 text-white border-stone-900' :
              !kindCounts[k] ? 'bg-stone-50 text-stone-300 border-stone-200 cursor-not-allowed' :
              'bg-white text-stone-600 border-stone-300'
            }`}>
            {label} ({kindCounts[k] || 0})
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md text-sm mb-4">{error}</div>
      )}

      {loading && <p className="text-stone-400 text-sm">Loading…</p>}

      {!loading && findings.length === 0 && (
        <div className="text-center py-16 text-stone-400 bg-white border rounded-lg">
          <p className="text-lg mb-2">Nothing to review</p>
          <p className="text-sm">Run the scan to refresh: <code>node scripts/scan-data-quality.js</code></p>
        </div>
      )}

      <div className="space-y-2">
        {findings.map(f => {
          const busy = busyIds.has(f.id);
          const hasAutoFix = HAS_AUTO_FIX.has(f.kind);
          return (
            <Card key={f.id}>
              <CardContent className="py-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={SEV_COLORS[f.severity] ?? ''}>
                    {f.severity}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-stone-600">
                    {KIND_LABELS[f.kind] ?? f.kind}
                  </Badge>
                  {f.subject_type && f.subject_id != null && (
                    <span className="text-xs text-stone-400">
                      {f.subject_type}#{f.subject_id}
                    </span>
                  )}
                </div>
                <p className="text-sm text-stone-900">{f.summary}</p>
                {f.suggested_fix && (
                  <p className="text-xs text-stone-500 italic">→ {f.suggested_fix}</p>
                )}
                {f.rule_snippet && status === 'open' && (
                  <details className="text-xs">
                    <summary className="text-stone-500 cursor-pointer">Suggested rule snippet (copy into data-quality-rules.json)</summary>
                    <pre className="bg-stone-50 p-2 rounded mt-1 overflow-x-auto">{f.rule_snippet}</pre>
                  </details>
                )}
                {status === 'open' && (
                  <div className="flex gap-1 pt-1">
                    {hasAutoFix && (
                      <Button size="sm" disabled={busy} onClick={() => act(f.id, 'apply_fix')}>
                        Apply fix
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(f.id, 'accept')}>
                      Accept (no fix)
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(f.id, 'dismiss')}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

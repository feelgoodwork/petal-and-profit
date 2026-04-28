'use client';

import { useEffect, useMemo, useState } from 'react';

interface Application {
  id: number;
  shop_name: string;
  city_state: string;
  years_in_business: string | null;
  shop_type: string | null;
  annual_arrangements: string | null;
  vendor_count: string | null;
  recipe_count: string | null;
  invoice_storage: string | null;
  biggest_unknown: string | null;
  contact_name: string;
  contact_role: string | null;
  email: string;
  phone: string | null;
  heard_about: string | null;
  status: string;
  created_at: string;
}

const STATUSES = ['new', 'reviewing', 'accepted', 'declined'] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLES: Record<Status, string> = {
  new: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reviewing: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-sky-50 text-sky-700 border-sky-200',
  declined: 'bg-stone-100 text-stone-500 border-stone-200',
};

export default function PilotApplicationsPage() {
  const [apps, setApps] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  async function load() {
    setError(null);
    const res = await fetch('/api/pilot-applications', { cache: 'no-store' });
    if (!res.ok) {
      setError('Could not load applications.');
      return;
    }
    const data = await res.json();
    setApps(data.applications || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id: number, status: Status) {
    const res = await fetch('/api/pilot-applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) {
      setApps((current) => current?.map((a) => (a.id === id ? { ...a, status } : a)) ?? null);
    }
  }

  const counts = useMemo(() => {
    const c: Record<Status | 'all', number> = { all: 0, new: 0, reviewing: 0, accepted: 0, declined: 0 };
    for (const a of apps ?? []) {
      c.all += 1;
      if ((STATUSES as readonly string[]).includes(a.status)) {
        c[a.status as Status] += 1;
      }
    }
    return c;
  }, [apps]);

  const visible = useMemo(() => {
    if (!apps) return [];
    if (filter === 'all') return apps;
    return apps.filter((a) => a.status === filter);
  }, [apps, filter]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900">Pilot Applications</h1>
        <p className="text-sm text-stone-500 mt-1">
          Submissions from the public Pilot recruitment page. Update status to track who's been reviewed.
        </p>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {(['all', ...STATUSES] as const).map((key) => {
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                active
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {key} <span className="opacity-60 ml-1">{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {!apps && !error && <p className="text-sm text-stone-400">Loading...</p>}

      {apps && visible.length === 0 && (
        <div className="border border-dashed border-stone-300 rounded-lg p-12 text-center bg-white">
          <p className="text-sm text-stone-500">No applications {filter === 'all' ? 'yet' : `with status "${filter}"`}.</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((app) => {
          const expanded = expandedId === app.id;
          const status = (STATUSES as readonly string[]).includes(app.status)
            ? (app.status as Status)
            : 'new';
          return (
            <div key={app.id} className="border border-stone-200 rounded-lg bg-white overflow-hidden">
              <button
                onClick={() => setExpandedId(expanded ? null : app.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-stone-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-medium text-stone-900 truncate">{app.shop_name}</h3>
                    <span className="text-xs text-stone-400">{app.city_state}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-1 truncate">
                    {app.contact_name}
                    {app.contact_role ? `, ${app.contact_role}` : ''} &middot; {app.email}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`px-2 py-1 rounded border text-xs font-medium ${STATUS_STYLES[status]}`}>
                    {status}
                  </span>
                  <span className="text-xs text-stone-400 hidden sm:inline">
                    {new Date(app.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-stone-400 text-sm">{expanded ? '−' : '+'}</span>
                </div>
              </button>

              {expanded && (
                <div className="px-5 pb-5 border-t border-stone-100 bg-stone-50">
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3 mt-4 text-sm">
                    <Field label="Shop type" value={app.shop_type} />
                    <Field label="Years in business" value={app.years_in_business} />
                    <Field label="Annual arrangements" value={app.annual_arrangements} />
                    <Field label="Vendor count" value={app.vendor_count} />
                    <Field label="Recipe count" value={app.recipe_count} />
                    <Field label="Invoice storage" value={app.invoice_storage} />
                    <Field label="Phone" value={app.phone} />
                    <Field label="Heard about us" value={app.heard_about} />
                  </div>

                  {app.biggest_unknown && (
                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-wide text-stone-500 mb-1">
                        Biggest profitability unknown
                      </div>
                      <p className="text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">
                        {app.biggest_unknown}
                      </p>
                    </div>
                  )}

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span className="text-xs uppercase tracking-wide text-stone-500 mr-1">Set status:</span>
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(app.id, s)}
                        disabled={status === s}
                        className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                          status === s
                            ? `${STATUS_STYLES[s]} cursor-default`
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                    <a
                      href={`mailto:${app.email}?subject=${encodeURIComponent(`Petal & Profit Pilot: ${app.shop_name}`)}`}
                      className="ml-auto text-xs text-emerald-700 hover:text-emerald-900 underline"
                    >
                      Email {app.contact_name.split(' ')[0]}
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      <div className="text-sm text-stone-800 mt-0.5">{value || <span className="text-stone-400">Not provided</span>}</div>
    </div>
  );
}

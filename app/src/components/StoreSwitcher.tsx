'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Store { id: number; slug: string; name: string; }
interface SessionInfo {
  mode: 'legacy' | 'multi';
  user: { email: string; is_superadmin: boolean } | null;
  active_store: Store | null;
  stores: Store[];
}

export function StoreSwitcher() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [switching, setSwitching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/session').then(r => r.json()).then(setInfo).catch(() => setInfo(null));
  }, []);

  // Legacy single-tenant: render nothing.
  if (!info || info.mode !== 'multi' || !info.user) return null;

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const storeId = Number(e.target.value);
    if (!storeId || !info || storeId === info.active_store?.id) return;
    setSwitching(true);
    try {
      const res = await fetch('/api/session/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId }),
      });
      if (res.ok) {
        router.refresh();
        window.location.reload();
      }
    } finally {
      setSwitching(false);
    }
  }

  async function signOut() {
    await fetch('/api/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const showSwitcher = info.stores.length > 1 || info.user.is_superadmin;

  return (
    <div className="ml-auto flex items-center gap-3 text-xs">
      {info.user.is_superadmin && (
        <a href="/admin/stores" className="text-purple-700 hover:underline">Admin</a>
      )}
      {showSwitcher && (
        <select
          value={info.active_store?.id ?? ''}
          onChange={onChange}
          disabled={switching}
          className="border border-stone-300 rounded-md px-2 py-1 bg-white text-stone-700"
          title={info.user.is_superadmin ? 'Superadmin can switch to any store' : 'Switch store'}
        >
          {!info.active_store && <option value="">Select store…</option>}
          {info.stores.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      {!showSwitcher && info.active_store && (
        <span className="text-stone-500">{info.active_store.name}</span>
      )}
      <span className="text-stone-400">{info.user.email}</span>
      <button onClick={signOut} className="text-stone-500 hover:text-stone-900" title="Sign out">
        Sign out
      </button>
    </div>
  );
}

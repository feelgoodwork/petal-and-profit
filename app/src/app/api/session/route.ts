import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadSession, userStores, allStores } from '@/lib/auth/sessions';
import { isControlDbConfigured } from '@/lib/control-db';

const COOKIE_NAME = 'pp_auth';

/**
 * Returns the current session's user + active store + list of stores they
 * can switch to (or all stores for a superadmin). Used by the header store
 * switcher UI.
 */
export async function GET() {
  if (!isControlDbConfigured()) {
    return NextResponse.json({ mode: 'legacy', user: null, active_store: null, stores: [] });
  }

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const session = await loadSession(token);
  if (!session) {
    return NextResponse.json({ mode: 'multi', user: null, active_store: null, stores: [] });
  }

  const stores = session.is_superadmin ? await allStores() : await userStores(session.user_id);
  return NextResponse.json({
    mode: 'multi',
    user: {
      id: session.user_id,
      email: session.email,
      is_superadmin: session.is_superadmin,
    },
    active_store: session.active_store_id
      ? { id: session.active_store_id, slug: session.store_slug, name: session.store_name }
      : null,
    stores,
  });
}

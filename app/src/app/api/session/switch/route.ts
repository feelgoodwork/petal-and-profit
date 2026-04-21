import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loadSession, setActiveStore, userStores, allStores } from '@/lib/auth/sessions';
import { isControlDbConfigured } from '@/lib/control-db';

const COOKIE_NAME = 'pp_auth';

export async function POST(request: Request) {
  if (!isControlDbConfigured()) {
    return NextResponse.json({ error: 'Multi-store mode not enabled' }, { status: 400 });
  }
  const { store_id } = await request.json();
  const targetId = Number(store_id);
  if (!targetId) return NextResponse.json({ error: 'store_id required' }, { status: 400 });

  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const session = await loadSession(token);
  if (!session || !token) {
    return NextResponse.json({ error: 'not signed in' }, { status: 401 });
  }

  // Authorization: superadmin can switch to any active store. A regular
  // user can only switch to stores they are a member of.
  const allowed = session.is_superadmin
    ? await allStores()
    : await userStores(session.user_id);
  if (!allowed.some(s => s.id === targetId)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  await setActiveStore(token, targetId);
  return NextResponse.json({ success: true, active_store_id: targetId });
}

import { NextResponse } from 'next/server';
import { isControlDbConfigured } from '@/lib/control-db';
import { authenticate } from '@/lib/auth/users';
import { createSession, userStores } from '@/lib/auth/sessions';

const COOKIE_NAME = 'pp_auth';

export async function POST(request: Request) {
  const body = await request.json();

  // Multi-store mode: authenticate against the control DB.
  if (isControlDbConfigured()) {
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password required' }, { status: 400 });
    }

    const user = await authenticate(email, password);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Pick the user's default active store. Superadmins with multiple stores
    // will use the store switcher to choose; we seed them onto their first
    // membership for the initial redirect.
    const stores = await userStores(user.id);
    const activeStoreId = stores[0]?.id ?? null;

    const token = await createSession(user.id, activeStoreId);
    const response = NextResponse.json({
      success: true,
      is_superadmin: user.is_superadmin,
      active_store: stores[0] ?? null,
      stores,
    });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14,
      path: '/',
    });
    return response;
  }

  // Legacy single-tenant mode: plain password against APP_PASSWORD env var.
  const password = process.env.APP_PASSWORD || 'petalandprofit2026';
  if (body.password === password) {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return response;
  }

  return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
}

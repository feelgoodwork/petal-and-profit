import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'pp_auth';

// Simple heuristic: the legacy password gate sets pp_auth="true". Session
// tokens from the control DB are 64-char hex strings. If CONTROL_DATABASE_URL
// is set, we validate against the control DB; otherwise we keep the legacy
// password check working so the app doesn't lock itself out during the
// multi-store migration.
function looksLikeSessionToken(value: string | undefined): boolean {
  return !!value && /^[a-f0-9]{64}$/.test(value);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page, static files, and login/logout APIs through
  if (
    pathname === '/login' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/marginosa/') ||
    pathname.endsWith('.svg')
  ) {
    return NextResponse.next();
  }
  if (
    pathname === '/api/login' ||
    pathname === '/api/logout' ||
    pathname === '/api/session' ||
    pathname === '/api/pilot-application' ||
    pathname.startsWith('/api/usda/sync') ||
    pathname.startsWith('/api/fiftyflowers')
  ) {
    return NextResponse.next();
  }
  if (
    pathname === '/landing.html' ||
    pathname === '/marginosa.html' ||
    pathname === '/demo.html' ||
    pathname === '/strategy.html' ||
    pathname === '/pilot' ||
    pathname === '/full-sales' ||
    pathname === '/full-sales.html'
  ) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(AUTH_COOKIE)?.value;

  // Multi-store mode: session tokens validated server-side. The actual
  // session->store->DB-URL resolution happens inside getDb(), so middleware
  // only does a cheap cookie-shape check here. An invalid session will
  // surface as a missing/incorrect DB result, not a 500, because middleware
  // runs in the edge runtime which can't import our server-side auth libs
  // without pulling pg into edge bundles. The shape check below is "is
  // the token at least plausible."
  if (process.env.CONTROL_DATABASE_URL) {
    if (looksLikeSessionToken(cookie)) return NextResponse.next();
  } else if (cookie === 'true') {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

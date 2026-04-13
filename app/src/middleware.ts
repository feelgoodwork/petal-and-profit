import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const AUTH_COOKIE = 'pp_auth';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow the login page and static files through
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.endsWith('.svg')) {
    return NextResponse.next();
  }

  // Allow the login API and internal sync endpoints
  if (pathname === '/api/login' || pathname === '/api/usda/sync') {
    return NextResponse.next();
  }

  // Allow public static pages
  if (pathname === '/landing.html' || pathname === '/demo.html' || pathname === '/strategy.html') {
    return NextResponse.next();
  }

  // Check auth cookie
  const auth = request.cookies.get(AUTH_COOKIE);
  if (auth?.value === 'true') {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json();
  const password = process.env.APP_PASSWORD || 'petalandprofit2026';

  if (body.password === password) {
    const response = NextResponse.json({ success: true });
    response.cookies.set('pp_auth', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return response;
  }

  return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
}

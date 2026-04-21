import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession } from '@/lib/auth/sessions';
import { isControlDbConfigured } from '@/lib/control-db';

const COOKIE_NAME = 'pp_auth';

export async function POST() {
  if (isControlDbConfigured()) {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      await destroySession(token).catch(() => {});
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return response;
}

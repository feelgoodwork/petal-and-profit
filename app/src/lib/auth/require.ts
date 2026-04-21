import { cookies } from 'next/headers';
import { loadSession, SessionContext } from '@/lib/auth/sessions';
import { isControlDbConfigured } from '@/lib/control-db';

const COOKIE_NAME = 'pp_auth';

export async function getCurrentSession(): Promise<SessionContext | null> {
  if (!isControlDbConfigured()) return null;
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return loadSession(token);
}

/**
 * Ensures the caller is a signed-in superadmin. Returns the session on
 * success or an error Response the route handler should return as-is.
 */
export async function requireSuperadmin(): Promise<
  { ok: true; session: SessionContext } | { ok: false; response: Response }
> {
  if (!isControlDbConfigured()) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Multi-store mode not enabled (CONTROL_DATABASE_URL not set)' },
        { status: 400 },
      ),
    };
  }
  const session = await getCurrentSession();
  if (!session) {
    return { ok: false, response: Response.json({ error: 'Not signed in' }, { status: 401 }) };
  }
  if (!session.is_superadmin) {
    return { ok: false, response: Response.json({ error: 'Superadmin only' }, { status: 403 }) };
  }
  return { ok: true, session };
}

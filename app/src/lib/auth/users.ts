import bcrypt from 'bcryptjs';
import { getControlDb } from '@/lib/control-db';

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  is_superadmin: boolean;
}

export async function authenticate(email: string, password: string): Promise<UserRow | null> {
  if (!email || !password) return null;
  const sql = getControlDb();
  const rows = await sql`
    SELECT id, email, password_hash, is_superadmin
    FROM users
    WHERE email = ${email.trim().toLowerCase()}
    LIMIT 1
  ` as UserRow[];
  if (rows.length === 0) return null;
  const user = rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return null;

  // Record last login without blocking
  sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`.catch(() => {});

  return user;
}

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, 12);
}

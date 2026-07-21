import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createServerClient } from './supabase'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-min-32-chars-long'
)

export interface AdminSession {
  id: string
  email: string
  full_name: string
  role: 'super_admin' | 'admin'
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSession(admin: AdminSession): Promise<string> {
  const token = await new SignJWT({ ...admin })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET)

  return token
}

export async function verifySession(token: string): Promise<AdminSession | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET)
    return verified.payload as unknown as AdminSession
  } catch {
    return null
  }
}

export async function getSession(): Promise<AdminSession | null> {
  const cookieStore = cookies()
  const token = cookieStore.get('admin_session')?.value

  if (!token) return null

  return verifySession(token)
}

export async function login(email: string, password: string): Promise<AdminSession | null> {
  const supabase = createServerClient()

  const { data: admin, error } = await supabase
    .from('admins')
    .select('*')
    .eq('email', email)
    .eq('is_active', true)
    .single()

  if (error || !admin) return null

  const isValid = await verifyPassword(password, admin.password_hash)
  if (!isValid) return null

  // Update last login
  await supabase
    .from('admins')
    .update({ last_login: new Date().toISOString() })
    .eq('id', admin.id)

  return {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    role: admin.role,
  }
}

export async function logout(): Promise<void> {
  const cookieStore = cookies()
  cookieStore.delete('admin_session')
}

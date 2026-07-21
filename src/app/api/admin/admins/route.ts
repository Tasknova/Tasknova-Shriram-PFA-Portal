import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession, hashPassword } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id, full_name, email, role, is_active, created_at, last_login')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch admins' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { full_name, email, password, role } = body

  if (!full_name || !email || !password || !role) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    // Check if email already exists
    const { data: existing } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }

    // Hash password and create admin
    const password_hash = await hashPassword(password)

    const { error } = await supabase
      .from('admins')
      .insert({
        full_name,
        email,
        password_hash,
        role,
        is_active: true,
      })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Create error:', error)
    return NextResponse.json({ error: 'Failed to create admin' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { id, is_active } = body

  if (!id || is_active === undefined) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  // Prevent self-deactivation
  if (id === session.id && !is_active) {
    return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { error } = await supabase
      .from('admins')
      .update({ is_active })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return NextResponse.json({ error: 'Failed to update admin' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  
  if (!session || session.role !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }

  // Prevent self-deletion
  if (id === session.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { error } = await supabase
      .from('admins')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete admin' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    if (id) {
      const { data, error } = await supabase
        .from('blogs')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return NextResponse.json(data)
    }

    const { data, error } = await supabase
      .from('blogs')
      .select('id, title, author, category, read_time, is_published, published_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch blogs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const supabase = createServerClient()

  try {
    const blogData = {
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      published_at: body.is_published ? new Date().toISOString() : null
    }

    const { data, error } = await supabase
      .from('blogs')
      .insert([blogData])
      .select()

    if (error) {
      console.error('Supabase error:', error)
      throw error
    }

    return NextResponse.json(data[0])
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Create error:', error)
    return NextResponse.json({ 
      error: 'Failed to create blog',
      details: errorMessage
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const body = await request.json()

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const updateData = {
      ...body,
      updated_at: new Date().toISOString(),
      published_at: body.is_published ? (body.published_at || new Date().toISOString()) : null
    }

    // Remove id from updateData if it exists
    delete updateData.id
    delete updateData.created_at

    const { error } = await supabase
      .from('blogs')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return NextResponse.json({ error: 'Failed to update blog' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete blog' }, { status: 500 })
  }
}

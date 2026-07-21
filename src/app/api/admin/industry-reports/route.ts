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
        .from('industry_reports')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return NextResponse.json(data)
    }

    const { data, error } = await supabase
      .from('industry_reports')
      .select('id, title, year, pages, downloads, is_published, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch industry reports' }, { status: 500 })
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
    const reportData = {
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('industry_reports')
      .insert([reportData])
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
      error: 'Failed to create industry report',
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
      updated_at: new Date().toISOString()
    }

    // Remove id and created_at from updateData
    delete updateData.id
    delete updateData.created_at

    const { error } = await supabase
      .from('industry_reports')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update error:', error)
    return NextResponse.json({ error: 'Failed to update industry report' }, { status: 500 })
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
      .from('industry_reports')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete industry report' }, { status: 500 })
  }
}

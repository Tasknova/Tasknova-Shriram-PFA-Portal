import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { generateEmbedding } from '@/lib/embeddings'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const filter = searchParams.get('filter') || 'all'
  const sort = searchParams.get('sort') || 'recent'
  const includePending = searchParams.get('includePending') === 'true'
  const approvalStatus = searchParams.get('approvalStatus') || 'all'

  const orderBy = sort === 'accessed' ? 'last_accessed_at' : sort === 'confidence' ? 'confidence_score' : 'created_at'
  const ascending = sort === 'confidence'

  const supabase = createServerClient()

  try {
    let query = supabase
      .from('company_context_memory')
      .select('*')
      .eq('user_id', session.id)

    if (!includePending) {
      query = query.eq('approval_status', 'approved')
    }

    if (approvalStatus !== 'all') {
      query = query.eq('approval_status', approvalStatus)
    }

    if (filter === 'pinned') {
      query = query.eq('is_pinned', true)
    }

    const { data, error } = await query.order(orderBy, { ascending })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Company context memory fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch company context memory' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, is_pinned, action } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    if (action === 'approve') {
      const { data: memory, error: fetchError } = await supabase
        .from('company_context_memory')
        .select('id, user_id, insight_text, approval_status')
        .eq('id', id)
        .eq('user_id', session.id)
        .single()

      if (fetchError || !memory) {
        throw fetchError || new Error('Context memory not found')
      }

      if (memory.approval_status !== 'approved') {
        const embeddingResponse = await generateEmbedding(memory.insight_text)
        if (embeddingResponse.error || !embeddingResponse.embedding.length) {
          throw new Error(embeddingResponse.error || 'Failed to generate embedding')
        }

        const { error: embeddingError } = await supabase
          .from('company_context_embeddings')
          .insert({
            user_id: session.id,
            context_memory_id: id,
            embedding: embeddingResponse.embedding,
          })

        if (embeddingError) throw embeddingError
      }

      const { error: approveError } = await supabase
        .from('company_context_memory')
        .update({
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: session.id,
          approved_disapproved_at: new Date().toISOString(),
          approved_disapproved_by: session.id,
        })
        .eq('id', id)
        .eq('user_id', session.id)

      if (approveError) throw approveError

      return NextResponse.json({ success: true })
    }

    if (action === 'disapprove') {
      const { error: embDeleteError } = await supabase
        .from('company_context_embeddings')
        .delete()
        .eq('context_memory_id', id)
        .eq('user_id', session.id)

      if (embDeleteError) throw embDeleteError

      const { error: rejectError } = await supabase
        .from('company_context_memory')
        .update({
          approval_status: 'disapproved',
          approved_at: null,
          approved_by: null,
          approved_disapproved_at: new Date().toISOString(),
          approved_disapproved_by: session.id,
          is_pinned: false,
        })
        .eq('id', id)
        .eq('user_id', session.id)

      if (rejectError) throw rejectError

      return NextResponse.json({ success: true })
    }

    if (typeof is_pinned !== 'boolean') {
      return NextResponse.json({ error: 'is_pinned is required for pin updates' }, { status: 400 })
    }

    const { error } = await supabase
      .from('company_context_memory')
      .update({ is_pinned })
      .eq('id', id)
      .eq('user_id', session.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Company context memory update error:', error)
    return NextResponse.json({ error: 'Failed to update company context memory' }, { status: 500 })
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
      .from('company_context_memory')
      .delete()
      .eq('id', id)
      .eq('user_id', session.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Company context memory delete error:', error)
    return NextResponse.json({ error: 'Failed to delete company context memory' }, { status: 500 })
  }
}

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
  const projectId = searchParams.get('projectId')
  const filter = searchParams.get('filter') || 'all'
  const sort = searchParams.get('sort') || 'recent'
  const includePending = searchParams.get('includePending') === 'true'
  const approvalStatus = searchParams.get('approvalStatus') || 'all'

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const orderBy = sort === 'accessed' ? 'last_accessed_at' : sort === 'confidence' ? 'confidence_score' : 'created_at'
  const ascending = sort === 'confidence'

  const supabase = createServerClient()

  try {
    let query = supabase
      .from('project_context_memory')
      .select('*')
      .eq('project_id', projectId)
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
    console.error('Project context memory fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch project context memory' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, projectId, is_pinned, action } = body

  if (!id || !projectId) {
    return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    if (action === 'approve') {
      const { data: memory, error: fetchError } = await supabase
        .from('project_context_memory')
        .select('id, user_id, project_id, insight_text, approval_status')
        .eq('id', id)
        .eq('project_id', projectId)
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
          .from('project_context_embeddings')
          .insert({
            user_id: session.id,
            context_memory_id: id,
            embedding: embeddingResponse.embedding,
          })

        if (embeddingError) throw embeddingError
      }

      const { error: approveError } = await supabase
        .from('project_context_memory')
        .update({
          approval_status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: session.id,
          approved_disapproved_at: new Date().toISOString(),
          approved_disapproved_by: session.id,
        })
        .eq('id', id)
        .eq('project_id', projectId)
        .eq('user_id', session.id)

      if (approveError) throw approveError

      return NextResponse.json({ success: true })
    }

    if (action === 'disapprove') {
      const { error: embDeleteError } = await supabase
        .from('project_context_embeddings')
        .delete()
        .eq('context_memory_id', id)
        .eq('user_id', session.id)

      if (embDeleteError) throw embDeleteError

      const { error: rejectError } = await supabase
        .from('project_context_memory')
        .update({
          approval_status: 'disapproved',
          approved_at: null,
          approved_by: null,
          approved_disapproved_at: new Date().toISOString(),
          approved_disapproved_by: session.id,
          is_pinned: false,
        })
        .eq('id', id)
        .eq('project_id', projectId)
        .eq('user_id', session.id)

      if (rejectError) throw rejectError

      return NextResponse.json({ success: true })
    }

    if (typeof is_pinned !== 'boolean') {
      return NextResponse.json({ error: 'is_pinned is required for pin updates' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_context_memory')
      .update({ is_pinned })
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('user_id', session.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Project context memory update error:', error)
    return NextResponse.json({ error: 'Failed to update project context memory' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const projectId = searchParams.get('projectId')

  if (!id || !projectId) {
    return NextResponse.json({ error: 'id and projectId are required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { error } = await supabase
      .from('project_context_memory')
      .delete()
      .eq('id', id)
      .eq('project_id', projectId)
      .eq('user_id', session.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Project context memory delete error:', error)
    return NextResponse.json({ error: 'Failed to delete project context memory' }, { status: 500 })
  }
}

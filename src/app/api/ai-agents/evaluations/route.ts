import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface EvaluationRecord {
  id: string
  call_id: string
  status: 'processing' | 'completed' | 'failed'
  score: number | null
  overall_score: number | null
  overall_feedback?: string | null
  issues?: string[]
  suggestions?: string[]
  error_message?: string | null
  processed_at?: string | null
  created_at: string
  ai_calls?: {
    call_id: string
    agent_id: string
    customer_number: string | null
    status: string
    call_type: string
    duration: number
    created_at: string
    recording_url: string | null
    outcome: string | null
    agent_config?: Record<string, string> | null
    ai_agents?: { name: string }
  }
}

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const searchParams = req.nextUrl.searchParams

    // Get filter parameters
    const minScore = searchParams.get('min_score')
    const maxScore = searchParams.get('max_score')
    const agentId = searchParams.get('agent_id')
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // ── Shriram PFA filter ───────────────────────────────────────────────────
    // Only return evaluations for calls made by Shriram PFA or Shriram PFA_2.
    const { data: allAgents } = await client
      .from('ai_agents')
      .select('agent_id, name')

    const shriramAgentIds = (allAgents || [])
      .filter((a: { agent_id: string; name: string }) => isShriramPFAAgent(a.name))
      .map((a: { agent_id: string }) => a.agent_id)

    if (shriramAgentIds.length === 0) {
      return NextResponse.json(
        { evaluations: [], total: 0, limit, offset },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    // Fetch call_ids that belong to Shriram PFA agents
    const { data: shriramCalls } = await client
      .from('ai_calls')
      .select('call_id')
      .in('agent_id', shriramAgentIds)

    const shriramCallIds = (shriramCalls || []).map((c: { call_id: string }) => c.call_id)

    if (shriramCallIds.length === 0) {
      return NextResponse.json(
        { evaluations: [], total: 0, limit, offset },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }
    // ────────────────────────────────────────────────────────────────────────

    let query = client
      .from('ai_evaluations')
      .select(`
        *,
        ai_calls(
          call_id,
          agent_id,
          customer_number,
          status,
          call_type,
          duration,
          created_at,
          recording_url,
          outcome,
          *,
          ai_agents(name)
        )
      `, { count: 'exact' })
      .in('call_id', shriramCallIds) // ← only Shriram PFA evaluations

    // Apply additional filters
    if (minScore) {
      query = query.gte('overall_score', parseFloat(minScore))
    }
    if (maxScore) {
      query = query.lte('overall_score', parseFloat(maxScore))
    }
    if (status) {
      query = query.eq('status', status)
    }

    const { data: allEvals, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch evaluations' },
        { status: 500 }
      )
    }

    // Client-side filter by specific agent_id if provided
    let evaluations: EvaluationRecord[] = (allEvals as EvaluationRecord[]) || []
    if (agentId) {
      evaluations = evaluations.filter((e) => e.ai_calls?.agent_id === agentId)
    }

    return NextResponse.json({
      evaluations,
      total: count,
      limit,
      offset,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Error fetching evaluations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

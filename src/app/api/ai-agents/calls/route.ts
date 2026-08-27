import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const searchParams = req.nextUrl.searchParams

    // Get filter parameters
    const agentId = searchParams.get('agent_id')
    const status = searchParams.get('status')
    const callType = searchParams.get('call_type')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // ── Shriram PFA filter ───────────────────────────────────────────────────
    // Only show calls that belong to Shriram PFA or Shriram PFA_2 agents.
    // Resolve the allowed agent IDs from the ai_agents table first.
    const { data: allAgents } = await client
      .from('ai_agents')
      .select('agent_id, name')

    const shriramAgentIds = (allAgents || [])
      .filter((a: { agent_id: string; name: string }) => isShriramPFAAgent(a.name))
      .map((a: { agent_id: string }) => a.agent_id)

    // If no Shriram PFA agents exist yet, return an empty result set
    if (shriramAgentIds.length === 0) {
      return NextResponse.json(
        { calls: [], total: 0, limit, offset },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }
    // ────────────────────────────────────────────────────────────────────────

    let query = client
      .from('ai_calls')
      .select(`
        *,
        ai_agents(name),
        ai_transcripts(*),
        ai_evaluations(*)
      `, { count: 'exact' })
      .in('agent_id', shriramAgentIds) // ← only Shriram PFA calls

    // Apply additional filters
    if (agentId) {
      query = query.eq('agent_id', agentId)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (callType) {
      query = query.eq('call_type', callType)
    }

    // Sort by created_at descending and apply pagination
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch calls' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      calls: data,
      total: count,
      limit,
      offset,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Error fetching calls:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

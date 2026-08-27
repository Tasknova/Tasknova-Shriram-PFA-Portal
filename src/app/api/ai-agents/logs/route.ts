import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('call_id')

    const client = createServerClient()

    // ── Shriram PFA filter ───────────────────────────────────────────────────
    // Resolve which agent IDs belong to Shriram PFA or Shriram PFA_2
    const { data: allAgents } = await client
      .from('ai_agents')
      .select('agent_id, name')

    const shriramAgentIds = (allAgents || [])
      .filter((a: { agent_id: string; name: string }) => isShriramPFAAgent(a.name))
      .map((a: { agent_id: string }) => a.agent_id)

    if (shriramAgentIds.length === 0) {
      return NextResponse.json(
        { logs: [] },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }
    // ────────────────────────────────────────────────────────────────────────

    // Source of truth: the ai_calls table which has the final recording_url
    // after IndusLabs sends it (either via call.completed or transcript.ready webhook)
    let query = client
      .from('ai_calls')
      .select('call_id, recording_url, status, created_at, updated_at, agent_id')
      // Show all calls that have a call_id, even if not completed
      .not('call_id', 'is', null)
      .in('agent_id', shriramAgentIds) // ← only Shriram PFA calls

    if (callId) {
      query = query.ilike('call_id', `%${callId}%`)
    }

    const { data: calls, error } = await query
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json(
      { logs: calls ?? [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('Error fetching recording logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

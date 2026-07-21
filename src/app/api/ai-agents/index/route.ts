import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'

export async function GET() {
  try {
    const client = createServerClient()

    // Optimized: Fetch agents with aggregated metrics using SQL
    // This uses a single query with aggregation instead of N+1 queries
    const { data: enrichedAgents, error } = await client.rpc(
      'get_agents_with_metrics'
    )

    if (error) {
      console.error('RPC error:', error)
      
      // Fallback: Use basic query if RPC doesn't exist
      console.log('RPC not available, using basic query...')
      const { data: agents, error: basicError } = await client
        .from('ai_agents')
        .select('*')
        .order('created_at', { ascending: false })

      if (basicError) {
        console.error('Database error:', basicError)
        return NextResponse.json(
          { error: 'Failed to fetch agents' },
          { status: 500 }
        )
      }

      const filteredBasicAgents = (agents || []).filter(
        (agent: { name: string }) => isShriramPFAAgent(agent.name)
      )

      const response = NextResponse.json({
        agents: filteredBasicAgents,
      })
      response.headers.set('Cache-Control', 'no-store, max-age=0')
      return response
    }

    const filteredAgents = (enrichedAgents || []).filter(
      (agent: { name: string }) => isShriramPFAAgent(agent.name)
    )

    const response = NextResponse.json({
      agents: filteredAgents,
    })
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // Check what configs exist in the database
    const { data: configs, error: configsError } = await client
      .from('ai_agent_configs')
      .select('agent_id, status, synced_at')

    if (configsError) {
      return NextResponse.json({
        error: 'Failed to fetch configs',
        details: configsError,
      })
    }

    // Get all agents
    const { data: agents, error: agentsError } = await client
      .from('ai_agents')
      .select('agent_id, name')

    if (agentsError) {
      return NextResponse.json({
        error: 'Failed to fetch agents',
        details: agentsError,
      })
    }

    // Create a map of which agents have configs
    const configMap: Record<string, boolean> = {}
    configs?.forEach((config) => {
      configMap[config.agent_id] = true
    })

    const agentsWithStatus = agents?.map((agent) => ({
      agent_id: agent.agent_id,
      name: agent.name,
      has_config: !!configMap[agent.agent_id],
    }))

    return NextResponse.json({
      success: true,
      agents_count: agents?.length || 0,
      configs_count: configs?.length || 0,
      agents: agentsWithStatus,
      configs: configs,
    })
  } catch (error) {
    console.error('Error checking config status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'

interface IndusLabsAgent {
  id?: string
  agent_id?: string
  name: string
  description?: string
  status?: string
  [key: string]: unknown
}

export async function POST(): Promise<NextResponse> {
  try {
    const client = createServerClient()

    // Get API key from settings
    const { data: settingsData } = await client
      .from('ai_settings')
      .select('setting_value')
      .eq('setting_key', 'induslabs_api_key')
      .single()

    if (!settingsData || !settingsData.setting_value) {
      return NextResponse.json(
        { error: 'IndusLabs API key not configured' },
        { status: 400 }
      )
    }

    const apiKey = settingsData.setting_value

    // Fetch agents from IndusLabs API
    const indusLabsResponse = await fetch('https://developer.induslabs.io/api/agents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
      }),
    })

    if (!indusLabsResponse.ok) {
      const errorText = await indusLabsResponse.text()
      console.error('IndusLabs API error:', errorText, indusLabsResponse.status)
      return NextResponse.json(
        {
          error: `IndusLabs API error: ${indusLabsResponse.statusText}`,
          status: indusLabsResponse.status,
        },
        { status: indusLabsResponse.status }
      )
    }

    const indusLabsAgents = await indusLabsResponse.json()

    // Normalize agents array (handle different response formats)
    // Response structure: { status_code, message, data: { agents: [...] } }
    let agents: IndusLabsAgent[] = []
    
    if (indusLabsAgents.data && Array.isArray(indusLabsAgents.data.agents)) {
      agents = indusLabsAgents.data.agents
    } else if (indusLabsAgents.data && Array.isArray(indusLabsAgents.data)) {
      agents = indusLabsAgents.data
    } else if (Array.isArray(indusLabsAgents)) {
      agents = indusLabsAgents
    } else if (indusLabsAgents.agents && Array.isArray(indusLabsAgents.agents)) {
      agents = indusLabsAgents.agents
    }

    if (!Array.isArray(agents) || agents.length === 0) {
      console.error('No agents found in response:', indusLabsAgents)
      return NextResponse.json(
        { error: 'No agents found from IndusLabs', response: indusLabsAgents },
        { status: 400 }
      )
    }

    // Upsert agents into database
    const upsertedAgents = []
    const errors = []
    
    for (const agent of agents) {
      try {
        const agentId = agent.agent_id || agent.id || `agent_${Math.random().toString(36).substr(2, 9)}`
        const agentName = agent.agent_name || agent.name || `Agent ${agentId}`

        console.log(`Upserting agent: ${agentId} - ${agentName}`)

        const { data, error } = await client
          .from('ai_agents')
          .upsert(
            {
              agent_id: agentId,
              name: agentName,
              status: agent.is_active ? 'active' : 'inactive',
              metadata: {
                induslabs_id: agent.id || agent.agent_id,
                description: agent.agent_description || agent.description || '',
                agent_type: agent.agent_type || '',
                synced_at: new Date().toISOString(),
                raw_data: agent,
              },
            },
            { onConflict: 'agent_id' }
          )
          .select()

        if (error) {
          console.error(`Error upserting agent ${agentId}:`, error)
          errors.push({ agent_id: agentId, error: error.message })
        } else if (data && data.length > 0) {
          console.log(`✓ Successfully upserted: ${agentId}`)
          upsertedAgents.push(data[0])
        } else {
          console.warn(`No data returned for upsert of ${agentId}`)
        }
      } catch (err) {
        console.error('Error in upsert loop:', err)
        errors.push({ error: String(err) })
      }
    }

    console.log(`Upserted ${upsertedAgents.length} agents, ${errors.length} errors`)
    
    if (errors.length > 0) {
      console.error('Upsert errors:', errors)
    }

    // Update last sync timestamp
    await client
      .from('ai_settings')
      .upsert(
        {
          setting_key: 'last_agents_sync',
          setting_value: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      )

    // Fetch all agents with metrics
    const { data: allAgents } = await client
      .from('ai_agents')
      .select('*')
      .order('created_at', { ascending: false })

    const enrichedAgents = await Promise.all(
      (allAgents || []).map(async (agent) => {
        const { data: callData } = await client
          .from('ai_calls')
          .select('call_id, status, call_type')
          .eq('agent_id', agent.agent_id)

        let evalData: Array<{ score: number }> = []
        if (callData && callData.length > 0) {
          const { data: evals } = await client
            .from('ai_evaluations')
            .select('score')
            .in('call_id', callData.map((c) => c.call_id))
          evalData = (evals as Array<{ score: number }>) || []
        }

        const totalCalls = callData?.length || 0
        const validCalls = callData?.filter((c) => c.call_type === 'valid').length || 0
        const failedCalls = callData?.filter((c) => c.call_type === 'failed').length || 0
        const avgScore =
          evalData && evalData.length > 0
            ? evalData.reduce((sum, e) => sum + e.score, 0) / evalData.length
            : 0

        return {
          ...agent,
          total_calls: totalCalls,
          valid_calls: validCalls,
          failed_calls: failedCalls,
          avg_score: Math.round(avgScore * 100) / 100,
        }
      })
    )

    const filteredAgents = enrichedAgents.filter((agent) => isShriramPFAAgent(agent.name))

    return NextResponse.json({
      success: true,
      synced_count: upsertedAgents.length,
      error_count: errors.length,
      errors: errors,
      agents: filteredAgents,
    })
  } catch (error) {
    console.error('Error syncing agents from IndusLabs:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(req: NextRequest) {
  try {
    const client = createServerClient()
    console.log('Starting agent config sync...')

    // Get all agents from database
    const { data: agents, error: agentsError } = await client
      .from('ai_agents')
      .select('agent_id, name')

    if (agentsError || !agents) {
      console.error('Failed to fetch agents:', agentsError)
      return NextResponse.json(
        { error: 'Failed to fetch agents' },
        { status: 500 }
      )
    }

    console.log(`Found ${agents.length} agents to sync`)

    // Get access token
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      console.error('Failed to authenticate with IndusLabs - no token obtained')
      return NextResponse.json(
        { error: 'Failed to authenticate with IndusLabs' },
        { status: 500 }
      )
    }

    console.log(`Access token obtained, length: ${accessToken.length}`)

    const results: { agent_id: string; status: string }[] = []
    const apiKey = process.env.INDUSLABS_API_KEY

    // Fetch config for each agent
    for (const agent of agents) {
      try {
        console.log(`Fetching config for agent: ${agent.agent_id}`)
        const response = await fetch(
          `https://developer.induslabs.io/api/agents/${agent.agent_id}/configs?api_key=${apiKey}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Failed to fetch config for agent ${agent.agent_id}:`, {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          })
          continue
        }

        const configData = await response.json()
        console.log(`Config data for ${agent.agent_id}:`, configData)
        const configs = Array.isArray(configData) ? configData : [configData]

        if (configs.length === 0) {
          console.warn(`No configs found for agent ${agent.agent_id}`)
          continue
        }

        const config = configs[0]
        const normalizedStatus = config.status === 'inactive' ? 'inactive' : 'active'

        // Store or update config in database
        console.log(`Upserting config for agent ${agent.agent_id}...`)
        const { error: upsertError } = await client
          .from('ai_agent_configs')
          .upsert(
            {
              agent_id: agent.agent_id,
              system_prompt: config.system_prompt || null,
              starting_instructions: config.starting_instructions || null,
              agent_type: config.agent_type || null,
              guardrail_ids: config.guardrail_ids || [],
              call_infields: config.call_infields || [],
              tts_config: config.tts_config || null,
              llm_config: config.llm_config || null,
              stt_config: config.stt_config || null,
              vad_config: config.vad_config || null,
              notes: config.notes || null,
              status: normalizedStatus,
              version: config.version || 1,
              is_current: config.is_current || true,
              full_config: config,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'agent_id' }
          )

        if (upsertError) {
          console.error(`Failed to store config for agent ${agent.agent_id}:`, upsertError)
        } else {
          if (config.system_prompt) {
            const { data: latestPrompt } = await client
              .from('prompt_versions')
              .select('id, version, prompt_text')
              .eq('agent_id', agent.agent_id)
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            const latestText = latestPrompt?.prompt_text || null
            if (latestText !== config.system_prompt) {
              const nextVersionNumber = latestPrompt?.version
                ? Number.parseInt(latestPrompt.version, 10) + 1
                : 1

              await client
                .from('prompt_versions')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('agent_id', agent.agent_id)

              const { error: promptInsertError } = await client
                .from('prompt_versions')
                .insert({
                  agent_id: agent.agent_id,
                  version: Number.isFinite(nextVersionNumber)
                    ? String(nextVersionNumber)
                    : '1',
                  prompt_text: config.system_prompt,
                  is_active: true,
                  performance_score: null,
                  call_count: 0,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })

              if (promptInsertError) {
                console.error(
                  `Failed to insert prompt version for agent ${agent.agent_id}:`,
                  promptInsertError
                )
              }
            }
          }
          console.log(`Successfully synced config for agent ${agent.agent_id}`)
          results.push({
            agent_id: agent.agent_id,
            status: 'synced',
          })
        }
      } catch (error) {
        console.error(`Error fetching config for agent ${agent.agent_id}:`, error)
      }
    }

    console.log(`Sync completed: ${results.length} agents synced`)
    return NextResponse.json({
      success: true,
      message: `Synced configs for ${results.length} agents`,
      results,
    })
  } catch (error) {
    console.error('Error syncing agent configs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync configs' },
      { status: 500 }
    )
  }
}

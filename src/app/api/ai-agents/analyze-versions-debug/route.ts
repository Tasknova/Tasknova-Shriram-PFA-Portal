import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

export async function GET() {
  try {
    const client = createServerClient()

    // Get all agents from local database
    const { data: agents } = await client
      .from('ai_agents')
      .select('agent_id, name')
      .limit(15)
      .order('created_at', { ascending: false })

    console.log(`=== ANALYZING ${agents?.length} AGENTS ===`)

    // For each agent, fetch versions from IndusLabs with detailed error logging
    const agentVersionsData = []

    for (const agent of agents || []) {
      console.log(`\nFetching versions for: ${agent.agent_id} (${agent.name})`)

      try {
        // Get fresh token for each agent (prevents token expiration issues)
        const accessToken = await getIndusLabsAccessToken(true) // forceRefresh = true

        if (!accessToken) {
          console.error(`  Failed to get access token for ${agent.agent_id}`)
          agentVersionsData.push({
            agent_id: agent.agent_id,
            agent_name: agent.name,
            total_versions: 0,
            response_status: 0,
            error: 'Failed to get access token',
            versions: [],
          })
          continue
        }

        const url = `https://developer.induslabs.io/api/agents/${agent.agent_id}/configs`
        console.log(`  URL: ${url}`)

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        console.log(`  Response Status: ${response.status} ${response.statusText}`)

        let versions: unknown[] = []
        let responseData: unknown = null
        let parseError = null

        if (response.ok) {
          try {
            responseData = await response.json()
            console.log(`  Response Type: ${typeof responseData}`)
            console.log(`  Is Array: ${Array.isArray(responseData)}`)

            if (Array.isArray(responseData)) {
              versions = responseData
            } else if (
              typeof responseData === 'object' &&
              responseData !== null &&
              'configs' in responseData
            ) {
              versions = (responseData as Record<string, unknown>).configs as unknown[]
            } else if (
              typeof responseData === 'object' &&
              responseData !== null &&
              'data' in responseData
            ) {
              versions = (responseData as Record<string, unknown>).data as unknown[]
            }

            console.log(`  Versions Found: ${versions.length}`)
          } catch (e) {
            parseError = String(e)
            console.log(`  JSON Parse Error: ${parseError}`)
          }
        } else {
          const text = await response.text()
          console.log(`  Error Response: ${text.substring(0, 200)}`)
        }

        // Find current version
        const currentVersion = (versions as Array<Record<string, unknown>>).find(
          (v) => v.is_current === true || v.status === 'published'
        ) as Record<string, unknown> | undefined

        agentVersionsData.push({
          agent_id: agent.agent_id,
          agent_name: agent.name,
          total_versions: versions.length,
          response_status: response.status,
          parse_error: parseError,
          versions: (versions as Array<Record<string, unknown>>)
            .slice(0, 10)
            .map((v, idx) => ({
              version_number: v.version || `v${idx + 1}`,
              status: v.status || 'unknown',
              is_current: v.is_current || false,
              system_prompt_length: (v.system_prompt as string || '').length,
              starting_instructions_length: (v.starting_instructions as string || '').length,
              created_at: v.created_at,
            })),
          current_version: currentVersion
            ? {
                version_number: currentVersion.version || 'current',
                status: currentVersion.status || 'published',
                system_prompt_length: (currentVersion.system_prompt as string || '').length,
              }
            : null,
        })
      } catch (error) {
        console.error(`Error for ${agent.agent_id}:`, error)
        agentVersionsData.push({
          agent_id: agent.agent_id,
          agent_name: agent.name,
          error: String(error),
          total_versions: 0,
          versions: [],
          current_version: null,
        })
      }
    }

    // Summary
    const summary = {
      total_agents: agentVersionsData.length,
      total_versions_across_all: agentVersionsData.reduce(
        (sum: number, a: Record<string, unknown>) => sum + (a.total_versions as number || 0),
        0
      ),
      agents_with_versions: agentVersionsData.filter(
        (a: Record<string, unknown>) => (a.total_versions as number) > 0
      ).length,
      agents_with_no_versions: agentVersionsData.filter(
        (a: Record<string, unknown>) => (a.total_versions as number) === 0
      ).length,
    }

    return NextResponse.json(
      {
        summary,
        agents: agentVersionsData,
        timestamp: new Date().toISOString(),
      },
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error analyzing versions:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

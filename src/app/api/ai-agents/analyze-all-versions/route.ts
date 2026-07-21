import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

export async function GET() {
  try {
    const client = createServerClient()

    // Get all agents from local database
    const { data: agents, error: agentsError } = await client
      .from('ai_agents')
      .select('agent_id, name')
      .order('created_at', { ascending: false })

    if (agentsError) {
      return NextResponse.json(
        { error: 'Failed to fetch agents', details: agentsError },
        { status: 500 }
      )
    }

    const accessToken = await getIndusLabsAccessToken()

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to obtain IndusLabs access token' },
        { status: 500 }
      )
    }

    // For each agent, fetch versions from IndusLabs
    const agentVersionsData = []

    for (const agent of agents || []) {
      try {
        const response = await fetch(
          `https://developer.induslabs.io/api/agents/${agent.agent_id}/configs`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        )

        let versions: unknown[] = []
        let currentVersion: Record<string, unknown> | null = null

        if (response.ok) {
          const data = await response.json()
          if (Array.isArray(data)) {
            versions = data
          } else if (data.configs && Array.isArray(data.configs)) {
            versions = data.configs
          } else if (data.data && Array.isArray(data.data)) {
            versions = data.data
          }

          // Find current version (is_current = true)
          const currVer = (versions as Array<Record<string, unknown>>).find(
            (v) => v.is_current === true || v.status === 'published'
          )
          currentVersion = currVer as Record<string, unknown> | null
        }

        agentVersionsData.push({
          agent_id: agent.agent_id,
          agent_name: agent.name,
          total_versions: versions.length,
          versions: (versions as Array<Record<string, unknown>>).map((v, idx) => ({
            version_number: v.version || `v${idx + 1}`,
            status: v.status || 'unknown',
            is_current: v.is_current || false,
            system_prompt_preview: (v.system_prompt as string || '')
              .substring(0, 100)
              .replace(/\n/g, ' ') + '...',
            system_prompt_length: (v.system_prompt as string || '').length,
            starting_instructions_preview: (v.starting_instructions as string || '')
              .substring(0, 80)
              .replace(/\n/g, ' ') + '...',
            created_at: v.created_at,
            updated_at: v.updated_at,
          })),
          current_version_info: currentVersion
            ? {
                version_number: currentVersion.version || 'current',
                status: currentVersion.status || 'published',
                system_prompt_length: (currentVersion.system_prompt as string || '').length,
                starting_instructions_length: (
                  currentVersion.starting_instructions as string || ''
                ).length,
                created_at: currentVersion.created_at,
              }
            : null,
        })
      } catch (error) {
        console.error(`Error fetching versions for agent ${agent.agent_id}:`, error)
        agentVersionsData.push({
          agent_id: agent.agent_id,
          agent_name: agent.name,
          error: String(error),
          total_versions: 0,
          versions: [],
          current_version_info: null,
        })
      }
    }

    // Calculate summary stats
    const summary = {
      total_agents: agentVersionsData.length,
      total_versions_across_all_agents: agentVersionsData.reduce(
        (sum: number, agent: Record<string, unknown>) => sum + (agent.total_versions as number || 0),
        0
      ),
      agents_with_no_versions: agentVersionsData.filter(
        (a: Record<string, unknown>) => (a.total_versions as number) === 0
      ).length,
      agents_with_multiple_versions: agentVersionsData.filter(
        (a: Record<string, unknown>) => (a.total_versions as number) > 1
      ).length,
      max_versions_for_single_agent: Math.max(
        0,
        ...agentVersionsData.map((a: Record<string, unknown>) => a.total_versions as number)
      ),
      version_distribution: {},
    }

    // Build version distribution
    agentVersionsData.forEach((agent: Record<string, unknown>) => {
      const versionCount = agent.total_versions as number
      const key = `${versionCount}_versions`
      ;(summary.version_distribution as Record<string, number>)[key] =
        ((summary.version_distribution as Record<string, number>)[key] || 0) + 1
    })

    return NextResponse.json({
      summary,
      agents: agentVersionsData,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error analyzing agent versions:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

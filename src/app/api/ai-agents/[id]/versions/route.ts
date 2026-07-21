import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAgentVersions } from '@/lib/aiAgentsUtils'
import { logAPICall } from '@/lib/apiLogger'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      await logAPICall({
        endpoint: `/api/ai-agents/${id}/versions`,
        method: 'GET',
        agent_id: id,
        status_code: 400,
        response_body: { error: 'Agent ID is required' },
        success: false,
        error_message: 'Agent ID is required',
        duration_ms: 0,
      })

      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    const client = createServerClient()
    let versions: Record<string, unknown>[] = []

    // First, try to fetch from local database
    const { data: agentConfig } = await client
      .from('ai_agent_configs')
      .select('*')
      .eq('agent_id', id)
      .single()

    const { data: promptVersions, error: pvError } = await client
      .from('prompt_versions')
      .select('*')
      .eq('agent_id', id)

    if (pvError) {
      console.error(`Error fetching prompt versions for ${id}:`, pvError)
    }

    // Add local config if exists
    if (agentConfig) {
      versions.push({
        version: agentConfig.version || 'current',
        system_prompt: agentConfig.system_prompt || '',
        starting_instructions: agentConfig.starting_instructions || '',
        agent_id: id,
        config_id: agentConfig.id,
        is_current: agentConfig.is_current || true,
        status: agentConfig.status || 'active',
        created_at: agentConfig.created_at,
        updated_at: agentConfig.updated_at,
        source: 'local',
      })
    }

    // Add local prompt versions
    if (promptVersions && promptVersions.length > 0) {
      promptVersions.forEach((pv: Record<string, unknown>) => {
        versions.push({
          version: pv.version || '1',
          system_prompt: pv.prompt_text || '',
          prompt_text: pv.prompt_text || '',
          agent_id: id,
          version_id: pv.id,
          is_active: pv.is_active || false,
          performance_score: pv.performance_score,
          call_count: pv.call_count,
          created_at: pv.created_at,
          source: 'local',
        })
      })
    }

    // If no local data, fetch from IndusLabs
    if (versions.length === 0) {
      console.log(`No local versions found for agent ${id}, fetching from IndusLabs...`)
      const induslabsVersions = await getIndusLabsAgentVersions(id)

      if (induslabsVersions && Array.isArray(induslabsVersions)) {
        versions = induslabsVersions.map((v: Record<string, unknown>) => ({
          version: v.version || 'current',
          system_prompt: v.system_prompt || '',
          starting_instructions: v.starting_instructions || '',
          agent_id: id,
          is_current: v.is_current || false,
          status: v.status || 'active',
          created_at: v.created_at,
          updated_at: v.updated_at,
          source: 'induslabs',
          _id: v._id,
          full_config: v,
        }))
      }
    } else {
      // If we have some local versions, try to supplement from IndusLabs
      console.log(`Found ${versions.length} local versions, checking IndusLabs for additional versions...`)
      const induslabsVersions = await getIndusLabsAgentVersions(id)
      
      if (induslabsVersions && Array.isArray(induslabsVersions)) {
        // Create a set of existing version numbers from local
        const existingVersions = new Set(versions.map((v: Record<string, unknown>) => String(v.version)))
        
        // Add IndusLabs versions that don't exist locally
        const addedCount = induslabsVersions.reduce((added: number, v: Record<string, unknown>) => {
          const versionNum = String(v.version || 'current')
          if (!existingVersions.has(versionNum)) {
            console.log(`Adding missing version from IndusLabs: ${versionNum}`)
            versions.push({
              version: v.version || 'current',
              system_prompt: v.system_prompt || '',
              starting_instructions: v.starting_instructions || '',
              agent_id: id,
              is_current: v.is_current || false,
              status: v.status || 'active',
              created_at: v.created_at,
              updated_at: v.updated_at,
              source: 'induslabs',
              _id: v._id,
              full_config: v,
            })
            return added + 1
          }
          return added
        }, 0)
        
        console.log(`Added ${addedCount} missing versions from IndusLabs`)
        
        // Re-sort by version number descending
        versions.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
          const aVer = Number(a.version) || 0
          const bVer = Number(b.version) || 0
          return bVer - aVer
        })
      }
    }

    const response = {
      agent_id: id,
      versions: versions,
      total_count: versions.length,
      sources: versions.length > 0 ? [...new Set(versions.map((v: Record<string, unknown>) => v.source))] : [],
    }

    await logAPICall({
      endpoint: `/api/ai-agents/${id}/versions`,
      method: 'GET',
      agent_id: id,
      status_code: 200,
      response_body: {
        agent_id: id,
        version_count: versions.length,
        sources: response.sources,
      },
      success: true,
      duration_ms: 0,
    })

    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch agent versions'
    console.error('Error fetching agent versions:', error)

    const { id } = params
    await logAPICall({
      endpoint: `/api/ai-agents/${id}/versions`,
      method: 'GET',
      agent_id: id,
      status_code: 500,
      response_body: { error: errorMessage },
      success: false,
      error_message: errorMessage,
      duration_ms: 0,
    })

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

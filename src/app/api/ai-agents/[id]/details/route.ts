import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAgentDetails } from '@/lib/aiAgentsUtils'
import { logAPICall } from '@/lib/apiLogger'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    const client = createServerClient()

    // Get local agent data from database
    const { data: localAgent, error: localError } = await client
      .from('ai_agents')
      .select(`
        *,
        prompt_versions:prompt_versions(*)
      `)
      .eq('agent_id', id)
      .single()

    if (localError || !localAgent) {
      console.error('Local agent not found:', localError)
      return NextResponse.json(
        { error: 'Agent not found in local database' },
        { status: 404 }
      )
    }

    // Fetch additional details from IndusLabs API (optional)
    let remoteDetails = null
    try {
      remoteDetails = await getIndusLabsAgentDetails(id)
    } catch (remoteError) {
      console.warn('Could not fetch remote agent details:', remoteError)
      // Continue without remote details - not a fatal error
    }

    // Return combined local and remote data
    // Remote details are optional - the response is still valid without them
    const agentDetails = {
      local: localAgent,
      remote: remoteDetails,
    }

    // Log successful API call
    await logAPICall({
      endpoint: `/api/ai-agents/${id}/details`,
      method: 'GET',
      agent_id: id,
      status_code: 200,
      response_body: agentDetails,
      success: true,
      duration_ms: 0,
    })

    return NextResponse.json(agentDetails)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch agent details'
    console.error('Error fetching agent details:', error)

    // Log failed API call
    const id = (params as { id: string }).id
    await logAPICall({
      endpoint: `/api/ai-agents/${id}/details`,
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

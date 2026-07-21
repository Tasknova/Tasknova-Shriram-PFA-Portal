import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

export async function GET(req: NextRequest) {
  try {
    const agentId = req.nextUrl.searchParams.get('agent_id')

    if (!agentId) {
      return NextResponse.json(
        { error: 'agent_id query parameter is required' },
        { status: 400 }
      )
    }

    const accessToken = await getIndusLabsAccessToken()

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to obtain IndusLabs access token' },
        { status: 500 }
      )
    }

    console.log(`Fetching versions for agent: ${agentId}`)

    // Test the /configs endpoint (versions)
    const configsResponse = await fetch(
      `https://developer.induslabs.io/api/agents/${agentId}/configs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    let configsData: unknown = null
    try {
      configsData = await configsResponse.json()
    } catch {
      configsData = await configsResponse.text()
    }

    // Test the /agent endpoint (details)
    const detailsResponse = await fetch(
      `https://developer.induslabs.io/api/agents/${agentId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    let detailsData: unknown = null
    try {
      detailsData = await detailsResponse.json()
    } catch {
      detailsData = await detailsResponse.text()
    }

    return NextResponse.json({
      agent_id: agentId,
      access_token_obtained: !!accessToken,
      configs_endpoint: {
        url: `https://developer.induslabs.io/api/agents/${agentId}/configs`,
        status: configsResponse.status,
        statusText: configsResponse.statusText,
        headers: Object.fromEntries(configsResponse.headers.entries()),
        response: configsData,
        is_array: Array.isArray(configsData),
        type_of_response: typeof configsData,
        keys: typeof configsData === 'object' && configsData !== null ? Object.keys(configsData as Record<string, unknown>) : null,
      },
      details_endpoint: {
        url: `https://developer.induslabs.io/api/agents/${agentId}`,
        status: detailsResponse.status,
        statusText: detailsResponse.statusText,
        headers: Object.fromEntries(detailsResponse.headers.entries()),
        response: detailsData,
        is_array: Array.isArray(detailsData),
        type_of_response: typeof detailsData,
        keys: typeof detailsData === 'object' && detailsData !== null ? Object.keys(detailsData as Record<string, unknown>) : null,
      },
    })
  } catch (error) {
    console.error('Error debugging IndusLabs versions:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

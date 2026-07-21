import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { logAPICall } from '@/lib/apiLogger'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = createServerClient()
    const { id } = params

    const { data: config, error } = await client
      .from('ai_agent_configs')
      .select('*')
      .eq('agent_id', id)
      .order('synced_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()

    if (error || !config) {
      // Log failed API call
      await logAPICall({
        endpoint: `/api/ai-agents/${id}/config`,
        method: 'GET',
        agent_id: id,
        status_code: 404,
        response_body: { error: 'Agent config not found' },
        success: false,
        error_message: 'Config not found',
        duration_ms: 0,
      })

      return NextResponse.json(
        { error: 'Agent config not found' },
        { status: 404 }
      )
    }

    const response = {
      success: true,
      data: config,
    }

    // Log successful API call
    await logAPICall({
      endpoint: `/api/ai-agents/${id}/config`,
      method: 'GET',
      agent_id: id,
      status_code: 200,
      response_body: response,
      success: true,
      duration_ms: 0,
    })

    return NextResponse.json(response)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch config'
    console.error('Error fetching agent config:', error)

    // Log error API call
    const { id } = params
    await logAPICall({
      endpoint: `/api/ai-agents/${id}/config`,
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

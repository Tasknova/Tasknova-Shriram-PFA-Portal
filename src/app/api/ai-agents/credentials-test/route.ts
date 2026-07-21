import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // 1. Check credentials configuration
    const email = process.env.INDUSLABS_EMAIL
    const password = process.env.INDUSLABS_PASSWORD

    const credentialsConfigured = {
      email_configured: !!email,
      password_configured: !!password,
      email: email ? email.substring(0, 5) + '...' : 'NOT SET',
    }

    // 2. Try to get fresh token
    const tokenResponse: Record<string, unknown> = { error: 'Not attempted' }
    let token: string | null = null

    if (email && password) {
      try {
        const response = await fetch('https://developer.induslabs.io/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
          }),
        })

        tokenResponse.status = response.status
        tokenResponse.statusText = response.statusText

        if (response.ok) {
          const data = (await response.json()) as Record<string, unknown>
          token = (data.access_token ||
            data.token ||
            (data.data as Record<string, unknown>)?.access_token ||
            (data.data as Record<string, unknown>)?.token) as string | null

          tokenResponse.token_obtained = !!token
          tokenResponse.token_first_10_chars = token ? token.substring(0, 10) + '...' : 'NONE'
        } else {
          const errorText = await response.text()
          tokenResponse.error_response = errorText.substring(0, 200)
        }
      } catch (error) {
        tokenResponse.error = String(error)
      }
    }

    // 3. If token obtained, test it with one agent
    const singleAgentTest: Record<string, unknown> = { skipped: 'No token' }

    if (token) {
      try {
        const response = await fetch('https://developer.induslabs.io/api/agents/AGT_3FD52A75/configs', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        singleAgentTest.status = response.status
        singleAgentTest.statusText = response.statusText

        if (response.ok) {
          const data = (await response.json()) as unknown[]
          const versions = Array.isArray(data) ? data : []
          singleAgentTest.success = true
          singleAgentTest.versions_returned = versions.length
          singleAgentTest.sample_versions = (versions as Array<Record<string, unknown>>).slice(0, 3).map((v) => ({
            version: v.version,
            status: v.status,
            is_current: v.is_current,
            system_prompt_length: (v.system_prompt as string || '').length,
          }))
        } else {
          const errorText = await response.text()
          singleAgentTest.error_response = errorText.substring(0, 200)
        }
      } catch (error) {
        singleAgentTest.error = String(error)
      }
    }

    // 4. Get all agents from local DB
    const { data: agents, error: dbError } = await client
      .from('ai_agents')
      .select('agent_id, name')

    const agentsSummary = {
      total_agents_in_db: agents?.length || 0,
      db_error: dbError ? dbError.message : null,
      agent_list: agents?.map((a: Record<string, unknown>) => ({
        agent_id: a.agent_id,
        name: a.name,
      })),
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      credentials: credentialsConfigured,
      login_test: tokenResponse,
      single_agent_test: singleAgentTest,
      local_database: agentsSummary,
      next_steps:
        singleAgentTest.success === false
          ? 'Token test failed - Check credentials and IndusLabs account access'
          : (singleAgentTest.versions_returned as number) > 0
            ? 'Token works! Ready to fetch all agent versions'
            : 'Token obtained but no versions returned - Agent may not have configs',
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

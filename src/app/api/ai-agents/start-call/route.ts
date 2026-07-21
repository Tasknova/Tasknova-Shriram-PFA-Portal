import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getActivePromptVersion, getIndusLabsApiKey, getCallbackUrl, logAuditEvent } from '@/lib/aiAgentsUtils'

export async function POST(req: NextRequest) {
  try {
    const { agent_id, customer_number, agent_number, did } = await req.json()

    // Validate required fields
    if (!agent_id || !customer_number || !agent_number || !did) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id, customer_number, agent_number, did' },
        { status: 400 }
      )
    }

    const client = createServerClient()

    // Get active prompt version
    const promptVersion = await getActivePromptVersion(agent_id)
    
    // Get IndusLabs API key
    const apiKey = await getIndusLabsApiKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'IndusLabs API key not configured' },
        { status: 500 }
      )
    }

    // Get callback URL
    const callbackUrl = await getCallbackUrl()

    // Call IndusLabs API to start call
    const induslabsResponse = await fetch('https://developer.induslabs.io/api/calls/click2call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        customer_number,
        agent_number,
        did,
        callback_url: callbackUrl,
        transcript: true,
      }),
    })

    if (!induslabsResponse.ok) {
      const errorData = await induslabsResponse.json()
      console.error('IndusLabs API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to start call with IndusLabs' },
        { status: 500 }
      )
    }

    const induslabsData = await induslabsResponse.json()
    const callId = induslabsData.call_id || `call_${Date.now()}`

    // Store call in database
    const { error } = await client
      .from('ai_calls')
      .insert({
        call_id: callId,
        agent_id,
        prompt_version_id: promptVersion?.id || null,
        status: 'in_progress',
        call_type: 'unknown',
        customer_number,
        agent_number,
        did,
        started_at: new Date().toISOString(),
      })
      .select()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to store call in database' },
        { status: 500 }
      )
    }

    // Log audit event
    await logAuditEvent('call.started', {
      call_id: callId,
      agent_id,
      customer_number,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      call_id: callId,
      message: 'Call initiated successfully',
    })
  } catch (error) {
    console.error('Error starting call:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

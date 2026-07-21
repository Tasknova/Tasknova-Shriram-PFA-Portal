import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  getIndusLabsAccessToken,
  isShriramPFAAgent,
  logAuditEvent,
  parseIndusLabsCallError,
  resolveAiCallingCallbackUrl,
  SHRIRAM_PFA_DEFAULT_DID,
} from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline } from '@/lib/aiCallingEvaluation'

interface InitiateCallRequest {
  customer_number: string
  agent_id: string
  did?: string
  transcript?: boolean
  transcript_language?: string
  agent_config?: {
    customer_name?: string
    jewellery_shop_name?: string
    pending_amount?: string
    last_call_date?: string
    [key: string]: string | undefined
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as InitiateCallRequest
    const { customer_number, agent_id, did: didFromBody, transcript = true, transcript_language = 'en', agent_config } = body

    // Validate required fields
    if (!customer_number || !agent_id) {
      return NextResponse.json(
        { error: 'customer_number and agent_id are required' },
        { status: 400 }
      )
    }

    // Normalize phone number: add 91 prefix if not already present
    let normalizedCustomerNumber = customer_number.trim()
    if (!normalizedCustomerNumber.startsWith('91')) {
      normalizedCustomerNumber = '91' + normalizedCustomerNumber
    }

    const client = createServerClient()

    // Get agent details from database
    const { data: agent, error: agentError } = await client
      .from('ai_agents')
      .select('*')
      .eq('agent_id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Use agent_id as agent_number for the API call
    const agent_number = agent_id
    const isShriramPFA = isShriramPFAAgent(agent.name)

    if (isShriramPFA && !agent_config?.customer_name?.trim()) {
      return NextResponse.json(
        { error: 'Customer name is required for Shriram PFA agent calls.' },
        { status: 400 }
      )
    }

    // Resolve DID: body → last successful call → last any call → Shriram PFA default
    let did = didFromBody?.trim() || ''
    if (!did) {
      const { data: lastSuccessCall } = await client
        .from('ai_calls')
        .select('did')
        .eq('agent_id', agent_id)
        .eq('status', 'completed')
        .not('did', 'is', null)
        .neq('did', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      did = lastSuccessCall?.did || ''
    }
    if (!did) {
      const { data: lastCall } = await client
        .from('ai_calls')
        .select('did')
        .eq('agent_id', agent_id)
        .not('did', 'is', null)
        .neq('did', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      did = lastCall?.did || ''
    }

    if (!did && isShriramPFA) {
      did = SHRIRAM_PFA_DEFAULT_DID
    }

    if (!did) {
      return NextResponse.json(
        { error: 'Organization DID is required. No previous DID found for this agent.' },
        { status: 400 }
      )
    }

    const callback_url = await resolveAiCallingCallbackUrl()

    // Force refresh the token on every call initiation to avoid stale token issues
    const accessToken = await getIndusLabsAccessToken(true)
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to authenticate with IndusLabs. Check INDUSLABS_EMAIL and INDUSLABS_PASSWORD in .env.local'},
        { status: 500 }
      )
    }

    console.log('Initiating call with:', {
      original_number: customer_number,
      normalized_number: normalizedCustomerNumber,
      agent_number,
      did,
      callback_url,
    })

    // Call IndusLabs Click2Call API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clickToCallPayload: any = {
      customer_number: normalizedCustomerNumber,
      agent_number,
      did,
      callback_url,
      transcript,
      transcript_language,
    }

    // Add agent_config if provided
    if (agent_config) {
      clickToCallPayload.agent_config = agent_config
    }
    
    console.log('Sending to IndusLabs:', JSON.stringify(clickToCallPayload, null, 2))
    
    let response: Response
    try {
      response = await fetch('https://developer.induslabs.io/api/calls/click2call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(clickToCallPayload),
      })
    } catch (fetchError) {
      console.error('Fetch error:', fetchError)
      return NextResponse.json(
        { error: `Network error: ${fetchError instanceof Error ? fetchError.message : 'Unknown error'}` },
        { status: 500 }
      )
    }

    console.log('IndusLabs response status:', response.status)
    
    if (!response.ok) {
      const errorBody = await response.text()
      console.error('IndusLabs Click2Call failed:', response.status, errorBody)
      const friendlyError = parseIndusLabsCallError(response.status, errorBody)
      return NextResponse.json(
        { error: friendlyError },
        { status: response.status }
      )
    }

    const responseBody = await response.text()
    console.log('IndusLabs response body:', responseBody)
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let callData: any
    try {
      callData = JSON.parse(responseBody) as {
        data?: { call_id?: string; status?: string }
      }
    } catch (parseError) {
      console.error('Failed to parse IndusLabs response:', parseError)
      return NextResponse.json(
        { error: 'Invalid response from IndusLabs API' },
        { status: 500 }
      )
    }

    const call_id = callData.data?.call_id
    const callStatus = callData.data?.status
    const callWarning = callData.data?.warning as string | null | undefined
    const topLevelError = callData.error as string | null | undefined
    const topLevelMessage = callData.message as string | null | undefined

    if (!call_id) {
      return NextResponse.json(
        { error: 'No call_id returned from IndusLabs' },
        { status: 500 }
      )
    }

    const normalizedCallStatus = callStatus === 'success'
      ? 'in_progress'
      : callStatus === 'failed'
        ? 'failed'
        : 'pending'

    const failureReason =
      callWarning ||
      topLevelError ||
      (normalizedCallStatus === 'failed'
        ? 'IndusLabs could not connect the call. Your phone line may have reached its concurrent call channel limit — wait a few minutes and retry, or contact IndusLabs support.'
        : null)

    // Store call in database immediately so the Calls page can show it right away
    const callRecord = {
      call_id,
      agent_id,
      customer_number: normalizedCustomerNumber,
      agent_number,
      did,
      status: normalizedCallStatus,
      call_type: normalizedCallStatus === 'failed' ? 'failed' : 'unknown',
      transcript_status: transcript ? 'pending' : 'pending',
      started_at: new Date().toISOString(),
    }

    let insertError = (
      await client.from('ai_calls').insert({
        ...callRecord,
        agent_config: agent_config || null,
      })
    ).error

    // Retry without agent_config if the column hasn't been migrated yet
    if (insertError?.message?.includes('agent_config')) {
      insertError = (await client.from('ai_calls').insert(callRecord)).error
    }

    if (insertError) {
      console.error('Failed to store call:', insertError)
      await logAuditEvent('call.initiate.db_error', { call_id, error: insertError })
      return NextResponse.json(
        { error: `Failed to store call record: ${insertError.message}` },
        { status: 500 }
      )
    }

    await logAuditEvent('call.initiated', {
      call_id,
      agent_id,
      customer_number,
    })

    // Return immediately with call_id and status
    const jsonResponse = NextResponse.json({
      success: normalizedCallStatus !== 'failed',
      call_id,
      call_status: normalizedCallStatus,
      failure_reason: failureReason,
      message: normalizedCallStatus === 'in_progress'
        ? 'Call initiated successfully'
        : normalizedCallStatus === 'failed'
          ? failureReason || 'Call initiation failed'
          : topLevelMessage || `Call initiation status: ${normalizedCallStatus}`,
    })

    // Start transcript polling in background (fire and forget)
    if (transcript && normalizedCallStatus === 'in_progress') {
      pollTranscriptInBackground(call_id, accessToken, client).catch((error) => {
        console.error('Background transcript polling error:', error)
      })
    }

    return jsonResponse
  } catch (error) {
    console.error('Error initiating call:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate call' },
      { status: 500 }
    )
  }
}

// Background function for transcript polling (doesn't block the response)
async function pollTranscriptInBackground(
  call_id: string,
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
) {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const maxAttempts = 60

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const transcriptResponse = await fetch(
        `https://developer.induslabs.io/api/calls/${call_id}/transcript`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      )

      if (!transcriptResponse.ok) {
        const errorBody = await transcriptResponse.text()
        console.error('IndusLabs transcript fetch failed:', transcriptResponse.status, errorBody)
        await logAuditEvent('call.transcript.fetch_error', {
          call_id,
          status: transcriptResponse.status,
          error: errorBody,
          attempt,
        })
      } else {
        const transcriptPayload = (await transcriptResponse.json()) as {
          data?: {
            transcript_status?: string
            duration?: string | number | null
            recording?: string | null
            transcript?: {
              summary?: string | null
              call_outcome?: string | null
              transcript_id?: string | null
              history?: unknown[]
            } | null
            error?: string | null
          }
        }

        const transcriptStatus = transcriptPayload.data?.transcript_status
        const durationRaw = transcriptPayload.data?.duration
        const duration = durationRaw ? Number(durationRaw) : null
        const recordingUrl = transcriptPayload.data?.recording || null

        if (transcriptStatus === 'ready') {
          const summary = transcriptPayload.data?.transcript?.summary || null
          const callOutcome = transcriptPayload.data?.transcript?.call_outcome || null
          const transcriptId = transcriptPayload.data?.transcript?.transcript_id || null
          const history = transcriptPayload.data?.transcript?.history || []

          await client
            .from('ai_transcripts')
            .upsert({
              call_id,
              transcript_id: transcriptId,
              summary,
              call_outcome: callOutcome,
              history,
            })

          // Use transcript.createdAt as call end time since IndusLabs doesn't return duration
          const transcriptCreatedAt = (transcriptPayload.data?.transcript as { createdAt?: string } | null)?.createdAt || null

          await client
            .from('ai_calls')
            .update({
              transcript_status: 'completed',
              duration: duration ?? 0,
              recording_url: recordingUrl,
              outcome: callOutcome,
              status: 'completed',
              ended_at: transcriptCreatedAt || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('call_id', call_id)

          if (recordingUrl) {
            await triggerEvaluationPipeline({
              callId: call_id,
              recordingUrl,
            })
          }

          await logAuditEvent('call.transcript.ready', {
            call_id,
            transcript_id: transcriptId,
            duration,
          })
          return
        }

        if (transcriptStatus === 'failed') {
          await client
            .from('ai_calls')
            .update({
              transcript_status: 'failed',
              duration: duration ?? 0,
              recording_url: recordingUrl,
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('call_id', call_id)

          await logAuditEvent('call.transcript.failed', {
            call_id,
            error: transcriptPayload.data?.error || null,
          })
          return
        }
      }
    } catch (error) {
      console.error('Background polling error on attempt', attempt, ':', error)
    }

    await sleep(2000)
  }

  console.log('Transcript polling completed for call:', call_id, 'max attempts reached')
  await logAuditEvent('call.transcript.timeout', {
    call_id,
    max_attempts: maxAttempts,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken, logAuditEvent } from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline } from '@/lib/aiCallingEvaluation'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { call_id: string } }
) {
  try {
    const { call_id } = params

    if (!call_id) {
      return NextResponse.json(
        { error: 'call_id is required' },
        { status: 400 }
      )
    }

    const client = createServerClient()

    // Fetch call details
    const { data: call, error: callError } = await client
      .from('ai_calls')
      .select('*')
      .eq('call_id', call_id)
      .single()

    if (callError || !call) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      )
    }

    // Get access token
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to authenticate with IndusLabs' },
        { status: 500 }
      )
    }

    // Check transcript status from IndusLabs
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
      return NextResponse.json(
        { error: 'Failed to fetch transcript status from IndusLabs' },
        { status: transcriptResponse.status }
      )
    }

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
      const transcriptCreatedAt = (transcriptPayload.data?.transcript as unknown as { createdAt?: string } | null)?.createdAt || null

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
    }

    // Fetch updated call details
    const { data: updatedCall } = await client
      .from('ai_calls')
      .select(`
        *,
        ai_agents(agent_id, name),
        ai_transcripts(*),
        ai_evaluations(*)
      `)
      .eq('call_id', call_id)
      .single()

    return NextResponse.json({
      call: updatedCall,
      transcript_status: transcriptStatus,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Error checking transcript status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

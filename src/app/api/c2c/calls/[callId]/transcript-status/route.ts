import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline } from '@/lib/c2cEvaluation'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { callId: string } }
) {
  try {
    const { callId } = params
    const client = createServerClient()

    // Fetch call from DB
    const { data: call, error: callError } = await client
      .from('c2c_calls')
      .select('*')
      .eq('call_id', callId)
      .single()

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to authenticate with IndusLabs' }, { status: 500 })
    }

    // Fetch transcript status from IndusLabs
    const transcriptResponse = await fetch(
      `https://developer.induslabs.io/api/calls/${callId}/transcript`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!transcriptResponse.ok) {
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
          createdAt?: string
        } | null
        error?: string | null
      }
    }

    const transcriptStatus = transcriptPayload.data?.transcript_status
    const durationRaw = transcriptPayload.data?.duration
    const duration = durationRaw ? Number(durationRaw) : null
    const recordingUrl = transcriptPayload.data?.recording || null
    const transcriptCreatedAt = transcriptPayload.data?.transcript?.createdAt || null

    if (transcriptStatus === 'ready') {
      const summary = transcriptPayload.data?.transcript?.summary || null
      const callOutcome = transcriptPayload.data?.transcript?.call_outcome || null
      const transcriptId = transcriptPayload.data?.transcript?.transcript_id || null
      const history = transcriptPayload.data?.transcript?.history || []

      // Save transcript
      await client.from('c2c_transcripts').upsert({
        call_id: callId,
        transcript_id: transcriptId,
        summary,
        call_outcome: callOutcome,
        history,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'call_id' })

      // Update call record
      await client
        .from('c2c_calls')
        .update({
          transcript_status: 'completed',
          duration: duration ?? 0,
          recording_url: recordingUrl,
          outcome: callOutcome,
          status: 'completed',
          ended_at: transcriptCreatedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('call_id', callId)

      if (recordingUrl) {
        await triggerEvaluationPipeline({
          callId,
          recordingUrl,
        })
      }
    } else if (transcriptStatus === 'failed') {
      await client
        .from('c2c_calls')
        .update({
          transcript_status: 'failed',
          duration: duration ?? 0,
          recording_url: recordingUrl,
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('call_id', callId)
    }

    // Return updated call
    const { data: updatedCall } = await client
      .from('c2c_calls')
      .select('*, c2c_transcripts(*), c2c_evaluations(*)')
      .eq('call_id', callId)
      .single()

    return NextResponse.json(
      { call: updatedCall, transcript_status: transcriptStatus },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('[C2C] Error checking transcript status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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

    // Verify call exists and get recording URL
    const { data: call, error: callError } = await client
      .from('c2c_calls')
      .select('recording_url, transcript_status')
      .eq('call_id', callId)
      .single()

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    // Try to get a fresh recording URL from IndusLabs if we don't have one
    let recordingUrl = call.recording_url || ''
    if (!recordingUrl) {
      const accessToken = await getIndusLabsAccessToken()
      if (accessToken) {
        const transcriptRes = await fetch(
          `https://developer.induslabs.io/api/calls/${callId}/transcript`,
          { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
        )
        if (transcriptRes.ok) {
          const transcriptPayload = (await transcriptRes.json()) as {
            data?: { recording?: string | null; transcript_status?: string }
          }
          recordingUrl = transcriptPayload.data?.recording || ''
          if (recordingUrl) {
            await client
              .from('c2c_calls')
              .update({ recording_url: recordingUrl, updated_at: new Date().toISOString() })
              .eq('call_id', callId)
          }
        }
      }
    }

    if (!recordingUrl) {
      return NextResponse.json(
        { error: 'No recording URL available for this call. The recording may not be ready yet.' },
        { status: 422 }
      )
    }

    // Trigger pipeline with force=true to bypass 'completed' guard
    triggerEvaluationPipeline({ callId, recordingUrl }, true).catch((error) =>
      console.error('[C2C] Re-evaluation error:', error)
    )

    return NextResponse.json({ success: true, message: 'Re-evaluation started' })
  } catch (error) {
    console.error('[C2C Re-evaluate] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

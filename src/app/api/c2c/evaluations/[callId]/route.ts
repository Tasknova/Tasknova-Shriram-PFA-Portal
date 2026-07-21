import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { callId: string } }
) {
  try {
    const { callId } = params
    const client = createServerClient()

    const { data, error } = await client
      .from('c2c_evaluations')
      .select('*, c2c_calls(call_id, from_number, to_number, status, duration, recording_url, created_at, outcome, transcript_status, c2c_transcripts(summary, call_outcome, history, raw_text))')
      .eq('call_id', callId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    // Fix missing history from raw_text for old records
    const tx = (data as Record<string, unknown>).c2c_calls as Record<string, unknown> | null
    let transcriptRecord: Record<string, unknown> | null = null
    const rawTranscripts = tx?.c2c_transcripts
    if (Array.isArray(rawTranscripts) && rawTranscripts.length > 0) {
      transcriptRecord = rawTranscripts[0] as Record<string, unknown>
    } else if (rawTranscripts && typeof rawTranscripts === 'object') {
      transcriptRecord = rawTranscripts as Record<string, unknown>
    }
    if (transcriptRecord) {
      const history = transcriptRecord.history as unknown[] | null
      const rawText = typeof transcriptRecord.raw_text === 'string' ? transcriptRecord.raw_text.trim() : ''
      const isJunk = rawText === '[]' || rawText === '{}' || rawText === ''
      if (history && Array.isArray(history) && history.length > 0) {
        const first = history[0] as Record<string, unknown> | null
        if (first && first.content === '[]') {
          transcriptRecord.history = []
          await client.from('c2c_transcripts').update({ history: [], updated_at: new Date().toISOString() }).eq('call_id', callId)
        }
      }
      if ((!history || history.length === 0) && !isJunk && rawText) {
        transcriptRecord.history = [{ role: 'Conversation', content: rawText }]
        await client.from('c2c_transcripts').update({ history: transcriptRecord.history, updated_at: new Date().toISOString() }).eq('call_id', callId)
      }
    }

    // Auto-heal evaluations stuck in "processing" that actually have completed data.
    // This can happen when the serverless function terminates before writing the final status.
    const evalData = data as Record<string, unknown>
    if (
      evalData.status === 'processing' &&
      (evalData.call_summary || evalData.overall_score || evalData.score)
    ) {
      await client
        .from('c2c_evaluations')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('call_id', callId)
      evalData.status = 'completed'
    }

    return NextResponse.json({ evaluation: data }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[C2C] Error fetching evaluation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

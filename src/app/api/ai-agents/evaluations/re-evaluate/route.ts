import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { triggerEvaluationPipeline } from '@/lib/aiCallingEvaluation'
import { logAuditEvent } from '@/lib/aiAgentsUtils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { callId, all } = body as { callId?: string; all?: boolean }

    const client = createServerClient()

    if (callId) {
      const { data: call, error } = await client
        .from('ai_calls')
        .select('call_id, recording_url, transcript_status')
        .eq('call_id', callId)
        .single()

      if (error || !call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }

      if (!call.recording_url || call.recording_url === 'pending') {
        return NextResponse.json({ error: 'Call has no recording URL' }, { status: 400 })
      }

      if (call.transcript_status !== 'completed') {
        return NextResponse.json({ error: 'Transcript is not ready yet' }, { status: 400 })
      }

      await triggerEvaluationPipeline({
        callId: call.call_id,
        recordingUrl: call.recording_url,
      })

      await logAuditEvent('evaluation.retriggered', { call_id: callId })

      return NextResponse.json({ success: true, call_id: callId, message: 'Evaluation triggered' })
    }

    if (all) {
      const { data: calls, error } = await client
        .from('ai_calls')
        .select('call_id, recording_url')
        .eq('transcript_status', 'completed')
        .not('recording_url', 'is', null)
        .neq('recording_url', 'pending')

      if (error) {
        return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
      }

      const results = []
      for (const call of calls || []) {
        if (!call.recording_url) continue

        const { data: existing } = await client
          .from('ai_evaluations')
          .select('status')
          .eq('call_id', call.call_id)
          .maybeSingle()

      if (existing?.status === 'completed') continue

        await triggerEvaluationPipeline({
          callId: call.call_id,
          recordingUrl: call.recording_url,
        })

        results.push(call.call_id)
      }

      await logAuditEvent('evaluation.retriggered_bulk', { call_ids: results, count: results.length })

      return NextResponse.json({
        success: true,
        triggered: results.length,
        skipped: (calls?.length || 0) - results.length,
        call_ids: results,
      })
    }

    return NextResponse.json({ error: 'Provide callId or all: true' }, { status: 400 })
  } catch (error) {
    console.error('Re-evaluate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

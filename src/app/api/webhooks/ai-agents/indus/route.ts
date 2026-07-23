import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  classifyCall,
  logAuditEvent,
} from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline as triggerAiEvaluationPipeline } from '@/lib/aiCallingEvaluation'
import { triggerEvaluationPipeline as triggerC2CEvaluationPipeline } from '@/lib/c2cEvaluation'

interface WebhookBody {
  event: string
  data: Record<string, unknown>
}

interface CallCompletedData {
  call_id: string
  duration?: number
  recording_url?: string
  end_time?: string
}

interface CallFailedData {
  call_id: string
  error?: string
}

interface TranscriptReadyData {
  call_id: string
  transcript?: string
  summary?: string
  outcome?: string
}

interface TranscriptFailedData {
  call_id: string
  error?: string
}

function parseTranscriptPayload(transcript: unknown): unknown[] {
  if (Array.isArray(transcript)) {
    return transcript
  }

  if (typeof transcript === 'string') {
    try {
      const parsed = JSON.parse(transcript) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

function parsePowerShellUtterance(str: unknown): Record<string, string> | null {
  if (typeof str !== 'string') return null
  const match = str.match(/^@\{(.+)\}$/)
  if (!match) return null
  const pairs = match[1].split('; ')
  const result: Record<string, string> = {}
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=')
    if (eqIdx > 0) {
      const key = pair.substring(0, eqIdx).trim()
      const value = pair.substring(eqIdx + 1).trim()
      result[key] = value
    }
  }
  return result
}

export async function POST(req: NextRequest) {
  try {
    const client = createServerClient()
    const body = (await req.json()) as WebhookBody

    const { event, data } = body

    // Log webhook received
    console.log(`Received webhook event: ${event}`, data)
    await logAuditEvent(`webhook.${event}`, data)

    switch (event) {
      case 'call.completed': {
        return await handleCallCompleted(client, data as unknown as CallCompletedData)
      }

      case 'call.failed': {
        return await handleCallFailed(client, data as unknown as CallFailedData)
      }

      case 'transcript.ready': {
        return await handleTranscriptReady(client, data as unknown as TranscriptReadyData)
      }

      case 'transcript.failed': {
        return await handleTranscriptFailed(client, data as unknown as TranscriptFailedData)
      }

      default:
        console.log(`Unknown event type: ${event}`)
        return NextResponse.json({ received: true })
    }
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleCallCompleted(
  client: ReturnType<typeof createServerClient>,
  data: CallCompletedData
) {
  const { call_id, duration, recording_url, end_time } = data

  // --- Handle AI calls ---
  const { data: existingAiCall } = await client
    .from('ai_calls')
    .select('call_id')
    .eq('call_id', call_id)
    .single()

  if (existingAiCall) {
    await client
      .from('ai_calls')
      .update({
        status: 'completed',
        duration: duration || 0,
        recording_url,
        ended_at: end_time || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', call_id)

    if (recording_url) {
      await triggerAiEvaluationPipeline({ callId: call_id, recordingUrl: recording_url })
    }
  }

  // --- Handle C2C calls ---
  const { data: existingC2CCall } = await client
    .from('c2c_calls')
    .select('call_id, recording_url')
    .eq('call_id', call_id)
    .single()

  if (existingC2CCall) {
    const c2cRecordingUrl = recording_url || existingC2CCall.recording_url || null
    await client
      .from('c2c_calls')
      .update({
        status: 'completed',
        duration: duration || 0,
        recording_url: c2cRecordingUrl,
        ended_at: end_time || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', call_id)

    // Trigger C2C evaluation if recording is available
    if (c2cRecordingUrl && c2cRecordingUrl !== 'pending' && c2cRecordingUrl !== 'failed') {
      try {
        await triggerC2CEvaluationPipeline({ callId: call_id, recordingUrl: c2cRecordingUrl })
      } catch (err) {
        console.error('[C2C Webhook] Evaluation trigger failed:', err)
      }
    }
  }

  await logAuditEvent('call.completed.processed', { call_id, duration })
  return NextResponse.json({ received: true, event: 'call.completed' })
}

async function handleCallFailed(
  client: ReturnType<typeof createServerClient>,
  data: CallFailedData
) {
  const { call_id } = data

  // Update AI call if exists
  const { data: existingAiCall } = await client
    .from('ai_calls')
    .select('call_id')
    .eq('call_id', call_id)
    .single()

  if (existingAiCall) {
    await client
      .from('ai_calls')
      .update({ status: 'failed', call_type: 'failed', updated_at: new Date().toISOString() })
      .eq('call_id', call_id)
  }

  // Update C2C call if exists
  const { data: existingC2CCall } = await client
    .from('c2c_calls')
    .select('call_id')
    .eq('call_id', call_id)
    .single()

  if (existingC2CCall) {
    await client
      .from('c2c_calls')
      .update({ status: 'failed', transcript_status: 'failed', updated_at: new Date().toISOString() })
      .eq('call_id', call_id)
  }

  await logAuditEvent('call.failed.processed', { call_id })
  return NextResponse.json({ received: true, event: 'call.failed' })
}

async function handleTranscriptReady(
  client: ReturnType<typeof createServerClient>,
  data: TranscriptReadyData
) {
  const { call_id, transcript, summary, outcome } = data

  // --- Handle AI calls ---
  const { data: aiCallRecord } = await client
    .from('ai_calls')
    .select('duration, agent_id, recording_url')
    .eq('call_id', call_id)
    .single()

  if (aiCallRecord) {
    const { duration, recording_url } = aiCallRecord
    const callType = classifyCall(duration || 0, !!transcript)

    await client
      .from('ai_calls')
      .update({ call_type: callType, transcript_status: 'completed', outcome, updated_at: new Date().toISOString() })
      .eq('call_id', call_id)

    const transcriptData = parseTranscriptPayload(transcript)
    const aiRawText = typeof transcript === 'string' && transcript.trim() ? transcript.trim() : ''
    await client.from('ai_transcripts').upsert(
      {
        call_id,
        summary,
        call_outcome: outcome,
        history: transcriptData,
        raw_text: aiRawText,
      },
      { onConflict: 'call_id' }
    )

    if (recording_url) {
      await triggerAiEvaluationPipeline({ callId: call_id, recordingUrl: recording_url })
    }
  }

  // --- Handle C2C calls ---
  const { data: c2cCallRecord } = await client
    .from('c2c_calls')
    .select('duration, recording_url')
    .eq('call_id', call_id)
    .single()

  if (c2cCallRecord) {
    let transcriptHistory: unknown[] = []
    let rawText = ''

    const tx = transcript as Record<string, unknown> | null | undefined

    if (tx && typeof tx === 'object' && Array.isArray(tx.utterances)) {
      const utterances = tx.utterances as Array<unknown>
      const fullText = typeof tx.transcript === 'string' ? tx.transcript : ''
      if (utterances.length > 0) {
        const parsed = utterances
          .map((u) => {
            if (typeof u === 'string' && u.startsWith('@{')) {
              return parsePowerShellUtterance(u)
            }
            if (typeof u === 'object' && u) {
              return u as Record<string, unknown>
            }
            return null
          })
          .filter(Boolean) as Array<Record<string, string>>
        if (parsed.length > 0) {
          const uniqueSpeakers = [...new Set(parsed.map((u) => u.speaker))]
          transcriptHistory = parsed.map((u, i) => {
            let label = ''
            if (uniqueSpeakers.length < 2) {
              label = i % 2 === 0 ? 'Speaker 0' : 'Speaker 1'
            } else {
              label = u.speaker === 'SPEAKER_0' ? 'Speaker 0' : 'Speaker 1'
            }
            return { role: label, content: u.transcript ?? '' }
          })
          rawText = fullText || parsed.map((u) => u.transcript).filter(Boolean).join(' ')
        } else if (fullText) {
          rawText = fullText
        }
      } else if (fullText) {
        rawText = fullText
      }
    } else {
      const parsed = parseTranscriptPayload(transcript)
      transcriptHistory = parsed
      if (typeof transcript === 'string' && transcript.trim()) {
        rawText = transcript.trim()
      }
    }

    const hasRealContent = rawText && rawText !== '[]' && rawText !== '{}'
    if (transcriptHistory.length === 0 && hasRealContent) {
      transcriptHistory = [{ role: 'Conversation', content: rawText }]
    }

    await client
      .from('c2c_calls')
      .update({ transcript_status: 'completed', outcome, status: 'completed', updated_at: new Date().toISOString() })
      .eq('call_id', call_id)

    await client.from('c2c_transcripts').upsert(
      {
        call_id,
        summary,
        call_outcome: outcome,
        history: transcriptHistory,
        raw_text: rawText,
      },
      { onConflict: 'call_id' }
    )

    const c2cRecordingUrl = c2cCallRecord.recording_url
    if (c2cRecordingUrl && c2cRecordingUrl !== 'pending' && c2cRecordingUrl !== 'failed') {
      void triggerC2CEvaluationPipeline({ callId: call_id, recordingUrl: c2cRecordingUrl }).catch(
        (err) => console.error('[C2C Webhook] Transcript-triggered evaluation failed:', err)
      )
    } else {
      // No recording URL yet, but we have the transcript — still trigger evaluation
      // The pipeline will use the transcript history directly (no Whisper needed)
      void triggerC2CEvaluationPipeline({ callId: call_id, recordingUrl: '' }).catch(
        (err) => console.error('[C2C Webhook] Transcript-only evaluation failed:', err)
      )
    }
  }

  return NextResponse.json({ received: true, event: 'transcript.ready' })
}

async function handleTranscriptFailed(
  client: ReturnType<typeof createServerClient>,
  data: TranscriptFailedData
) {
  const { call_id } = data

  // Update AI call if exists
  const { data: aiCallRecord } = await client
    .from('ai_calls')
    .select('call_id')
    .eq('call_id', call_id)
    .single()

  if (aiCallRecord) {
    await client
      .from('ai_calls')
      .update({ call_type: 'failed', transcript_status: 'failed', updated_at: new Date().toISOString() })
      .eq('call_id', call_id)
  }

  // Update C2C call if exists
  const { data: c2cCallRecord } = await client
    .from('c2c_calls')
    .select('call_id')
    .eq('call_id', call_id)
    .single()

  if (c2cCallRecord) {
    await client
      .from('c2c_calls')
      .update({ transcript_status: 'failed', status: 'failed', updated_at: new Date().toISOString() })
      .eq('call_id', call_id)
  }

  await logAuditEvent('transcript.failed.processed', { call_id })
  return NextResponse.json({ received: true, event: 'transcript.failed' })
}

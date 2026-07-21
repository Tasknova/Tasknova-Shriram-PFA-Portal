import { createServerClient } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/aiAgentsUtils'

type JsonObject = Record<string, unknown>

interface TranscriptTurn {
  role?: string
  speaker?: string
  content?: string
  text?: string
  message?: string
}

interface WhisperTranscriptResult {
  text: string
  language: string | null
  duration: number | null
}

interface PerformanceDimension {
  score: number
  feedback: string
}

interface EvaluationScores {
  overall_call_score: number
  agent_performance_score: number
  customer_engagement_score: number
  communication_score: number
  qualification_score: number
}

interface EvaluationAnalysis {
  call_summary: string
  customer_intent: string
  lead_status: 'Interested' | 'Not Interested' | 'Follow-up Required' | 'Callback Requested'
  meeting_datetime: string | null
  meeting_location: string | null
  main_discussion_points: string[]
  call_outcome: string
  agent_performance: Record<string, PerformanceDimension>
  what_went_well: string[]
  areas_for_improvement: string[]
  next_best_actions: string[]
  scores: EvaluationScores
  overall_feedback: string
  diarized_transcript?: string
}

interface EvaluationPipelineContext {
  callId: string
  recordingUrl: string
}

function getFirstRelationRecord(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return isRecord(value[0]) ? value[0] : null
  }

  return isRecord(value) ? value : null
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampScore(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalizePerformanceDimension(value: unknown): PerformanceDimension {
  if (!isRecord(value)) {
    return { score: 0, feedback: '' }
  }

  return {
    score: clampScore(value.score),
    feedback: asString(value.feedback),
  }
}

function parseJsonObject(raw: string): JsonObject {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isRecord(parsed)) {
      return parsed
    }
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${String(error)}`)
  }

  throw new Error('OpenAI response was not a JSON object')
}

function normalizeAnalysis(raw: JsonObject): EvaluationAnalysis {
  const scores = isRecord(raw.scores) ? raw.scores : {}
  const agentPerformance = isRecord(raw.agent_performance) ? raw.agent_performance : {}

  return {
    call_summary: asString(raw.call_summary),
    customer_intent: asString(raw.customer_intent),
    lead_status: (['Interested', 'Not Interested', 'Follow-up Required', 'Callback Requested'].includes(raw.lead_status as string)
      ? raw.lead_status as EvaluationAnalysis['lead_status']
      : 'Follow-up Required'),
    meeting_datetime: typeof raw.meeting_datetime === 'string' && raw.meeting_datetime.trim() ? raw.meeting_datetime.trim() : null,
    meeting_location: typeof raw.meeting_location === 'string' && raw.meeting_location.trim() ? raw.meeting_location.trim() : null,
    main_discussion_points: asStringArray(raw.main_discussion_points),
    call_outcome: asString(raw.call_outcome),
    agent_performance: {
      greeting_quality: normalizePerformanceDimension(agentPerformance.greeting_quality),
      professionalism: normalizePerformanceDimension(agentPerformance.professionalism),
      tone: normalizePerformanceDimension(agentPerformance.tone),
      clarity: normalizePerformanceDimension(agentPerformance.clarity),
      listening_ability: normalizePerformanceDimension(agentPerformance.listening_ability),
      question_quality: normalizePerformanceDimension(agentPerformance.question_quality),
      objection_handling: normalizePerformanceDimension(agentPerformance.objection_handling),
      accuracy: normalizePerformanceDimension(agentPerformance.accuracy),
      conversation_flow: normalizePerformanceDimension(agentPerformance.conversation_flow),
      confidence: normalizePerformanceDimension(agentPerformance.confidence),
      closing_quality: normalizePerformanceDimension(agentPerformance.closing_quality),
    },
    what_went_well: asStringArray(raw.what_went_well),
    areas_for_improvement: asStringArray(raw.areas_for_improvement),
    next_best_actions: asStringArray(raw.next_best_actions),
    scores: {
      overall_call_score: clampScore(scores.overall_call_score),
      agent_performance_score: clampScore(scores.agent_performance_score),
      customer_engagement_score: clampScore(scores.customer_engagement_score),
      communication_score: clampScore(scores.communication_score),
      qualification_score: clampScore(scores.qualification_score),
    },
    overall_feedback: asString(raw.overall_feedback),
    diarized_transcript: asString(raw.diarized_transcript),
  }
}

function getRecordingFileName(recordingUrl: string, contentType: string | null): string {
  try {
    const url = new URL(recordingUrl)
    const lastSegment = url.pathname.split('/').filter(Boolean).pop()
    if (lastSegment) {
      return lastSegment
    }
  } catch {
    // Fall back to content type below.
  }

  if (contentType?.includes('wav')) return 'recording.wav'
  if (contentType?.includes('mpeg')) return 'recording.mp3'
  if (contentType?.includes('mp4')) return 'recording.mp4'
  return 'recording.audio'
}

function formatTranscriptFromHistory(history: unknown): string {
  if (!Array.isArray(history)) {
    return ''
  }

  return history
    .map((entry) => {
      if (!isRecord(entry)) {
        return ''
      }

      const turn = entry as TranscriptTurn
      const speaker = turn.speaker || turn.role || 'Speaker'
      const content = turn.content || turn.text || turn.message || ''
      if (!content || typeof content !== 'string') {
        return ''
      }

      return `${speaker}: ${content.trim()}`
    })
    .filter(Boolean)
    .join('\n')
}

async function fetchFreshRecordingUrl(callId: string): Promise<string | null> {
  try {
    const { getIndusLabsAccessToken } = await import('@/lib/aiAgentsUtils')
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) return null

    const response = await fetch(
      `https://developer.induslabs.io/api/calls/${callId}/transcript`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) return null

    const payload = (await response.json()) as {
      data?: { recording?: string | null }
    }
    const recording = payload.data?.recording
    if (recording === 'pending' || recording === 'failed') return null
    return recording || null
  } catch {
    return null
  }
}

async function transcribeRecording(recordingUrl: string): Promise<WhisperTranscriptResult> {
  const openAiApiKey = process.env.OPENAI_API_KEY
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const recordingResponse = await fetch(recordingUrl)
  if (!recordingResponse.ok) {
    throw new Error(`Failed to download recording: ${recordingResponse.status}`)
  }

  const audioBuffer = await recordingResponse.arrayBuffer()
  const contentType = recordingResponse.headers.get('content-type')
  const formData = new FormData()
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'verbose_json')
  formData.append(
    'file',
    new Blob([audioBuffer], { type: contentType || 'application/octet-stream' }),
    getRecordingFileName(recordingUrl, contentType)
  )

  const transcriptResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: formData,
  })

  if (!transcriptResponse.ok) {
    const errorText = await transcriptResponse.text()
    throw new Error(`Whisper transcription failed: ${transcriptResponse.status} ${errorText}`)
  }

  const payload = (await transcriptResponse.json()) as {
    text?: string
    language?: string
    duration?: number
  }

  const text = payload.text?.trim()
  if (!text) {
    throw new Error('Whisper did not return transcript text')
  }

  return {
    text,
    language: payload.language || null,
    duration: typeof payload.duration === 'number' ? payload.duration : null,
  }
}

async function analyzeTranscript(args: {
  transcriptText: string
  rawTranscription: string
  existingOutcome?: string | null
  duration?: number | null
  customerNumber?: string | null
  agentName?: string | null
}): Promise<EvaluationAnalysis> {
  const openAiApiKey = process.env.OPENAI_API_KEY
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const prompt = [
    'You are evaluating an AI sales/support call.',
    'Return ONLY valid JSON.',
    'Score everything on a 0-100 scale.',
    'Be concise, evidence-based, and grounded in the transcript.',
    '',
    'Required JSON shape:',
    '{',
    '  "call_summary": string,',
    '  "customer_intent": string,',
    '  "lead_status": "Interested" | "Not Interested" | "Follow-up Required" | "Callback Requested",',
    '  "meeting_datetime": string | null, // If the user specifies a relative date like "today" or "tomorrow", output EXACTLY the relative phrase (e.g., "Tomorrow 12:00 PM"). Do NOT output arbitrary absolute dates or ISO strings if they are not explicitly mentioned.',
    '  "meeting_location": string | null, // Address or location mentioned for the meeting, otherwise null',
    '  "main_discussion_points": string[],',

    '  "call_outcome": string,',
    '  "agent_performance": {',
    '    "greeting_quality": {"score": number, "feedback": string},',
    '    "professionalism": {"score": number, "feedback": string},',
    '    "tone": {"score": number, "feedback": string},',
    '    "clarity": {"score": number, "feedback": string},',
    '    "listening_ability": {"score": number, "feedback": string},',
    '    "question_quality": {"score": number, "feedback": string},',
    '    "objection_handling": {"score": number, "feedback": string},',
    '    "accuracy": {"score": number, "feedback": string},',
    '    "conversation_flow": {"score": number, "feedback": string},',
    '    "confidence": {"score": number, "feedback": string},',
    '    "closing_quality": {"score": number, "feedback": string}',
    '  },',
    '  "what_went_well": string[],',
    '  "areas_for_improvement": string[],',
    '  "next_best_actions": string[],',
    '  "scores": {',
    '    "overall_call_score": number,',
    '    "agent_performance_score": number,',
    '    "customer_engagement_score": number,',
    '    "communication_score": number,',
    '    "qualification_score": number',
    '  },',
    '  "overall_feedback": string,',
    '  "diarized_transcript": string // IMPORTANT: Output a formatted string separating speakers with newlines. E.g. "Assistant: Hello\\nUser: Hi"',
    '}',
    '',
    `Agent name: ${args.agentName || 'Unknown'}`,
    `Customer number: ${args.customerNumber || 'Unknown'}`,
    `Call duration in seconds: ${args.duration ?? 'Unknown'}`,
    `Existing outcome if any: ${args.existingOutcome || 'Unknown'}`,
    `Current date and time: ${new Date().toLocaleString()}`,
    '',
    'Conversation transcript:',
    args.transcriptText,
    '',
    'Raw Whisper transcription:',
    args.rawTranscription,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You produce strict JSON evaluations for AI calling transcripts.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GPT analysis failed: ${response.status} ${errorText}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) {
    throw new Error('GPT analysis did not return any content')
  }

  return normalizeAnalysis(parseJsonObject(content))
}

async function upsertEvaluationRecord(
  callId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const client = createServerClient()
  const { error } = await client.from('ai_evaluations').upsert(
    {
      call_id: callId,
      updated_at: new Date().toISOString(),
      ...fields,
    },
    { onConflict: 'call_id' }
  )

  if (error) {
    throw new Error(`Failed to upsert evaluation for ${callId}: ${error.message}`)
  }
}

export async function triggerEvaluationPipeline(context: EvaluationPipelineContext): Promise<void> {
  const client = createServerClient()

  const { data: existing } = await client
    .from('ai_evaluations')
    .select('status')
    .eq('call_id', context.callId)
    .maybeSingle()

  if (existing?.status === 'completed') {
    return
  }

  await upsertEvaluationRecord(context.callId, {
    status: 'processing',
    error_message: null,
    transcript_source: 'whisper-1',
    processed_at: null,
  })

  void runEvaluationPipeline(context).catch((error) => {
    console.error('Evaluation pipeline failed:', error)
  })
}

async function runEvaluationPipeline(context: EvaluationPipelineContext): Promise<void> {
  const client = createServerClient()

  try {
    const { data: call, error: callError } = await client
      .from('ai_calls')
      .select(`
        call_id,
        agent_id,
        duration,
        outcome,
        customer_number,
        recording_url,
        ai_agents(name),
        ai_transcripts(summary, call_outcome, history, raw_text)
      `)
      .eq('call_id', context.callId)
      .single()

    if (callError || !call) {
      throw new Error(`Call not found for evaluation: ${context.callId}`)
    }

    const transcriptRecord = getFirstRelationRecord(call.ai_transcripts)
    const agentRecord = getFirstRelationRecord(call.ai_agents)

    const history = Array.isArray(transcriptRecord?.history)
      ? transcriptRecord.history
      : []

    const formattedHistoryTranscript = formatTranscriptFromHistory(history)

    // Always fetch a fresh recording URL from IndusLabs to avoid expired S3 presigned URLs (403)
    let recordingUrl = context.recordingUrl
    const freshUrl = await fetchFreshRecordingUrl(context.callId)
    if (freshUrl) {
      recordingUrl = freshUrl
      // Persist the refreshed URL in DB so it's available next time
      await client
        .from('ai_calls')
        .update({ recording_url: freshUrl, updated_at: new Date().toISOString() })
        .eq('call_id', context.callId)
    }

    const whisper = await transcribeRecording(recordingUrl)
    const rawTranscriptText = formattedHistoryTranscript || whisper.text

    const analysis = await analyzeTranscript({
      transcriptText: rawTranscriptText,
      rawTranscription: whisper.text,
      existingOutcome: call.outcome || asString(transcriptRecord?.call_outcome, '') || null,
      duration: typeof call.duration === 'number' ? call.duration : whisper.duration,
      customerNumber: call.customer_number,
      agentName: asString(agentRecord?.name, '') || null,
    })

    await client.from('ai_transcripts').upsert(
      {
        call_id: context.callId,
        summary: analysis.call_summary,
        call_outcome: analysis.call_outcome,
        history,
        raw_text: whisper.text,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'call_id' }
    )

    await client
      .from('ai_calls')
      .update({
        outcome: analysis.call_outcome,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', context.callId)

    const finalTranscriptText = analysis.diarized_transcript || rawTranscriptText

    await upsertEvaluationRecord(context.callId, {
      status: 'completed',
      transcript_text: finalTranscriptText,
      transcript_source: 'whisper-1',
      analysis_json: analysis,
      call_summary: analysis.call_summary,
      customer_intent: analysis.customer_intent,
      lead_status: analysis.lead_status,
      meeting_datetime: analysis.meeting_datetime,
      meeting_location: analysis.meeting_location,
      main_discussion_points: analysis.main_discussion_points,
      call_outcome: analysis.call_outcome,
      agent_performance: analysis.agent_performance,
      strengths: analysis.what_went_well,
      areas_for_improvement: analysis.areas_for_improvement,
      next_best_actions: analysis.next_best_actions,
      overall_feedback: analysis.overall_feedback,
      overall_score: analysis.scores.overall_call_score,
      agent_performance_score: analysis.scores.agent_performance_score,
      customer_engagement_score: analysis.scores.customer_engagement_score,
      communication_score: analysis.scores.communication_score,
      qualification_score: analysis.scores.qualification_score,
      score: analysis.scores.overall_call_score,
      issues: analysis.areas_for_improvement,
      suggestions: analysis.next_best_actions,
      error_message: null,
      processed_at: new Date().toISOString(),
    })

    await logAuditEvent('call.evaluation.completed', {
      call_id: context.callId,
      overall_score: analysis.scores.overall_call_score,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown evaluation error'

    await upsertEvaluationRecord(context.callId, {
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    })

    await logAuditEvent('call.evaluation.failed', {
      call_id: context.callId,
      error: errorMessage,
    })

    throw error
  }
}

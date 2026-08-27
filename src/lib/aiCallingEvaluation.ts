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
  data_capture_completeness_score: number
}

interface EvaluationAnalysis {
  call_summary: string
  customer_intent: string
  lead_status: 'Information Collected' | 'Callback Required' | 'Not Interested' | 'No Answer' | 'Wrong Number'
  information_captured: Record<string, string>
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
  recordingUrl: string | null
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

  const rawStatus = asString(raw.lead_status)
  let normalizedStatus: EvaluationAnalysis['lead_status'] = 'Information Collected'
  if (rawStatus === 'Verified' || rawStatus === 'Information Collected') {
    normalizedStatus = 'Information Collected'
  } else if (rawStatus === 'Callback Required') {
    normalizedStatus = 'Callback Required'
  } else if (rawStatus === 'Not Interested') {
    normalizedStatus = 'Not Interested'
  } else if (rawStatus === 'Wrong Number') {
    normalizedStatus = 'Wrong Number'
  } else if (rawStatus === 'No Answer') {
    normalizedStatus = 'No Answer'
  }

  return {
    call_summary: asString(raw.call_summary),
    customer_intent: asString(raw.customer_intent),
    lead_status: normalizedStatus,
    information_captured: isRecord(raw.information_captured) ? (raw.information_captured as Record<string, string>) : {},
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
      deflection_handling: normalizePerformanceDimension(agentPerformance.deflection_handling),
      accuracy: normalizePerformanceDimension(agentPerformance.accuracy),
      conversation_flow: normalizePerformanceDimension(agentPerformance.conversation_flow),
      confidence: normalizePerformanceDimension(agentPerformance.confidence),
      closing_quality: normalizePerformanceDimension(agentPerformance.closing_quality),
      script_and_flow_adherence: normalizePerformanceDimension(agentPerformance.script_and_flow_adherence),
    },
    what_went_well: asStringArray(raw.what_went_well),
    areas_for_improvement: asStringArray(raw.areas_for_improvement),
    next_best_actions: asStringArray(raw.next_best_actions),
    scores: {
      overall_call_score: clampScore(scores.overall_call_score),
      agent_performance_score: clampScore(scores.agent_performance_score),
      customer_engagement_score: clampScore(scores.customer_engagement_score),
      communication_score: clampScore(scores.communication_score),
      data_capture_completeness_score: clampScore(scores.data_capture_completeness_score),
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
    'You are evaluating a lead-qualification AI agent call for Shriram PFA (Personal Finance Advisor) — an insurance and personal finance advisory service.',
    'Return ONLY valid JSON.',
    'Score everything on a 0-100 scale.',
    'Be concise, evidence-based, and grounded in the transcript.',
    '',
    'CRITICAL FAILURE CAP RULE:',
    'If any of the following occurred anywhere in the transcript, cap the overall_call_score at 40 regardless of other weighted scores, and explicitly list the failure in "areas_for_improvement":',
    '- Agent repeated its name, "Shriram PFA," the greeting, or the reason for calling more than once.',
    '- Agent went silent / produced no reply to a caller turn.',
    '- Agent discussed specific premium amounts, guaranteed returns, or exact policy figures instead of using the referral line ("Our financial advisor will guide you on this in detail during the next call.").',
    '- Agent ended the call without calling the correct tool and without a spoken goodbye.',
    '- The Call Status logged does not match what actually happened in the transcript.',
    '- Agent failed to confirm the customer\'s availability for a follow-up call.',
    '',
    'Required JSON shape:',
    '{',
    '  "call_summary": string,',
    '  "customer_intent": string,',
    '  "lead_status": "Information Collected" | "Callback Required" | "Not Interested" | "No Answer" | "Wrong Number", // Must match what actually happened or the tool called at the end.',
    '  "information_captured": {',
    '    // Extract the following exactly as said in transcript. Use "N/A" or "Not Captured" if not present.',
    '    "Customer full name": string,',
    '    "Mobile number": string,',
    '    "City": string,',
    '    "Age": string,',
    '    "Occupation": string,',
    '    "Policy or product of interest": string,    // E.g. life insurance, ULIP, pension plan, mutual fund',
    '    "Existing policy holder": string,           // Yes / No / Not Captured',
    '    "Annual income or investment capacity": string,',
    '    "Preferred language": string,',
    '    "Callback date and time": string,',
    '    "Email address": string,',
    '    "Number of dependents": string,',
    '    "Lead source or campaign name": string',
    '  },',
    '  "meeting_datetime": string | null, // If the user specifies a relative date like "today" or "tomorrow", output EXACTLY the relative phrase (e.g., "Tomorrow 12:00 PM"). Do NOT output arbitrary absolute dates or ISO strings if they are not explicitly mentioned.',
    '  "meeting_location": string | null, // Address or location mentioned for the meeting, otherwise null',
    '  "main_discussion_points": string[],',
    '',
    '  "call_outcome": string,',
    '  "agent_performance": {',
    '    "greeting_quality": {"score": number, "feedback": string},',
    '    "professionalism": {"score": number, "feedback": string},',
    '    "tone": {"score": number, "feedback": string},',
    '    "clarity": {"score": number, "feedback": string},',
    '    "listening_ability": {"score": number, "feedback": string},',
    '    "question_quality": {"score": number, "feedback": string},',
    '    "deflection_handling": {"score": number, "feedback": string}, // Score whether agent correctly deflected premium/returns queries to the human advisor',
    '    "accuracy": {"score": number, "feedback": string},',
    '    "conversation_flow": {"score": number, "feedback": string},',
    '    "confidence": {"score": number, "feedback": string},',
    '    "closing_quality": {"score": number, "feedback": string}, // Score if agent confirmed callback time, called correct tool, said goodbye',
    '    "script_and_flow_adherence": {"score": number, "feedback": string} // Score if call followed expected order, 1 question per turn, no skipped/duped steps',
    '  },',
    '  "what_went_well": string[],',
    '  "areas_for_improvement": string[],',
    '  "next_best_actions": string[],',
    '  "scores": {',
    '    "overall_call_score": number,',
    '    "agent_performance_score": number,',
    '    "customer_engagement_score": number,',
    '    "communication_score": number,',
    '    "data_capture_completeness_score": number // Score how many of the 13 fields above were correctly captured vs applicable',
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

  try {
    await runEvaluationPipeline(context)
  } catch (error) {
    console.error('Evaluation pipeline failed:', error)
    await upsertEvaluationRecord(context.callId, {
      status: 'failed',
      error_message: error instanceof Error ? error.message : String(error)
    })
  }
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

    // Always try to fetch a fresh recording URL from IndusLabs to avoid expired S3 presigned URLs (403)
    let recordingUrl: string | null = context.recordingUrl || null
    const freshUrl = await fetchFreshRecordingUrl(context.callId)
    if (freshUrl) {
      recordingUrl = freshUrl
      // Persist the refreshed URL in DB so it's available next time
      await client
        .from('ai_calls')
        .update({ recording_url: freshUrl, updated_at: new Date().toISOString() })
        .eq('call_id', context.callId)
    }

    // Determine transcript source: prefer Whisper transcription from recording,
    // but fall back to the stored transcript text if no valid recording URL is available.
    let whisperText = ''
    let whisperDuration: number | null = null
    let transcriptSource = 'transcript-history'

    const hasValidRecordingUrl =
      recordingUrl &&
      recordingUrl !== 'pending' &&
      recordingUrl !== 'failed' &&
      recordingUrl !== ''

    if (hasValidRecordingUrl) {
      try {
        const whisper = await transcribeRecording(recordingUrl!)
        whisperText = whisper.text
        whisperDuration = whisper.duration
        transcriptSource = 'whisper-1'
      } catch (whisperError) {
        console.warn(
          `[Evaluation] Whisper transcription failed for ${context.callId}, falling back to stored transcript:`,
          whisperError instanceof Error ? whisperError.message : whisperError
        )
      }
    }

    // Use the best available transcript text
    const storedRawText = asString(transcriptRecord?.raw_text, '')
    const rawTranscriptText = formattedHistoryTranscript || whisperText || storedRawText

    if (!rawTranscriptText) {
      throw new Error(`No transcript text available for evaluation of call ${context.callId}. Recording URL: ${recordingUrl || 'none'}, history turns: ${history.length}`)
    }

    const analysis = await analyzeTranscript({
      transcriptText: rawTranscriptText,
      rawTranscription: whisperText || rawTranscriptText,
      existingOutcome: call.outcome || asString(transcriptRecord?.call_outcome, '') || null,
      duration: typeof call.duration === 'number' ? call.duration : whisperDuration,
      customerNumber: call.customer_number,
      agentName: asString(agentRecord?.name, '') || null,
    })

    await client.from('ai_transcripts').upsert(
      {
        call_id: context.callId,
        summary: analysis.call_summary,
        call_outcome: analysis.call_outcome,
        history,
        raw_text: whisperText || storedRawText,
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
      transcript_source: transcriptSource,
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
      data_capture_completeness_score: analysis.scores.data_capture_completeness_score,
      information_captured: analysis.information_captured,
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

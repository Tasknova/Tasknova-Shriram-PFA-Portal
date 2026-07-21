import { createServerClient } from '@/lib/supabase'

type JsonObject = Record<string, unknown>



interface WhisperTranscriptResult {
  text: string
  language: string | null
  duration: number | null
}

interface PerformanceDimension {
  score: number
  feedback: string
}

interface ScoreDetail {
  score: number
  explanation: string
}

interface EvaluationScores {
  overall_call_score: number
  agent_performance_score: number
  customer_engagement_score: number
  communication_score: number
  qualification_score: number
}

interface C2CEvaluationScores {
  overall_conversation_score: number
  communication_score: number
  listening_score: number
  clarity_score: number
  conversation_flow_score: number
  engagement_score: number
  professionalism_score: number
  confidence_score: number
  resolution_effectiveness_score: number
}

interface EvaluationAnalysis {
  call_summary: string
  customer_intent: string
  main_discussion_points: string[]
  call_outcome: string
  agent_performance: Record<string, PerformanceDimension>
  what_went_well: string[]
  areas_for_improvement: string[]
  next_best_actions: string[]
  scores: EvaluationScores
  overall_feedback: string
  conversation_objective: string
  conversation_outcome: string
  key_insights: string[]
  communication_highlights: string[]
  important_decisions: string[]
  action_items: string[]
  communication_analysis: Record<string, ScoreDetail>
  c2c_scores: C2CEvaluationScores
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
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, Math.min(100, Math.round(parsed)))
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
}

function normalizePerformanceDimension(value: unknown): PerformanceDimension {
  if (!isRecord(value)) return { score: 0, feedback: '' }
  return {
    score: clampScore(value.score),
    feedback: asString(value.feedback || value.explanation),
  }
}

function parseJsonObject(raw: string): JsonObject {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (isRecord(parsed)) return parsed
  } catch (error) {
    throw new Error(`Failed to parse OpenAI JSON response: ${String(error)}`)
  }
  throw new Error('OpenAI response was not a JSON object')
}

function normalizeScoreDetail(value: unknown): ScoreDetail {
  if (!isRecord(value)) return { score: 0, explanation: '' }
  return {
    score: clampScore(value.score || value.value),
    explanation: asString(value.explanation || value.feedback || ''),
  }
}

function normalizeAnalysis(raw: JsonObject): EvaluationAnalysis {
  const scores = isRecord(raw.scores) ? raw.scores : {}
  const agentPerformance = isRecord(raw.agent_performance) ? raw.agent_performance : {}
  const communicationAnalysis = isRecord(raw.communication_analysis) ? raw.communication_analysis : {}
  const c2cScores = isRecord(raw.c2c_scores) ? raw.c2c_scores : {}

  return {
    call_summary: asString(raw.call_summary),
    customer_intent: asString(raw.conversation_objective || raw.customer_intent),
    main_discussion_points: asStringArray(raw.main_discussion_points),
    call_outcome: asString(raw.conversation_outcome || raw.call_outcome),
    agent_performance: {
      greeting_quality: normalizePerformanceDimension(agentPerformance.greeting_quality || agentPerformance.tone),
      professionalism: normalizePerformanceDimension(agentPerformance.professionalism),
      tone: normalizePerformanceDimension(agentPerformance.tone),
      clarity: normalizePerformanceDimension(agentPerformance.clarity),
      listening_ability: normalizePerformanceDimension(agentPerformance.listening_ability),
      question_quality: normalizePerformanceDimension(agentPerformance.question_quality),
      objection_handling: normalizePerformanceDimension(agentPerformance.objection_handling || agentPerformance.resolution_effectiveness),
      accuracy: normalizePerformanceDimension(agentPerformance.accuracy || agentPerformance.response_quality),
      conversation_flow: normalizePerformanceDimension(agentPerformance.conversation_flow),
      confidence: normalizePerformanceDimension(agentPerformance.confidence),
      closing_quality: normalizePerformanceDimension(agentPerformance.closing_quality || agentPerformance.resolution_effectiveness),
    },
    what_went_well: asStringArray(raw.what_went_well),
    areas_for_improvement: asStringArray(raw.areas_for_improvement),
    next_best_actions: asStringArray(raw.next_best_actions),
    scores: {
      overall_call_score: clampScore(c2cScores.overall_conversation_score || scores.overall_call_score),
      agent_performance_score: clampScore(c2cScores.communication_score || c2cScores.professionalism_score || scores.agent_performance_score),
      customer_engagement_score: clampScore(c2cScores.engagement_score || scores.customer_engagement_score),
      communication_score: clampScore(c2cScores.communication_score || c2cScores.clarity_score || scores.communication_score),
      qualification_score: clampScore(c2cScores.resolution_effectiveness_score || scores.qualification_score),
    },
    overall_feedback: asString(raw.overall_feedback),
    conversation_objective: asString(raw.conversation_objective || raw.customer_intent),
    conversation_outcome: asString(raw.conversation_outcome || raw.call_outcome),
    key_insights: asStringArray(raw.key_insights),
    communication_highlights: asStringArray(raw.communication_highlights),
    important_decisions: asStringArray(raw.important_decisions),
    action_items: asStringArray(raw.action_items),
    communication_analysis: {
      tone: normalizeScoreDetail(communicationAnalysis.tone),
      clarity: normalizeScoreDetail(communicationAnalysis.clarity),
      listening_ability: normalizeScoreDetail(communicationAnalysis.listening_ability),
      confidence: normalizeScoreDetail(communicationAnalysis.confidence),
      conversation_flow: normalizeScoreDetail(communicationAnalysis.conversation_flow),
      professionalism: normalizeScoreDetail(communicationAnalysis.professionalism),
      question_quality: normalizeScoreDetail(communicationAnalysis.question_quality),
      mutual_understanding: normalizeScoreDetail(communicationAnalysis.mutual_understanding),
      response_quality: normalizeScoreDetail(communicationAnalysis.response_quality || communicationAnalysis.accuracy),
      resolution_effectiveness: normalizeScoreDetail(communicationAnalysis.resolution_effectiveness || communicationAnalysis.objection_handling),
    },
    c2c_scores: {
      overall_conversation_score: clampScore(c2cScores.overall_conversation_score || scores.overall_call_score),
      communication_score: clampScore(c2cScores.communication_score || scores.communication_score),
      listening_score: clampScore(c2cScores.listening_score),
      clarity_score: clampScore(c2cScores.clarity_score),
      conversation_flow_score: clampScore(c2cScores.conversation_flow_score),
      engagement_score: clampScore(c2cScores.engagement_score || scores.customer_engagement_score),
      professionalism_score: clampScore(c2cScores.professionalism_score),
      confidence_score: clampScore(c2cScores.confidence_score),
      resolution_effectiveness_score: clampScore(c2cScores.resolution_effectiveness_score || scores.qualification_score),
    },
    diarized_transcript: asString(raw.diarized_transcript),
  }
}

function getRecordingFileName(recordingUrl: string, contentType: string | null): string {
  try {
    const url = new URL(recordingUrl)
    const lastSegment = url.pathname.split('/').filter(Boolean).pop()
    if (lastSegment) return lastSegment
  } catch {}
  if (contentType?.includes('wav')) return 'recording.wav'
  if (contentType?.includes('mpeg')) return 'recording.mp3'
  if (contentType?.includes('mp4')) return 'recording.mp4'
  return 'recording.audio'
}


export async function fetchFreshRecordingUrl(callId: string): Promise<string | null> {
  try {
    const { getIndusLabsAccessToken } = await import('@/lib/aiAgentsUtils')
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) return null

    const response = await fetch(
      `https://developer.induslabs.io/api/calls/${callId}/transcript`,
      { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!response.ok) return null

    const payload = (await response.json()) as { data?: { recording?: string | null } }
    const recording = payload.data?.recording
    if (recording === 'pending' || recording === 'failed') return null
    return recording || null
  } catch {
    return null
  }
}

export async function transcribeRecording(recordingUrl: string): Promise<WhisperTranscriptResult> {
  const openAiApiKey = process.env.OPENAI_API_KEY
  if (!openAiApiKey) throw new Error('OPENAI_API_KEY is not configured')

  const recordingResponse = await fetch(recordingUrl)
  if (!recordingResponse.ok) throw new Error(`Failed to download recording: ${recordingResponse.status}`)

  const audioBuffer = await recordingResponse.arrayBuffer()
  const contentType = recordingResponse.headers.get('content-type')
  const formData = new FormData()
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'verbose_json')
  formData.append('file', new Blob([audioBuffer], { type: contentType || 'application/octet-stream' }), getRecordingFileName(recordingUrl, contentType))

  const transcriptResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiApiKey}` },
    body: formData,
  })

  if (!transcriptResponse.ok) {
    const errorText = await transcriptResponse.text()
    throw new Error(`Whisper transcription failed: ${transcriptResponse.status} ${errorText}`)
  }

  const payload = (await transcriptResponse.json()) as { text?: string, language?: string, duration?: number }
  const text = payload.text?.trim()
  if (!text) throw new Error('Whisper did not return transcript text')

  return { text, language: payload.language || null, duration: typeof payload.duration === 'number' ? payload.duration : null }
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
  if (!openAiApiKey) throw new Error('OPENAI_API_KEY is not configured')

  const prompt = [
    'You are evaluating a human-to-human C2C (Caller to Receiver) conversation.',
    'Return ONLY valid JSON. Score everything on a 0-100 scale.',
    'Be contextual, realistic, and evidence-based. Avoid generic responses.',
    '',
    'IMPORTANT: This is NOT an AI agent or sales call.',
    'Use "Caller" and "Receiver" terminology throughout.',
    'Never use terms like: agent, customer, sales, lead, qualification.',
    '',
    'Required JSON shape:',
    '{',
    '  "call_summary": string (2-3 sentence summary of the entire conversation),',
    '  "conversation_objective": string (what the caller was trying to accomplish),',
    '  "conversation_outcome": string (what was achieved or not achieved),',
    '  "main_discussion_points": string[] (key topics discussed, 3-6 items),',
    '  "what_went_well": string[] (specific positive aspects, 2-4 items),',
    '  "areas_for_improvement": string[] (specific areas needing improvement, 2-4 items),',
    '  "next_best_actions": string[] (recommended follow-up steps, 2-3 items),',
    '  "overall_feedback": string (1-2 paragraph holistic assessment),',
    '  "key_insights": string[] (notable observations about the interaction, 2-4 items),',
    '  "communication_highlights": string[] (exceptional moments in the conversation, 1-3 items),',
    '  "important_decisions": string[] (any decisions made during the call, 0-3 items),',
    '  "action_items": string[] (specific tasks assigned, leave empty if none),',
    '  "communication_analysis": {',
    '    "tone": {"score": number, "explanation": string},',
    '    "clarity": {"score": number, "explanation": string},',
    '    "listening_ability": {"score": number, "explanation": string},',
    '    "confidence": {"score": number, "explanation": string},',
    '    "conversation_flow": {"score": number, "explanation": string},',
    '    "professionalism": {"score": number, "explanation": string},',
    '    "question_quality": {"score": number, "explanation": string},',
    '    "mutual_understanding": {"score": number, "explanation": string},',
    '    "response_quality": {"score": number, "explanation": string},',
    '    "resolution_effectiveness": {"score": number, "explanation": string}',
    '  },',
    '  "c2c_scores": {',
    '    "overall_conversation_score": number,',
    '    "communication_score": number,',
    '    "listening_score": number,',
    '    "clarity_score": number,',
    '    "conversation_flow_score": number,',
    '    "engagement_score": number,',
    '    "professionalism_score": number,',
    '    "confidence_score": number,',
    '    "resolution_effectiveness_score": number',
    '  },',
    '  "diarized_transcript": string // IMPORTANT: Output a formatted string separating speakers with newlines. E.g. "Agent: Hello\\nCustomer: Hi"',
    '}',
    '',
    `Caller (From Number): ${args.agentName || 'Unknown'}`,
    `Receiver (To Number): ${args.customerNumber || 'Unknown'}`,
    `Call duration in seconds: ${args.duration ?? 'Unknown'}`,
    `Existing outcome if any: ${args.existingOutcome || 'Unknown'}`,
    '',
    'Conversation transcript:',
    args.transcriptText,
    '',
    'Raw transcription:',
    args.rawTranscription,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openAiApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You produce strict JSON evaluations for C2C (human-to-human) call transcripts. Use Caller/Receiver terminology. Never use agent, customer, sales, lead, or qualification.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`GPT analysis failed: ${response.status} ${errorText}`)
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = payload.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('GPT analysis did not return any content')

  return normalizeAnalysis(parseJsonObject(content))
}

async function upsertEvaluationRecord(callId: string, fields: Record<string, unknown>): Promise<void> {
  const client = createServerClient()
  const { error } = await client.from('c2c_evaluations').upsert(
    { call_id: callId, updated_at: new Date().toISOString(), ...fields },
    { onConflict: 'call_id' }
  )
  if (error) throw new Error(`Failed to upsert evaluation for ${callId}: ${error.message}`)
}

export async function triggerEvaluationPipeline(context: EvaluationPipelineContext, force = false): Promise<void> {
  const client = createServerClient()
  if (!force) {
    const { data: existing } = await client.from('c2c_evaluations').select('status').eq('call_id', context.callId).maybeSingle()
    if (existing?.status === 'completed') return
  }

  await upsertEvaluationRecord(context.callId, { status: 'processing', error_message: null, processed_at: null })

  void runEvaluationPipeline(context).catch(async (error) => {
    const errorMessage = error instanceof Error ? error.message : 'Unknown pipeline error'
    console.error('[C2C] Evaluation pipeline failed for', context.callId, ':', errorMessage)
    await upsertEvaluationRecord(context.callId, {
      status: 'failed',
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    }).catch(() => {})
  })
}

async function runEvaluationPipeline(context: EvaluationPipelineContext): Promise<void> {
  const client = createServerClient()

  try {
    const { data: call, error: callError } = await client
      .from('c2c_calls')
      .select('call_id, duration, outcome, from_number, to_number, recording_url, c2c_transcripts(summary, call_outcome, history, raw_text)')
      .eq('call_id', context.callId)
      .single()

    if (callError || !call) throw new Error(`Call not found for evaluation: ${context.callId}`)

    const transcriptRecord = getFirstRelationRecord(call.c2c_transcripts)
    const history = Array.isArray(transcriptRecord?.history) ? transcriptRecord.history : []

    let transcriptText: string
    let rawTranscriptionText: string

    // Check if we already have a Whisper transcript cached in the evaluation record
    const { data: existingEval } = await client
      .from('c2c_evaluations')
      .select('transcript_text, analysis_json')
      .eq('call_id', context.callId)
      .maybeSingle()

    const isWhisperGenerated = (existingEval?.analysis_json as Record<string, unknown>)?.whisper_generated === true
    const existingWhisperTranscript = isWhisperGenerated && existingEval?.transcript_text ? existingEval.transcript_text : null

    if (existingWhisperTranscript) {
      transcriptText = existingWhisperTranscript
      rawTranscriptionText = existingWhisperTranscript
    } else {
      let recordingUrl = context.recordingUrl
      const freshUrl = await fetchFreshRecordingUrl(context.callId)
      if (freshUrl) {
        recordingUrl = freshUrl
        await client.from('c2c_calls').update({ recording_url: freshUrl, updated_at: new Date().toISOString() }).eq('call_id', context.callId)
      }

      if (!recordingUrl || recordingUrl === 'pending' || recordingUrl === 'failed') {
        throw new Error('No transcript or recording available for evaluation')
      }

      const whisper = await transcribeRecording(recordingUrl)
      transcriptText = whisper.text
      rawTranscriptionText = whisper.text
      
      // We explicitly DO NOT save this to c2c_transcripts anymore, so the Calls page
      // continues to use the existing IndusLabs transcript.
    }

    const analysis = await analyzeTranscript({
      transcriptText,
      rawTranscription: rawTranscriptionText,
      existingOutcome: call.outcome || asString(transcriptRecord?.call_outcome, '') || null,
      duration: typeof call.duration === 'number' ? call.duration : null,
      customerNumber: call.to_number,
      agentName: call.from_number,
    })

    // Re-read transcript to get the latest history (webhook may have stored it after pipeline started)
    const { data: latestTranscript } = await client
      .from('c2c_transcripts')
      .select('history')
      .eq('call_id', context.callId)
      .maybeSingle()
    const finalHistory = latestTranscript?.history && Array.isArray(latestTranscript.history) && latestTranscript.history.length > 0
      ? latestTranscript.history
      : history

    await client.from('c2c_transcripts').upsert(
      {
        call_id: context.callId,
        summary: analysis.call_summary,
        call_outcome: analysis.conversation_outcome || analysis.call_outcome,
        history: finalHistory,
        raw_text: rawTranscriptionText,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'call_id' }
    )

    await client.from('c2c_calls').update({ outcome: analysis.conversation_outcome || analysis.call_outcome, updated_at: new Date().toISOString() }).eq('call_id', context.callId)

    await upsertEvaluationRecord(context.callId, {
      status: 'completed',
      transcript_text: analysis.diarized_transcript || transcriptText,
      analysis_json: { ...analysis, whisper_generated: true },
      call_summary: analysis.call_summary,
      customer_intent: analysis.conversation_objective || analysis.customer_intent,
      main_discussion_points: analysis.main_discussion_points,
      call_outcome: analysis.conversation_outcome || analysis.call_outcome,
      agent_performance: analysis.agent_performance,
      strengths: analysis.what_went_well,
      areas_for_improvement: analysis.areas_for_improvement,
      next_best_actions: analysis.next_best_actions,
      overall_feedback: analysis.overall_feedback,
      overall_score: analysis.c2c_scores.overall_conversation_score || analysis.scores.overall_call_score,
      agent_performance_score: analysis.c2c_scores.communication_score || analysis.c2c_scores.professionalism_score || analysis.scores.agent_performance_score,
      customer_engagement_score: analysis.c2c_scores.engagement_score || analysis.scores.customer_engagement_score,
      communication_score: analysis.c2c_scores.communication_score || analysis.c2c_scores.clarity_score || analysis.scores.communication_score,
      qualification_score: analysis.c2c_scores.resolution_effectiveness_score || analysis.scores.qualification_score,
      score: analysis.c2c_scores.overall_conversation_score || analysis.scores.overall_call_score,
      issues: analysis.areas_for_improvement,
      suggestions: analysis.next_best_actions,
      error_message: null,
      processed_at: new Date().toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown evaluation error'
    await upsertEvaluationRecord(context.callId, { status: 'failed', error_message: errorMessage, processed_at: new Date().toISOString() })
    throw error
  }
}

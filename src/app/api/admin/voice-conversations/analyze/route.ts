import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  id: z.string().min(1),
  force: z.boolean().optional().default(false),
})

const analysisSchema = z.object({
  overall_summary: z.string().min(1),
  call_outcome: z.string().default(''),
  sentiment: z.enum(['positive', 'neutral', 'negative']).default('neutral'),
  lead_score: z.number().min(0).max(100).default(50),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  customer_intent: z.array(z.string()).default([]),
  key_points: z.array(z.string()).default([]),
  objections_or_risks: z.array(z.string()).default([]),
  action_items: z.array(z.string()).default([]),
  follow_up_recommendations: z.array(z.string()).default([]),
  generated_at: z.string().default(() => new Date().toISOString()),
})

type VoiceConversationRow = {
  id: string
  transcript: string | null
  summary: string | null
  lead_details: string | null
  analysis: Record<string, unknown> | null
  analysis_status?: 'not_started' | 'processing' | 'completed' | 'failed' | null
  analysis_generated_at?: string | null
  analysis_error?: string | null
}

function hasNonEmptyAnalysis(analysis: unknown): boolean {
  if (analysis === null || analysis === undefined) return false

  if (typeof analysis === 'string') {
    const normalized = analysis.trim().toLowerCase()
    return normalized.length > 0 && normalized !== 'null' && normalized !== '{}' && normalized !== '[]'
  }

  if (Array.isArray(analysis)) {
    return analysis.length > 0
  }

  if (typeof analysis === 'object') {
    return Object.keys(analysis as Record<string, unknown>).length > 0
  }

  return true
}

function extractJsonObject(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    const first = text.indexOf('{')
    const last = text.lastIndexOf('}')

    if (first === -1 || last === -1 || last <= first) {
      throw new Error('Model response did not contain a JSON object')
    }

    return JSON.parse(text.slice(first, last + 1))
  }
}

function splitSentences(input: string): string[] {
  return input
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function heuristicAnalysis(transcript: string): z.infer<typeof analysisSchema> {
  const normalized = transcript.toLowerCase()
  const sentences = splitSentences(transcript)

  const positiveSignals = ['great', 'good', 'excellent', 'interested', 'yes', 'happy', 'works for us']
  const negativeSignals = ['not interested', 'expensive', 'busy', 'no budget', 'later', 'problem', 'issue']

  const positiveScore = positiveSignals.filter((signal) => normalized.includes(signal)).length
  const negativeScore = negativeSignals.filter((signal) => normalized.includes(signal)).length

  const sentiment = positiveScore > negativeScore ? 'positive' : negativeScore > positiveScore ? 'negative' : 'neutral'

  const leadScoreBase = 50 + positiveScore * 8 - negativeScore * 8
  const leadScore = Math.max(0, Math.min(100, leadScoreBase))

  const actionItems = sentences
    .filter((line) => /\b(follow up|send|share|schedule|call back|next step|book|meeting)\b/i.test(line))
    .slice(0, 6)

  const keyPoints = sentences.slice(0, 6)

  const customerIntent = [
    /\b(hiring|recruitment|staffing)\b/i.test(normalized) ? 'Interest in hiring or recruitment outcomes' : null,
    /\b(price|pricing|budget|cost)\b/i.test(normalized) ? 'Pricing and budget clarification' : null,
    /\b(integration|tools|system|workflow)\b/i.test(normalized) ? 'Operational fit with current tools/workflow' : null,
  ].filter((item): item is string => Boolean(item))

  const objections = [
    /\bexpensive|budget|cost\b/i.test(normalized) ? 'Potential budget concern' : null,
    /\bnot now|later|busy|next month\b/i.test(normalized) ? 'Possible timeline delay' : null,
    /\bconcern|issue|problem\b/i.test(normalized) ? 'Stated concerns need follow-up' : null,
  ].filter((item): item is string => Boolean(item))

  return {
    overall_summary: keyPoints[0] || 'Conversation captured. Follow-up is recommended.',
    call_outcome:
      sentiment === 'positive'
        ? 'Engaged conversation with potential next steps.'
        : sentiment === 'negative'
          ? 'Conversation indicates blockers that require careful follow-up.'
          : 'Conversation completed with mixed or neutral intent.',
    sentiment,
    lead_score: leadScore,
    confidence: 'low',
    customer_intent: customerIntent,
    key_points: keyPoints,
    objections_or_risks: objections,
    action_items: actionItems,
    follow_up_recommendations: [
      'Share a concise recap and relevant materials.',
      'Confirm timeline, budget, and success criteria.',
      'Schedule the next conversation with a clear agenda.',
    ],
    generated_at: new Date().toISOString(),
  }
}

async function generateGeminiAnalysis(params: {
  transcript: string
  summary?: string | null
  leadDetails?: string | null
}): Promise<z.infer<typeof analysisSchema>> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const transcript = params.transcript.slice(0, 16000)

  const prompt = `You are a sales conversation analyst.
Analyze the call transcript and return strict JSON only.

Transcript:
${transcript}

Existing summary:
${params.summary || 'Not available'}

Lead details:
${params.leadDetails || 'Not available'}

Return JSON with exact shape:
{
  "overall_summary": string,
  "call_outcome": string,
  "sentiment": "positive" | "neutral" | "negative",
  "lead_score": number,
  "confidence": "low" | "medium" | "high",
  "customer_intent": string[],
  "key_points": string[],
  "objections_or_risks": string[],
  "action_items": string[],
  "follow_up_recommendations": string[],
  "generated_at": string
}

Rules:
- No markdown.
- No code fences.
- Output valid JSON only.
- lead_score should be 0-100.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const errorData = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${errorData}`)
  }

  const data = await response.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini returned empty response')
  }

  const parsed = extractJsonObject(text)
  return analysisSchema.parse(parsed)
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  let requestConversationId: string | null = null

  try {
    const body = requestSchema.parse(await request.json())
    requestConversationId = body.id

    const { data: conversation, error: fetchError } = await supabase
      .from('voice_conversations')
      .select('*')
      .eq('id', body.id)
      .single()

    if (fetchError || !conversation) {
      throw new Error('Voice conversation not found')
    }

    const convo = conversation as VoiceConversationRow
    const cachedAnalysisExists = hasNonEmptyAnalysis(convo.analysis)
    const isCompleted = convo.analysis_status === 'completed'

    if (!body.force && (isCompleted || cachedAnalysisExists)) {
      const generatedAt = convo.analysis_generated_at || new Date().toISOString()

      const { data: normalized, error: normalizeError } = await supabase
        .from('voice_conversations')
        .update({
          analysis_status: 'completed',
          analysis_generated_at: generatedAt,
          analysis_error: null,
        })
        .eq('id', body.id)
        .select('*')
        .single()

      if (normalizeError || !normalized) {
        return NextResponse.json({ success: true, conversation: convo, reused: true })
      }

      return NextResponse.json({ success: true, conversation: normalized, reused: true })
    }

    if (!body.force && convo.analysis_status === 'processing') {
      return NextResponse.json(
        { success: false, inProgress: true, message: 'Analysis is already in progress for this call.' },
        { status: 409 }
      )
    }

    if (!body.force) {
      const { data: processingRow, error: processingError } = await supabase
        .from('voice_conversations')
        .update({
          analysis_status: 'processing',
          analysis_error: null,
        })
        .eq('id', body.id)
        .or('analysis_status.is.null,analysis_status.eq.not_started,analysis_status.eq.failed')
        .select('*')
        .maybeSingle()

      if (processingError) {
        throw processingError
      }

      if (!processingRow) {
        const { data: latest, error: latestError } = await supabase
          .from('voice_conversations')
          .select('*')
          .eq('id', body.id)
          .single()

        if (latestError || !latest) {
          throw latestError || new Error('Unable to determine analysis state')
        }

        const latestRow = latest as VoiceConversationRow
        if (hasNonEmptyAnalysis(latestRow.analysis) || latestRow.analysis_status === 'completed') {
          return NextResponse.json({ success: true, conversation: latest, reused: true })
        }

        return NextResponse.json(
          { success: false, inProgress: true, message: 'Analysis is already in progress for this call.' },
          { status: 409 }
        )
      }
    }

    if (!convo.transcript || convo.transcript.trim().length < 20) {
      await supabase
        .from('voice_conversations')
        .update({
          analysis_status: 'failed',
          analysis_error: 'Transcript is missing or too short for analysis',
        })
        .eq('id', body.id)

      return NextResponse.json(
        { error: 'Transcript is missing or too short for analysis' },
        { status: 400 }
      )
    }

    let analysis: z.infer<typeof analysisSchema>

    try {
      analysis = await generateGeminiAnalysis({
        transcript: convo.transcript,
        summary: convo.summary,
        leadDetails: convo.lead_details,
      })
    } catch {
      analysis = heuristicAnalysis(convo.transcript)
    }

    const { data: updated, error: updateError } = await supabase
      .from('voice_conversations')
      .update({
        analysis,
        summary: convo.summary || analysis.overall_summary,
        analysis_status: 'completed',
        analysis_generated_at: new Date().toISOString(),
        analysis_error: null,
      })
      .eq('id', body.id)
      .select('*')
      .single()

    if (updateError || !updated) {
      throw updateError || new Error('Failed to save analysis')
    }

    return NextResponse.json({
      success: true,
      conversation: updated,
      reused: false,
    })
  } catch (error) {
    if (requestConversationId) {
      await supabase
        .from('voice_conversations')
        .update({
          analysis_status: 'failed',
          analysis_error: error instanceof Error ? error.message.slice(0, 1000) : 'Failed to analyze conversation',
        })
        .eq('id', requestConversationId)
    }

    console.error('Voice conversation analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze conversation' },
      { status: 500 }
    )
  }
}

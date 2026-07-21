import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { fetchFreshRecordingUrl, transcribeRecording } from '@/lib/c2cEvaluation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // Allow longer execution for Whisper

export async function GET(
  _req: NextRequest,
  { params }: { params: { callId: string } }
) {
  try {
    const { callId } = params
    const client = createServerClient()

    // 1. Fetch evaluation and check if Whisper is already generated
    const { data: evaluation, error: evalError } = await client
      .from('c2c_evaluations')
      .select('transcript_text, analysis_json, c2c_calls(recording_url)')
      .eq('call_id', callId)
      .maybeSingle()

    if (evalError) {
      return NextResponse.json({ error: 'Failed to fetch evaluation' }, { status: 500 })
    }

    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    const analysisJson = evaluation.analysis_json as Record<string, unknown> | null
    if (analysisJson?.whisper_generated === true && evaluation.transcript_text) {
      // Already generated, return it
      return NextResponse.json({ transcript: evaluation.transcript_text })
    }

    // 2. We need to generate it. Get recording URL.
    const rawCall = Array.isArray(evaluation.c2c_calls) ? evaluation.c2c_calls[0] : evaluation.c2c_calls
    const callData = rawCall as unknown as Record<string, unknown> | null
    let recordingUrl = typeof callData?.recording_url === 'string' ? callData.recording_url : null

    // If it's missing or pending, try to fetch a fresh one
    if (!recordingUrl || recordingUrl === 'pending' || recordingUrl === 'failed') {
      const freshUrl = await fetchFreshRecordingUrl(callId)
      if (freshUrl) {
        recordingUrl = freshUrl
        // Update it in the database
        await client.from('c2c_calls').update({ recording_url: freshUrl, updated_at: new Date().toISOString() }).eq('call_id', callId)
      }
    }

    if (!recordingUrl || recordingUrl === 'pending' || recordingUrl === 'failed') {
      return NextResponse.json({ error: 'Recording URL is not available yet' }, { status: 400 })
    }

    // 3. Transcribe with Whisper
    const whisperResult = await transcribeRecording(recordingUrl)

    // 3.5 Diarize with GPT-4o-mini
    let finalTranscript = whisperResult.text
    try {
      const openAiApiKey = process.env.OPENAI_API_KEY
      if (openAiApiKey) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content: 'You are an expert at diarizing raw call transcripts. Add speaker labels (e.g. Agent: and Customer:) and separate speakers with newlines. Do not change the actual spoken words.',
              },
              {
                role: 'user',
                content: whisperResult.text,
              },
            ],
          }),
        })
        if (response.ok) {
          const payload = await response.json()
          if (payload.choices?.[0]?.message?.content) {
            finalTranscript = payload.choices[0].message.content.trim()
          }
        }
      }
    } catch (err) {
      console.warn('Failed to diarize transcript:', err)
    }

    // 4. Update the evaluation record
    const updatedAnalysisJson = {
      ...(analysisJson || {}),
      whisper_generated: true,
    }

    const { error: updateError } = await client
      .from('c2c_evaluations')
      .update({
        transcript_text: finalTranscript,
        analysis_json: updatedAnalysisJson,
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', callId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save transcript' }, { status: 500 })
    }

    // 5. Return the new transcript
    return NextResponse.json({ transcript: finalTranscript })

  } catch (error) {
    console.error('[C2C Whisper] Error generating transcript:', error)
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, { status: 500 })
  }
}

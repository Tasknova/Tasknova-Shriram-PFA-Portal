import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { isShriramPFAAgent } from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline, cleanTranscriptText } from '@/lib/aiCallingEvaluation'

export const dynamic = 'force-dynamic'
// Allow large audio file uploads (up to 50MB per file)
export const maxDuration = 300

/**
 * Auto-detects the first Shriram PFA agent from the database.
 * This removes the need for the frontend to select an agent manually.
 */
async function getDefaultShriramAgent(): Promise<{ agent_id: string; name: string } | null> {
  const client = createServerClient()
  const { data: agents, error } = await client
    .from('ai_agents')
    .select('agent_id, name')
    .order('created_at', { ascending: true })

  if (error || !agents?.length) return null

  const shriramAgent = agents.find((a) => isShriramPFAAgent(a.name))
  return shriramAgent ?? null
}

/**
 * Extracts a clean customer phone number from filename or label.
 * E.g. "6387129286_Persistency_calling_..." -> "6387129286"
 */
function extractCustomerNumber(fileName: string, label: string | null): string {
  if (label && label.trim()) return label.trim()
  // Try to extract 10-digit Indian mobile number
  const match = fileName.match(/(?:^|[^\d])([6-9]\d{9})(?:[^\d]|$)/)
  if (match && match[1]) {
    return match[1]
  }
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim()
  return base || 'Uploaded Recording'
}

/**
 * Resolves the correct audio MIME type from file extension.
 * Ensures WAV files are never misidentified as MPEG/MP3.
 */
function getAudioMimeType(fileName: string, mimeType?: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'ogg') return 'audio/ogg'
  if (ext === 'webm') return 'audio/webm'
  if (ext === 'flac') return 'audio/flac'
  if (ext === 'aac') return 'audio/aac'
  return mimeType && mimeType.includes('/') ? mimeType : 'audio/wav'
}

/**
 * Creates a call record, saves recording file locally and to storage, and kicks off evaluation.
 * Returns the generated call_id.
 */
async function processUploadedFile(
  file: File,
  agentId: string,
  label: string | null,
): Promise<string> {
  const client = createServerClient()

  const fileBuffer = await file.arrayBuffer()
  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'wav'
  const callId = `uploaded_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const storagePath = `recordings/${callId}.${fileExt}`
  const resolvedMime = getAudioMimeType(file.name, file.type)

  let recordingUrl: string | null = null

  // 1. Save file locally in public/recordings for reliable browser playback
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const recordingsDir = path.join(process.cwd(), 'public', 'recordings')
    await fs.mkdir(recordingsDir, { recursive: true })
    const localFilePath = path.join(recordingsDir, `${callId}.${fileExt}`)
    await fs.writeFile(localFilePath, Buffer.from(fileBuffer))
    recordingUrl = `/recordings/${callId}.${fileExt}`
  } catch (fsErr) {
    console.warn('Local recording file save error:', fsErr)
  }

  // 2. Also attempt upload to Supabase Storage if configured
  try {
    const { error: storageError } = await client.storage
      .from('recordings')
      .upload(storagePath, fileBuffer, {
        contentType: resolvedMime,
        upsert: false,
      })

    if (!storageError) {
      const { data: publicData } = client.storage.from('recordings').getPublicUrl(storagePath)
      if (publicData?.publicUrl) {
        recordingUrl = publicData.publicUrl
      }
    }
  } catch {
    // Supabase bucket might not exist; local file fallback is already saved
  }

  const now = new Date().toISOString()
  const customerNumber = extractCustomerNumber(file.name, label)

  // Create call record
  const { error: callInsertError } = await client.from('ai_calls').insert({
    call_id: callId,
    agent_id: agentId,
    status: 'completed',
    call_type: 'unknown',
    duration: 0,
    recording_url: recordingUrl,
    transcript_status: 'pending',
    outcome: null,
    customer_number: customerNumber,
    agent_number: null,
    did: null,
    created_at: now,
    updated_at: now,
    agent_config: { source: 'upload', filename: file.name },
  })

  if (callInsertError) {
    throw new Error(`Failed to create call record: ${callInsertError.message}`)
  }

  // Create a processing evaluation record immediately
  await client.from('ai_evaluations').insert({
    call_id: callId,
    status: 'processing',
    score: null,
    issues: [],
    suggestions: [],
    created_at: now,
    updated_at: now,
  })

  // Trigger evaluation pipeline
  void runEvaluationFromBuffer(callId, agentId, fileBuffer, file.type, file.name, recordingUrl).catch(
    (err) => {
      console.error('Direct evaluation from buffer failed:', err)
    }
  )

  return callId
}

/**
 * Creates a call record and directly saves the transcript text, kicking off evaluation.
 */
async function processTranscriptText(text: string, agentId: string): Promise<string> {
  const client = createServerClient()
  const callId = `uploaded_transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  const now = new Date().toISOString()
  
  // Create call record (no recording URL)
  const { error: callInsertError } = await client.from('ai_calls').insert({
    call_id: callId,
    agent_id: agentId,
    status: 'completed',
    call_type: 'unknown',
    duration: 0,
    recording_url: null,
    transcript_status: 'completed', // we already have transcript
    outcome: null,
    customer_number: 'Transcript Upload',
    agent_number: null,
    did: null,
    created_at: now,
    updated_at: now,
    agent_config: { source: 'transcript_upload' },
  })

  if (callInsertError) {
    throw new Error(`Failed to create call record for transcript: ${callInsertError.message}`)
  }

  // Create ai_transcripts record immediately
  await client.from('ai_transcripts').insert({
    call_id: callId,
    raw_text: text,
    history: [],
    updated_at: now,
  })

  // Create evaluation record
  await client.from('ai_evaluations').insert({
    call_id: callId,
    status: 'processing',
    score: null,
    issues: [],
    suggestions: [],
    created_at: now,
    updated_at: now,
  })

  // Trigger evaluation pipeline
  void triggerEvaluationPipeline({ callId, recordingUrl: null }, true).catch(
    (err) => console.error('Direct evaluation from transcript failed:', err)
  )

  return callId
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    // Auto-detect Shriram PFA agent — no need for frontend to select
    const agent = await getDefaultShriramAgent()
    if (!agent) {
      return NextResponse.json(
        { error: 'No Shriram PFA agent found in database. Please create one first.' },
        { status: 400 }
      )
    }

    // Support single file, multi-file campaign, or pure text transcript
    const singleFile = formData.get('recording') as File | null
    const multiFiles = formData.getAll('recordings[]') as File[]
    const textTranscript = formData.get('transcript') as string | null

    // If text transcript is provided (and no files)
    if (textTranscript && textTranscript.trim().length > 0) {
      try {
        const callId = await processTranscriptText(textTranscript, agent.agent_id)
        return NextResponse.json({
          success: true,
          call_ids: [callId],
          call_id: callId,
          total: 1,
          processed: 1,
          failed: 0,
          message: 'Transcript uploaded successfully. Evaluation is processing in the background.',
        })
      } catch (err) {
        console.error('Failed to process text transcript:', err)
        return NextResponse.json(
          { error: 'Failed to process transcript', details: String(err) },
          { status: 500 }
        )
      }
    }

    const filesToProcess: File[] = []
    if (singleFile && singleFile.size > 0) {
      filesToProcess.push(singleFile)
    }
    for (const f of multiFiles) {
      if (f && f.size > 0) filesToProcess.push(f)
    }

    if (filesToProcess.length === 0) {
      return NextResponse.json({ error: 'No recording file(s) or transcript provided' }, { status: 400 })
    }

    // Process all files
    const callIds: string[] = []
    const errors: string[] = []

    for (const file of filesToProcess) {
      try {
        const callId = await processUploadedFile(file, agent.agent_id, null)
        callIds.push(callId)
      } catch (err) {
        console.error(`Failed to process file "${file.name}":`, err)
        errors.push(`${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (callIds.length === 0) {
      return NextResponse.json(
        { error: 'All uploads failed', details: errors },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      call_ids: callIds,
      // Keep single call_id for backwards compatibility
      call_id: callIds[0],
      total: filesToProcess.length,
      processed: callIds.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${callIds.length} recording(s) uploaded successfully. Evaluations are processing in the background.`,
    })
  } catch (error) {
    console.error('Error handling recording upload:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

async function runEvaluationFromBuffer(
  callId: string,
  agentId: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  fileName: string,
  recordingUrl: string | null
): Promise<void> {
  const client = createServerClient()

  try {
    const openAiApiKey = process.env.OPENAI_API_KEY
    if (!openAiApiKey) throw new Error('OPENAI_API_KEY not configured')

    const resolvedMime = getAudioMimeType(fileName, mimeType)

    // Step 1: Transcribe with Whisper (deterministic temperature 0 and Shriram PFA domain prompt)
    const whisperForm = new FormData()
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('response_format', 'verbose_json')
    whisperForm.append('timestamp_granularities[]', 'segment')
    // Removing the prompt to avoid Whisper hallucinations on telephony audio
    whisperForm.append(
      'file',
      new Blob([fileBuffer], { type: resolvedMime }),
      fileName
    )

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAiApiKey}` },
      body: whisperForm,
    })

    if (!whisperRes.ok) {
      const err = await whisperRes.text()
      throw new Error(`Whisper transcription failed: ${whisperRes.status} ${err}`)
    }

    const whisperPayload = (await whisperRes.json()) as {
      text?: string
      duration?: number
      segments?: Array<{ start: number; end: number; text: string }>
    }

    const whisperText = cleanTranscriptText(whisperPayload.text?.trim() || '')
    const whisperDuration = whisperPayload.duration || 0

    if (!whisperText) throw new Error('Whisper returned empty transcript (or only background silence)')

    // Build clean transcript text from segments
    let transcriptHint = whisperText
    if (whisperPayload.segments && whisperPayload.segments.length > 0) {
      const segmentLines = whisperPayload.segments
        .map((s) => cleanTranscriptText(s.text.trim()))
        .filter(Boolean)
      if (segmentLines.length > 0) {
        transcriptHint = segmentLines.join('\n')
      }
    }

    // Update duration on call record
    await client
      .from('ai_calls')
      .update({ duration: Math.round(whisperDuration), updated_at: new Date().toISOString() })
      .eq('call_id', callId)

    // Step 2: Store cleaned transcript
    await client.from('ai_transcripts').upsert(
      {
        call_id: callId,
        raw_text: transcriptHint,
        history: [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'call_id' }
    )

    // Step 3: Run GPT-4o evaluation via shared pipeline
    await triggerEvaluationPipeline({ callId, recordingUrl })
  } catch (error) {
    console.error('Buffer evaluation failed:', error)
    await client
      .from('ai_evaluations')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
      })
      .eq('call_id', callId)
  }
}

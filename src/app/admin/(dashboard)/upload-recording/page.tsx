'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileAudio,
  Folder,
  Loader2,
  Mic,
  PhoneCall,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
  FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type UploadMode = 'single' | 'campaign' | 'transcript'
type UploadState = 'idle' | 'uploading' | 'success' | 'error'

interface EvalResult {
  id: string
  call_id: string
  status: 'processing' | 'completed' | 'failed'
  score: number | null
  overall_score: number | null
  lead_status: string | null
  meeting_datetime: string | null
  overall_feedback: string | null
  error_message: string | null
  processed_at: string | null
  created_at: string
  ai_calls: {
    call_id: string
    customer_number: string | null
    duration: number
    created_at: string
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function ScoreBadge({ score, status }: { score: number | null; status: EvalResult['status'] }) {
  if (status === 'processing')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-medium">
        <Loader2 className="w-3 h-3 animate-spin" /> Processing…
      </span>
    )
  if (status === 'failed')
    return <span className="text-xs text-rose-600 font-medium">Failed</span>
  if (typeof score !== 'number') return <span className="text-xs text-gray-400">—</span>

  let cls = 'bg-red-100 text-red-800'
  if (score >= 80) cls = 'bg-emerald-100 text-emerald-800'
  else if (score >= 60) cls = 'bg-blue-100 text-blue-800'
  else if (score >= 40) cls = 'bg-amber-100 text-amber-800'

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${cls}`}>
      {score.toFixed(0)}
    </span>
  )
}

function LeadBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>
  const n = status.toLowerCase()
  if (n.includes('callback'))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-800">
        <PhoneCall className="w-3 h-3" /> Callback
      </span>
    )
  if (n.includes('not interested'))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 border border-rose-300 px-2 py-0.5 text-[11px] font-bold text-rose-800">
        Not Interested
      </span>
    )
  if (n.includes('no answer'))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-300 px-2 py-0.5 text-[11px] font-bold text-slate-700">
        No Answer
      </span>
    )
  if (n.includes('wrong'))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 border border-zinc-300 px-2 py-0.5 text-[11px] font-bold text-zinc-700">
        Wrong Number
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Interested
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function UploadRecordingPage() {
  const singleInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [mode, setMode] = useState<UploadMode>('single')
  const [files, setFiles] = useState<File[]>([])
  const [transcriptText, setTranscriptText] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)

  // Uploaded call IDs — used to poll evaluations
  const [uploadedCallIds, setUploadedCallIds] = useState<string[]>([])
  const [evaluations, setEvaluations] = useState<EvalResult[]>([])
  const [pollingActive, setPollingActive] = useState(false)

  // ── File selection ──────────────────────────────────────────────────────────

  const addAudioFiles = (incoming: FileList | File[]) => {
    const audioFiles = Array.from(incoming).filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|webm|aac|opus)$/i.test(f.name))
    if (audioFiles.length === 0) {
      toast.error('No audio files found. Supported: MP3, WAV, M4A, OGG, FLAC, WebM')
      return
    }
    if (mode === 'single') {
      setFiles([audioFiles[0]])
    } else {
      setFiles((prev) => {
        const names = new Set(prev.map((f) => f.name))
        return [...prev, ...audioFiles.filter((f) => !names.has(f.name))]
      })
    }
  }

  const handleFileDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setDragOver(false)
      addAudioFiles(e.dataTransfer.files)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode]
  )

  const removeFile = (name: string) => setFiles((prev) => prev.filter((f) => f.name !== name))

  // ── Upload ──────────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (mode !== 'transcript' && files.length === 0) {
      toast.error('Please select at least one audio file')
      return
    }
    if (mode === 'transcript' && !transcriptText.trim()) {
      toast.error('Please enter the transcript text')
      return
    }

    setUploadState('uploading')
    setUploadProgress(0)

    const progressInterval = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + Math.random() * 6 : p))
    }, 400)

    try {
      const formData = new FormData()
      if (mode === 'transcript') {
        formData.append('transcript', transcriptText)
      } else if (mode === 'single') {
        formData.append('recording', files[0])
      } else {
        for (const f of files) formData.append('recordings[]', f)
      }

      const res = await fetch('/api/ai-agents/upload-recording', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Upload failed')

      const ids: string[] = result.call_ids || (result.call_id ? [result.call_id] : [])
      setUploadedCallIds(ids)
      setUploadState('success')
      setPollingActive(true)

      if (result.failed > 0) {
        toast.success(`${result.processed} uploaded, ${result.failed} failed`)
      } else {
        toast.success(
          mode === 'campaign'
            ? `${result.processed} recording(s) uploaded! Evaluations processing…`
            : 'Recording uploaded! Evaluation is processing…'
        )
      }
    } catch (err) {
      clearInterval(progressInterval)
      setUploadState('error')
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  // ── Poll evaluations ────────────────────────────────────────────────────────

  const fetchEvaluations = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    try {
      const res = await fetch(
        `/api/ai-agents/upload-recording/batch-status?call_ids=${ids.join(',')}&_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) return
      const data = await res.json()
      const evals: EvalResult[] = data.evaluations || []
      setEvaluations(evals)

      // Stop polling when all are done (completed or failed)
      const allDone = evals.length > 0 && evals.every((e) => e.status !== 'processing')
      if (allDone) setPollingActive(false)
    } catch (err) {
      console.error('Error polling evaluations:', err)
    }
  }, [])

  useEffect(() => {
    if (!pollingActive || uploadedCallIds.length === 0) return
    void fetchEvaluations(uploadedCallIds)
    const interval = setInterval(() => void fetchEvaluations(uploadedCallIds), 8000)
    return () => clearInterval(interval)
  }, [pollingActive, uploadedCallIds, fetchEvaluations])

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setFiles([])
    setTranscriptText('')
    setUploadState('idle')
    setUploadProgress(0)
    setUploadedCallIds([])
    setEvaluations([])
    setPollingActive(false)
    if (singleInputRef.current) singleInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
  }

  const allDone = evaluations.length > 0 && evaluations.every((e) => e.status !== 'processing')
  const anyProcessing = evaluations.some((e) => e.status === 'processing')

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 animate-fade-in pb-16 max-w-3xl mx-auto">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 p-8 text-white shadow-xl relative overflow-hidden border border-purple-900/40">
        <div className="absolute right-0 top-0 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
              <UploadCloud className="h-3.5 w-3.5 text-purple-300" />
              Shriram PFA • Upload Recording
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Upload Call Recording</h1>
            <p className="text-sm text-slate-300 max-w-lg">
              Upload a recording and our AI will automatically transcribe it and run a full
              Shriram PFA evaluation — identical to live agent calls. Campaign mode lets you
              upload an entire folder at once.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center w-16 h-16 rounded-2xl bg-white/10 border border-white/15 shrink-0">
            <Mic className="w-8 h-8 text-purple-200" />
          </div>
        </div>

        {/* Steps */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { icon: UploadCloud, label: 'Upload audio', sub: 'MP3, WAV, M4A…' },
            { icon: Sparkles, label: 'AI transcribes', sub: 'Whisper + GPT-4o' },
            { icon: PhoneCall, label: 'Full evaluation', sub: 'Same as live calls' },
          ].map((step, i) => (
            <div key={i} className="rounded-2xl bg-white/10 p-3.5 border border-white/10 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600/50 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {i + 1}
              </div>
              <div>
                <p className="text-xs font-bold text-white">{step.label}</p>
                <p className="text-[11px] text-purple-200">{step.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Form (shown until success) ──────────────────────────────────────── */}
      {uploadState !== 'success' && (
        <div className="space-y-6">
          {/* Mode Toggle */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
              Upload Mode
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                ['single', 'Single Recording', FileAudio, 'Upload one call recording'], 
                ['campaign', 'Campaign / Folder', Folder, 'Upload a folder of recordings'],
                ['transcript', 'Transcript Only', FileText, 'Paste text transcript directly']
              ] as const).map(
                ([val, label, Icon, desc]) => (
                  <button
                    key={val}
                    onClick={() => { setMode(val); setFiles([]); setTranscriptText('') }}
                    className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      mode === val
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/30'
                    }`}
                  >
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${mode === val ? 'text-purple-600' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-bold ${mode === val ? 'text-purple-900' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Input Area */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              {mode === 'campaign' && <Folder className="w-5 h-5 text-purple-600" />}
              {mode === 'single' && <FileAudio className="w-5 h-5 text-purple-600" />}
              {mode === 'transcript' && <FileText className="w-5 h-5 text-purple-600" />}
              {mode === 'campaign' ? 'Select Folder / Drop Files' : mode === 'transcript' ? 'Paste Transcript Text' : 'Recording File'}
            </h2>

            {mode === 'transcript' ? (
              <textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste the raw text transcript of the call here... (e.g. Assistant: Hello, User: Hi)"
                className="w-full h-48 rounded-xl border border-gray-300 p-4 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 resize-y"
              />
            ) : files.length === 0 ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => mode === 'campaign' ? folderInputRef.current?.click() : singleInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                  dragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/40'
                }`}
              >
                {mode === 'campaign' ? (
                  <Folder className={`w-12 h-12 ${dragOver ? 'text-purple-500' : 'text-gray-400'}`} />
                ) : (
                  <UploadCloud className={`w-12 h-12 ${dragOver ? 'text-purple-500' : 'text-gray-400'}`} />
                )}
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-700">
                    {dragOver
                      ? 'Drop it here!'
                      : mode === 'campaign'
                      ? 'Click to select a folder'
                      : 'Drag & drop your recording'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {mode === 'campaign' ? 'or drag multiple audio files here' : 'or click to browse'}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">Supports MP3, WAV, M4A, OGG, FLAC, WebM · Max 50MB each</p>
                </div>

                {/* Single file input */}
                <input
                  ref={singleInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addAudioFiles(e.target.files) }}
                />
                {/* Folder input */}
                <input
                  ref={folderInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  // @ts-expect-error webkitdirectory is non-standard but widely supported
                  webkitdirectory=""
                  className="hidden"
                  onChange={(e) => { if (e.target.files) addAudioFiles(e.target.files) }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((f) => (
                  <div key={f.name} className="rounded-xl border border-purple-200 bg-purple-50/60 p-3 flex items-center gap-3">
                    <FileAudio className="w-5 h-5 text-purple-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{f.name}</p>
                      <p className="text-xs text-gray-500">{formatFileSize(f.size)}</p>
                    </div>
                    <button
                      onClick={() => removeFile(f.name)}
                      className="p-1.5 rounded-lg hover:bg-purple-200 text-purple-600 transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {mode === 'campaign' && (
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    className="w-full mt-1 text-xs font-semibold text-purple-600 hover:text-purple-700 underline underline-offset-2"
                  >
                    + Add more files
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploadState === 'uploading' && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-blue-900">Uploading & processing…</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Sending to Whisper for transcription, then GPT-4o evaluation
                  </p>
                </div>
                <span className="text-sm font-bold text-blue-700">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error */}
          {uploadState === 'error' && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-rose-900">Upload failed</p>
                <p className="text-xs text-rose-600">Please check the file(s) and try again.</p>
              </div>
              <button onClick={() => setUploadState('idle')} className="ml-auto text-xs font-bold text-rose-700 underline">
                Try again
              </button>
            </div>
          )}

          {/* Info */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Processing time</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Whisper transcription + GPT-4o evaluation typically takes{' '}
                <strong>1–3 minutes per recording</strong>. Results appear below automatically.
              </p>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleUpload}
            disabled={(mode !== 'transcript' && files.length === 0) || (mode === 'transcript' && transcriptText.length === 0) || uploadState === 'uploading'}
            className="w-full inline-flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-4 text-base font-bold shadow-lg hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadState === 'uploading' ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
            ) : mode === 'campaign' ? (
              <><Folder className="w-5 h-5" /> Upload {files.length > 0 ? `${files.length} Recording(s)` : 'Campaign Folder'} & Evaluate</>
            ) : mode === 'transcript' ? (
              <><FileText className="w-5 h-5" /> Submit Transcript & Evaluate</>
            ) : (
              <><UploadCloud className="w-5 h-5" /> Upload & Evaluate Recording</>
            )}
          </button>
        </div>
      )}

      {/* ── Success Banner ──────────────────────────────────────────────────── */}
      {uploadState === 'success' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center space-y-3 shadow-sm">
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-200 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-600" />
            </div>
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-emerald-900">
              {uploadedCallIds.length > 1
                ? `${uploadedCallIds.length} Recordings Uploaded!`
                : 'Upload Successful!'}
            </h2>
            <p className="text-sm text-emerald-700 mt-1">
              Evaluations are processing below. This usually takes 1–3 minutes per recording.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-emerald-200 text-emerald-700 px-5 py-2.5 text-sm font-bold hover:bg-emerald-50 transition-colors"
          >
            Upload Another
          </button>
        </div>
      )}

      {/* ── Inline Evaluations ──────────────────────────────────────────────── */}
      {uploadState === 'success' && uploadedCallIds.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Evaluation Results</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {anyProcessing ? 'Auto-refreshing every 8 seconds…' : 'All evaluations complete.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {anyProcessing && (
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 font-medium">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Live
                </span>
              )}
              {allDone && (
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Done
                </span>
              )}
            </div>
          </div>

          {evaluations.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto" />
              <p className="text-sm text-gray-500 mt-3">Waiting for evaluation to start…</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {evaluations.map((ev) => {
                const score = ev.overall_score ?? ev.score
                return (
                  <div key={ev.id} className="px-6 py-4 flex flex-wrap items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {ev.ai_calls?.customer_number || ev.call_id.substring(0, 16) + '…'}
                      </p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">
                        {ev.call_id.substring(0, 20)}…
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      {/* Eval status */}
                      {ev.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                          <Loader2 className="w-3 h-3 animate-spin" /> Processing
                        </span>
                      )}
                      {ev.status === 'failed' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                      {ev.status === 'completed' && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
                          Completed
                        </span>
                      )}

                      {/* Score */}
                      <ScoreBadge score={score} status={ev.status} />

                      {/* Lead status */}
                      <LeadBadge status={ev.lead_status} />

                      {/* View link */}
                      {ev.status === 'completed' && (
                        <Link
                          href={`/admin/ai-calling-agents/evaluations/${ev.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 ml-auto"
                        >
                          View Detail <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>

                    {/* Error message */}
                    {ev.status === 'failed' && ev.error_message && (
                      <p className="w-full text-xs text-rose-600 truncate">{ev.error_message}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, PhoneCall, RefreshCw, Send } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TranscriptTurn {
  role?: string
  speaker?: string
  content?: string
  text?: string
  message?: string
  timestamp?: string
}

interface C2CEvaluation {
  id: string
  status: 'processing' | 'completed' | 'failed'
  overall_score: number | null
  score: number | null
  call_summary: string | null
  overall_feedback: string | null
  error_message: string | null
}

interface C2CCall {
  id: string
  call_id: string
  from_number: string
  to_number: string
  did: string
  status: string
  duration: number
  recording_url: string | null
  transcript_status: string
  outcome: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  updated_at: string
  c2c_transcripts: Array<{
    summary: string | null
    call_outcome: string | null
    history: TranscriptTurn[]
    raw_text: string | null
  }> | null
  c2c_evaluations: C2CEvaluation[] | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActualDuration(call: C2CCall): number {
  if (call.duration && call.duration > 0) return call.duration
  if (call.started_at && call.ended_at) {
    const diff = Math.floor(
      (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000
    )
    if (diff > 0 && diff < 7200) return diff
  }
  if (call.created_at && call.ended_at) {
    const diff = Math.floor(
      (new Date(call.ended_at).getTime() - new Date(call.created_at).getTime()) / 1000
    )
    if (diff > 0 && diff < 7200) return diff
  }
  return 0
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '-'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    in_progress: 'bg-blue-100 text-blue-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function TranscriptBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

function ScoreBadge({ score, evalStatus }: { score: number | null; evalStatus?: string }) {
  if (evalStatus === 'processing') return <span className="text-xs text-blue-500 animate-pulse">Evaluating...</span>
  if (score === null || score === undefined) return <span className="text-sm text-gray-400">-</span>
  const color = score >= 80 ? 'bg-green-100 text-green-800' : score >= 60 ? 'bg-blue-100 text-blue-800' : score >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${color}`}>{score.toFixed(1)}</span>
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CallsTab({ isActive = true }: { isActive?: boolean }) {
  const [calls, setCalls] = useState<C2CCall[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCall, setSelectedCall] = useState<C2CCall | null>(null)
  const [initiatingCall, setInitiatingCall] = useState(false)

  // Form state
  const [fromNumber, setFromNumber] = useState('')
  const [toNumber, setToNumber] = useState('')
  const [did, setDid] = useState('919484956750')
  const [transcriptEnabled, setTranscriptEnabled] = useState(true)
  const [transcriptLanguage, setTranscriptLanguage] = useState('en')

  // Polling refs
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const pollingCallIdRef = useRef<string | null>(null)

  const fetchCalls = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true)
      const res = await fetch(`/api/c2c/calls?_t=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch calls')
      const result = await res.json()
      setCalls(result.calls || [])
    } catch (error) {
      console.error('[C2C Calls] Fetch error:', error)
      if (showLoading) toast.error('Failed to load calls')
    } finally {
      if (showLoading) setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void fetchCalls(true)
  }, [fetchCalls])

  // Auto-refresh every 15s when active
  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => void fetchCalls(), 15000)
    return () => clearInterval(id)
  }, [fetchCalls, isActive])

  // Transcript polling after call initiated
  const startTranscriptPolling = useCallback((callId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingCallIdRef.current = callId

    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/c2c/calls/${callId}/transcript-status`, { method: 'POST' })
        if (!res.ok) return
        const result = await res.json()

        if (result.transcript_status === 'ready' || result.call?.transcript_status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          toast.success('Transcript ready!')
          void fetchCalls()
          if (selectedCall?.call_id === callId) {
            setSelectedCall(result.call)
          }
        } else if (result.transcript_status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current)
          pollingRef.current = null
          toast.error('Transcript failed')
          void fetchCalls()
        }
      } catch {
        // Silently retry
      }
    }, 5000)
  }, [fetchCalls, selectedCall?.call_id])

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  const isValidPhone = (num: string) => {
    const clean = num.replace(/\D/g, '')
    return clean.length === 10 || (clean.length === 12 && clean.startsWith('91'))
  }

  const handleInitiateCall = async () => {
    if (!isValidPhone(fromNumber) || !isValidPhone(toNumber) || !did.trim()) {
      toast.error('Please enter a valid 10-digit number for both From and To numbers')
      return
    }

    try {
      setInitiatingCall(true)
      const res = await fetch('/api/c2c/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_number: fromNumber.trim(),
          to_number: toNumber.trim(),
          did: did.trim(),
          transcript: transcriptEnabled,
          transcript_language: transcriptLanguage,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        toast.error(result.error || 'Failed to initiate call')
        return
      }

      toast.success(`Call initiated! ID: ${result.call_id}`)
      setFromNumber('')
      setToNumber('')
      setDid('919484956750')
      await fetchCalls()

      // Start polling transcript
      startTranscriptPolling(result.call_id)
    } catch (error) {
      toast.error('Network error: Failed to initiate call')
      console.error('[C2C] Initiate error:', error)
    } finally {
      setInitiatingCall(false)
    }
  }

  if (selectedCall) {
    return (
      <CallDetail
        call={selectedCall}
        onBack={() => setSelectedCall(null)}
        onRetry={() => startTranscriptPolling(selectedCall.call_id)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Initiate Call Form */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-100 rounded-lg border border-blue-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <PhoneCall className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Start Call</h2>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Number (Caller)*</label>
              <input
                type="tel"
                value={fromNumber}
                onChange={(e) => setFromNumber(e.target.value)}
                placeholder="e.g. 919876543210"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={initiatingCall}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Number (Receiver)*</label>
              <input
                type="tel"
                value={toNumber}
                onChange={(e) => setToNumber(e.target.value)}
                placeholder="e.g. 917887766008"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={initiatingCall}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">DID*</label>
              <select
                value={did}
                onChange={(e) => setDid(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                disabled={initiatingCall}
              >
                <option value="">-- Select DID --</option>
                <option value="919484956750">919484956750 (Default)</option>
                <option value="919429390246">919429390246</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Transcript Language</label>
              <select
                value={transcriptLanguage}
                onChange={(e) => setTranscriptLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={initiatingCall}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
                <option value="gu">Gujarati</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
              </select>
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="transcript"
                checked={transcriptEnabled}
                onChange={(e) => setTranscriptEnabled(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
                disabled={initiatingCall}
              />
              <label htmlFor="transcript" className="text-sm font-medium text-gray-700">Enable Transcript</label>
            </div>

            <button
              onClick={handleInitiateCall}
              disabled={initiatingCall || !isValidPhone(fromNumber) || !isValidPhone(toNumber) || !did.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {initiatingCall ? 'Initiating...' : 'Start Call'}
            </button>
          </div>
        </div>
      </div>

      {/* Call History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Call History</h2>
          <button
            onClick={() => { setRefreshing(true); void fetchCalls() }}
            disabled={refreshing}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading calls...</div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12">
            <PhoneCall className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No calls yet. Start your first call above!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Call ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">From</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">To</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Duration</th>

                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Score</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Created</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((call) => {
                  const evaluation = call.c2c_evaluations?.[0]
                  return (
                    <tr
                      key={call.id}
                      className="hover:bg-gray-50 cursor-pointer transition"
                      onClick={() => setSelectedCall(call)}
                    >
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">{call.call_id.substring(0, 12)}...</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{call.from_number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{call.to_number}</td>
                      <td className="px-6 py-4"><StatusBadge status={call.status} /></td>
                      <td className="px-6 py-4 text-sm text-gray-600">{formatDuration(getActualDuration(call))}</td>

                      <td className="px-6 py-4">
                        <ScoreBadge
                          score={evaluation?.overall_score ?? evaluation?.score ?? null}
                          evalStatus={evaluation?.status}
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{new Date(call.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4"><ChevronRight className="w-4 h-4 text-gray-400" /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Call Detail View ─────────────────────────────────────────────────────────

function CallDetail({ call: initialCall, onBack, onRetry }: { call: C2CCall; onBack: () => void; onRetry: () => void }) {
  const [call, setCall] = useState<C2CCall>(initialCall)
  const transcript = call.c2c_transcripts?.[0]
  const evaluation = call.c2c_evaluations?.[0]

  // Determine if we need to keep polling
  const needsPolling =
    call.transcript_status === 'pending' ||
    call.transcript_status === 'in_progress' ||
    (call.transcript_status === 'completed' && (!evaluation || evaluation.status === 'processing'))

  // Fetch latest data immediately on mount, then poll every 5s while still in progress
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const res = await fetch('/api/c2c/calls', { cache: 'no-store' })
        if (!res.ok) return
        const result = await res.json()
        const updated = (result.calls as C2CCall[])?.find((c) => c.call_id === call.call_id)
        if (updated) setCall(updated)
      } catch {
        // Silently retry
      }
    }

    // Immediate fetch when detail view opens
    void fetchLatest()

    // Then keep polling every 5s only if still pending
    const id = setInterval(async () => {
      const ev = call.c2c_evaluations?.[0]
      const stillPending =
        call.transcript_status === 'pending' ||
        call.transcript_status === 'in_progress' ||
        (call.transcript_status === 'completed' && (!ev || ev.status === 'processing'))
      if (!stillPending) {
        clearInterval(id)
        return
      }
      await fetchLatest()
    }, 5000)

    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCall.call_id])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2">
          ← Back to Calls
        </button>
        {needsPolling && (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Auto-updating...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Call Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <DetailItem label="Call ID" value={call.call_id} />
              <DetailItem label="Status" value={<StatusBadge status={call.status} />} />
              <DetailItem label="From Number" value={call.from_number} />
              <DetailItem label="To Number" value={call.to_number} />
              <DetailItem label="DID" value={call.did} />
              <DetailItem label="Duration" value={formatDuration(getActualDuration(call))} />
              <DetailItem label="Transcript" value={<TranscriptBadge status={call.transcript_status} />} />
              <DetailItem label="Created" value={new Date(call.created_at).toLocaleString()} />
              {call.outcome && <DetailItem label="Outcome" value={call.outcome} className="col-span-2" />}
            </div>
          </div>

          {/* Transcript */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Transcript</h2>
              {call.transcript_status !== 'completed' && (
                <button
                  onClick={onRetry}
                  className="px-3 py-1.5 text-sm bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg flex items-center gap-2"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Poll Status
                </button>
              )}
            </div>

            {call.transcript_status === 'pending' || call.transcript_status === 'in_progress' ? (
              <div className="text-center py-8 text-yellow-600">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-60" />
                <p className="font-medium">Transcript is being processed...</p>
                <p className="text-sm text-gray-500 mt-1">This page will update automatically</p>
              </div>
            ) : call.transcript_status === 'failed' ? (
              <div className="text-center py-8 text-red-500">Transcript failed to process.</div>
            ) : transcript ? (
              <div className="space-y-4">
                {transcript.summary && (
                  <div className="bg-blue-50 rounded-lg p-4">
                    <p className="text-xs font-medium text-blue-700 mb-1">Summary</p>
                    <p className="text-sm text-blue-900">{transcript.summary}</p>
                  </div>
                )}
                {transcript.history && transcript.history.length > 0 ? (
                  (() => {
                    const hasSpeakers = transcript.history.some((t) => {
                      const l = (t.role || t.speaker || '').toLowerCase()
                      return l.includes('speaker 0') || l.includes('speaker 1')
                    })
                    if (hasSpeakers) {
                      return (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {transcript.history.map((turn, idx) => {
                            const content = turn.content || turn.text || turn.message || ''
                            const isSpk0 = (turn.role || turn.speaker || '').toLowerCase().includes('speaker 0')
                            const label = isSpk0 ? 'Caller' : 'Receiver'
                            return (
                              <div key={idx} className={`flex gap-3 ${isSpk0 ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-sm px-4 py-2 rounded-xl text-sm ${isSpk0 ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
                                  <span className="text-xs font-semibold opacity-60 block mb-0.5">{label}</span>
                                  {content}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }
                    const text = transcript.raw_text || transcript.history[0]?.content || ''
                    const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
                    return (
                      <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                        {sentences.length > 1 ? (
                          <div className="space-y-2">
                            {sentences.map((s, i) => (
                              <p key={i} className="text-xs text-gray-700 leading-relaxed">{s}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-700 leading-relaxed">{text}</p>
                        )}
                      </div>
                    )
                  })()
                ) : transcript.raw_text ? (
                  (() => {
                    const sentences = transcript.raw_text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)
                    return (
                      <div className="bg-gray-50 rounded-lg p-4 max-h-80 overflow-y-auto">
                        {sentences.length > 1 ? (
                          <div className="space-y-2">
                            {sentences.map((s, i) => (
                              <p key={i} className="text-xs text-gray-700 leading-relaxed">{s}</p>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-700 leading-relaxed">{transcript.raw_text}</p>
                        )}
                      </div>
                    )
                  })()
                ) : null}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">No transcript available</div>
            )}
          </div>
        </div>

        {/* Evaluation */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Evaluation</h2>
            {!evaluation ? (
              <div className="text-center py-4">
                {call.transcript_status === 'completed' ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                    <p className="text-sm text-blue-600">Evaluation starting...</p>
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Available after transcript is ready</p>
                )}
              </div>
            ) : evaluation.status === 'processing' ? (
              <div className="text-center py-4">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-400" />
                <p className="text-sm text-blue-600">Evaluating call...</p>
                <p className="text-xs text-gray-400 mt-1">This will update automatically</p>
              </div>
            ) : evaluation.status === 'failed' ? (
              <p className="text-red-600 text-sm">{evaluation.error_message || 'Evaluation failed'}</p>
            ) : (
              <div className="space-y-4">
                <div className="text-center">
                  <ScoreBadge score={evaluation.overall_score ?? evaluation.score} />
                  <p className="text-xs text-gray-500 mt-1">Overall Score</p>
                </div>
                {evaluation.overall_feedback && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Feedback</p>
                    <p className="text-sm text-gray-700">{evaluation.overall_feedback}</p>
                  </div>
                )}
                {evaluation.call_summary && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">Summary</p>
                    <p className="text-sm text-gray-700">{evaluation.call_summary}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Recording */}
          {call.recording_url && (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Recording</h2>
              <audio controls className="w-full">
                <source src={call.recording_url} />
              </audio>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailItem({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  )
}

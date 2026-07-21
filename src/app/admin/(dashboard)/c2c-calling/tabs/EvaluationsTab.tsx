'use client'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

interface TranscriptTurn {
  role?: string
  speaker?: string
  content?: string
  text?: string
  message?: string
}

interface C2CTranscript {
  summary: string | null
  call_outcome: string | null
  history: TranscriptTurn[]
  raw_text: string | null
}

interface C2CEvaluation {
  id: string
  call_id: string
  status: 'processing' | 'completed' | 'failed'
  score: number | null
  overall_score: number | null
  overall_feedback: string | null
  call_summary: string | null
  customer_intent: string | null
  main_discussion_points: string[]
  strengths: string[]
  areas_for_improvement: string[]
  next_best_actions: string[]
  issues: string[]
  error_message: string | null
  processed_at: string | null
  transcript_text: string | null
  created_at: string
  c2c_calls: {
    call_id: string
    from_number: string
    to_number: string
    status: string
    duration: number
    created_at: string
    c2c_transcripts: C2CTranscript[] | null
  }
}

export default function EvaluationsTab({ isActive = true }: { isActive?: boolean }) {
  const [evaluations, setEvaluations] = useState<C2CEvaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [reEvaluatingId, setReEvaluatingId] = useState<string | null>(null)

  const fetchEvaluations = useCallback(async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter) params.append('status', statusFilter)
      params.append('_t', Date.now().toString())

      const res = await fetch(`/api/c2c/evaluations?${params}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to fetch evaluations')
      const result = await res.json()
      setEvaluations(result.evaluations || [])
    } catch (error) {
      console.error('[C2C Evaluations] Error:', error)
      if (showLoading) toast.error('Failed to load evaluations')
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void fetchEvaluations(true)
  }, [fetchEvaluations])

  useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => void fetchEvaluations(), 15000)
    return () => clearInterval(id)
  }, [fetchEvaluations, isActive])

  const handleReevaluate = async (ev: C2CEvaluation, e: React.MouseEvent) => {
    e.stopPropagation()
    if (reEvaluatingId) return
    setReEvaluatingId(ev.call_id)
    try {
      const res = await fetch(`/api/c2c/evaluations/${ev.call_id}/re-evaluate`, { method: 'POST' })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed')
      toast.success('Re-evaluation started! Refreshing in a moment...')
      setTimeout(() => void fetchEvaluations(), 3000)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to start re-evaluation')
    } finally {
      setReEvaluatingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4 items-center flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Status</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <span className="text-sm text-gray-500">{evaluations.length} evaluation(s)</span>
        <button
          onClick={() => void fetchEvaluations(true)}
          className="ml-auto px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center gap-2 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading evaluations...</div>
      ) : evaluations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No evaluations found.</p>
          <p className="text-sm mt-1">Evaluations are auto-generated once a transcript is ready.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Call ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">From → To</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Summary</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {evaluations.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-6 py-4">
                    <Link
                      href={`/admin/c2c-calling/evaluations/${ev.call_id}`}
                      className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {ev.call_id.substring(0, 12)}...
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <div>{ev.c2c_calls?.from_number || '-'}</div>
                    <div className="text-gray-400">→ {ev.c2c_calls?.to_number || '-'}</div>
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={ev.status} /></td>
                  <td className="px-6 py-4"><ScoreBadge score={ev.overall_score ?? ev.score} status={ev.status} /></td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{ev.call_summary || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{new Date(ev.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleReevaluate(ev, e)}
                        disabled={reEvaluatingId === ev.call_id || ev.status === 'processing'}
                        title="Re-evaluate this call"
                        className="px-3 py-1.5 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {reEvaluatingId === ev.call_id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Re-evaluate
                      </button>
                      <Link
                        href={`/admin/c2c-calling/evaluations/${ev.call_id}`}
                        className="p-1 hover:bg-gray-100 rounded-lg transition"
                        title="View details"
                      >
                        <ExternalLink className="w-4 h-4 text-gray-400" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: C2CEvaluation['status'] }) {
  if (status === 'processing') return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
      <Loader2 className="h-3 w-3 animate-spin" />Processing
    </span>
  )
  if (status === 'failed') return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
      <AlertCircle className="h-3 w-3" />Failed
    </span>
  )
  return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">Completed</span>
}

function ScoreBadge({ score, status }: { score: number | null; status: C2CEvaluation['status'] }) {
  if (status === 'processing') return <span className="text-sm text-blue-600">Processing...</span>
  if (status === 'failed') return <span className="text-sm text-red-600">N/A</span>
  if (typeof score !== 'number') return <span className="text-sm text-gray-400">-</span>
  const color = score >= 80 ? 'bg-green-100 text-green-800' : score >= 60 ? 'bg-blue-100 text-blue-800' : score >= 40 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
  return <span className={`px-2 py-1 rounded-full text-sm font-bold ${color}`}>{score.toFixed(1)}</span>
}

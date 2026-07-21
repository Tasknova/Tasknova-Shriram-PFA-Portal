'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { useAiCallingRealtime } from '@/hooks/useAiCallingRealtime'

interface Evaluation {
  id: string
  call_id: string
  status: 'processing' | 'completed' | 'failed'
  score: number | null
  overall_score: number | null
  overall_feedback?: string | null
  issues: string[]
  suggestions: string[]
  error_message?: string | null
  processed_at?: string | null
  created_at: string
  ai_calls: {
    call_id: string
    agent_id: string
    customer_number: string | null
    status: string
    call_type: string
    duration: number
    created_at: string
    outcome?: string | null
    ai_agents: { name: string }
  }
}

export default function EvaluationsTab({ isActive = true }: { isActive?: boolean }) {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    min_score: '',
    max_score: '',
    agent_id: '',
    status: '',
  })
  const [agents, setAgents] = useState<Array<{ agent_id: string; name: string }>>([])
  const [reEvaluating, setReEvaluating] = useState(false)

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/ai-agents/index')
      if (!response.ok) throw new Error('Failed to fetch agents')
      const result = await response.json()
      setAgents(result.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    }
  }

  const fetchEvaluations = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false
    try {
      if (showLoading) {
        setLoading(true)
      }
      const params = new URLSearchParams()
      if (filters.min_score) params.append('min_score', filters.min_score)
      if (filters.max_score) params.append('max_score', filters.max_score)
      if (filters.agent_id) params.append('agent_id', filters.agent_id)
      if (filters.status) params.append('status', filters.status)
      params.append('_t', Date.now().toString())

      const response = await fetch(`/api/ai-agents/evaluations?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch evaluations')
      const result = await response.json()
      setEvaluations(result.evaluations || [])
    } catch (error) {
      console.error('Error fetching evaluations:', error)
      if (showLoading) {
        toast.error('Failed to load evaluations')
      }
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [filters.agent_id, filters.max_score, filters.min_score, filters.status])

  useAiCallingRealtime(() => {
    void fetchEvaluations()
  }, isActive)

  useEffect(() => {
    void fetchAgents()
  }, [])

  useEffect(() => {
    void fetchEvaluations({ showLoading: true })
  }, [fetchEvaluations])

  useEffect(() => {
    if (!isActive) {
      return
    }

    const intervalId = window.setInterval(() => {
      void fetchEvaluations()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [fetchEvaluations, isActive])

  const reEvaluateAll = async () => {
    try {
      setReEvaluating(true)
      const response = await fetch('/api/ai-agents/evaluations/re-evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to trigger evaluations')
      toast.success(`Triggered ${result.triggered} evaluations (${result.skipped} already completed)`)
      void fetchEvaluations()
    } catch (error) {
      console.error('Re-evaluate error:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to trigger evaluations')
    } finally {
      setReEvaluating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4 flex-wrap flex-1">
          <input
            type="number"
            min="0"
            max="100"
            placeholder="Min Score"
            value={filters.min_score}
            onChange={(e) => setFilters({ ...filters, min_score: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
          />

          <input
            type="number"
            min="0"
            max="100"
            placeholder="Max Score"
            value={filters.max_score}
            onChange={(e) => setFilters({ ...filters, max_score: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
          />

          <select
            value={filters.agent_id}
            onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Agents</option>
            {agents.map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.name}
              </option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Status</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <button
          onClick={reEvaluateAll}
          disabled={reEvaluating}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium ml-4 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${reEvaluating ? 'animate-spin' : ''}`} />
          {reEvaluating ? 'Evaluating...' : 'Re-evaluate All'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading evaluations...</div>
      ) : evaluations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No evaluations found with current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Call</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Overall Score</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {evaluations.map((evaluation) => (
                <tr key={evaluation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-mono text-gray-900">{evaluation.call_id.substring(0, 12)}...</div>
                    <div className="text-xs text-gray-500">{evaluation.ai_calls?.call_type || 'unknown'}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {evaluation.ai_calls?.customer_number || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(evaluation.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={evaluation.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{evaluation.ai_calls?.ai_agents?.name || '-'}</td>
                  <td className="px-6 py-4">
                    <ScoreBadge score={evaluation.overall_score ?? evaluation.score} status={evaluation.status} />
                    {evaluation.status === 'failed' && evaluation.error_message ? (
                      <p className="mt-1 max-w-xs truncate text-xs text-red-600">{evaluation.error_message}</p>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/ai-calling-agents/evaluations/${evaluation.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700"
                    >
                      View <ChevronRight className="w-4 h-4" />
                    </Link>
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

function StatusBadge({ status }: { status: Evaluation['status'] }) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
        <AlertCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
      Completed
    </span>
  )
}

function ScoreBadge({ score, status }: { score: number | null; status: Evaluation['status'] }) {
  if (status === 'processing') {
    return <span className="text-sm text-blue-700">In progress...</span>
  }

  if (status === 'failed') {
    return <span className="text-sm text-red-700">Unavailable</span>
  }

  if (typeof score !== 'number') {
    return <span className="text-sm text-gray-500">-</span>
  }

  let bgColor = 'bg-red-100 text-red-800'
  if (score >= 80) bgColor = 'bg-green-100 text-green-800'
  else if (score >= 60) bgColor = 'bg-blue-100 text-blue-800'
  else if (score >= 40) bgColor = 'bg-yellow-100 text-yellow-800'

  return (
    <span className={`px-2 py-1 rounded-full text-sm font-bold ${bgColor}`}>
      {score.toFixed(1)}
    </span>
  )
}

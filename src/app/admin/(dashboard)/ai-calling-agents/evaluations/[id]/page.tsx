'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Phone, Play } from 'lucide-react'
import toast from 'react-hot-toast'
import { AICallEvaluation } from '@/types'
import { formatDateTime } from '@/lib/utils'
import { useAiCallingRealtime } from '@/hooks/useAiCallingRealtime'
import { formatTranscriptIntoTurns } from '@/lib/transcriptFormatter'

interface EvaluationDetail extends AICallEvaluation {
  ai_calls?: {
    call_id: string
    agent_id: string
    status: string
    call_type: string
    duration: number
    transcript_status: string
    outcome: string | null
    customer_number: string | null
    agent_number: string | null
    did: string | null
    created_at: string
    updated_at?: string | null
    started_at?: string | null
    ended_at?: string | null
    recording_url?: string | null
    agent_config?: Record<string, string> | null
    ai_agents?: { agent_id: string; name: string }
    ai_transcripts?: Array<{
      id: string
      summary?: string | null
      call_outcome?: string | null
      history?: unknown[]
      transcript_id?: string | null
      raw_text?: string | null
    }>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toPerformanceEntries(value: unknown): Array<{
  label: string
  score: number | null
  feedback: string
}> {
  if (!isRecord(value)) {
    return []
  }

  return Object.entries(value).map(([key, entry]) => {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
    const record = isRecord(entry) ? entry : {}
    const score = typeof record.score === 'number' ? record.score : Number(record.score)

    return {
      label,
      score: Number.isFinite(score) ? score : null,
      feedback: typeof record.feedback === 'string' ? record.feedback : '',
    }
  })
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => String(item)).filter(Boolean)
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) {
    return '-'
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}

function statusPill(status: EvaluationDetail['status']) {
  if (status === 'processing') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
        <Loader2 className="h-4 w-4 animate-spin" />
        Processing
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
        <AlertCircle className="h-4 w-4" />
        Failed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
      <CheckCircle2 className="h-4 w-4" />
      Completed
    </span>
  )
}

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>()
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchEvaluation = useCallback(async () => {
    try {
      const response = await fetch(`/api/ai-agents/evaluations/${params.id}?_t=${Date.now()}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to load evaluation details')
      }

      setEvaluation(result.evaluation)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load evaluation details')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (params.id) {
      void fetchEvaluation()
    }
  }, [fetchEvaluation, params.id])

  useAiCallingRealtime(() => {
    void fetchEvaluation()
  }, evaluation?.status === 'processing')

  useEffect(() => {
    if (evaluation?.status !== 'processing') {
      return
    }

    const intervalId = window.setInterval(() => {
      void fetchEvaluation()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [evaluation?.status, fetchEvaluation])

  const performanceEntries = useMemo(
    () => toPerformanceEntries(evaluation?.agent_performance),
    [evaluation?.agent_performance]
  )

  if (loading) {
    return <div className="py-12 text-center">Loading evaluation...</div>
  }

  if (!evaluation) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/ai-calling-agents"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI Calling Agents
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <p className="text-gray-700">Evaluation not found.</p>
        </div>
      </div>
    )
  }

  const transcriptText =
    evaluation.transcript_text ||
    evaluation.ai_calls?.ai_transcripts?.[0]?.raw_text ||
    'Transcript is not available yet.'

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/admin/ai-calling-agents"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI Calling Agents
        </Link>
      </div>

      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-800 p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-100">
              <Phone className="h-3.5 w-3.5" />
              AI Call Evaluation
            </div>
            <h1 className="text-3xl font-bold">Evaluation Details</h1>
            <p className="mt-2 text-sm text-slate-200">
              Call {evaluation.call_id.substring(0, 12)}... with {evaluation.ai_calls?.customer_number || 'unknown customer'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            {statusPill(evaluation.status)}
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Overall Score</p>
              <p className="text-4xl font-bold">
                {typeof evaluation.overall_score === 'number'
                  ? evaluation.overall_score.toFixed(0)
                  : typeof evaluation.score === 'number'
                    ? evaluation.score.toFixed(0)
                    : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard label="Customer" value={evaluation.ai_calls?.customer_number || '-'} />
          <MetricCard label="Date & Time" value={formatDateTime(evaluation.created_at)} />
          <MetricCard label="Duration" value={formatDuration(evaluation.ai_calls?.duration)} />
          <MetricCard label="Call Status" value={evaluation.ai_calls?.status || '-'} />
        </div>
      </div>

      {evaluation.ai_calls?.recording_url && evaluation.ai_calls.recording_url !== 'pending' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100">
              <Play className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Call Recording</h2>
              <p className="text-sm text-gray-500">Listen to the full call recording</p>
            </div>
          </div>
          <audio controls className="w-full">
            <source src={evaluation.ai_calls.recording_url} type="audio/mpeg" />
            <source src={evaluation.ai_calls.recording_url} type="audio/ogg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {evaluation.status === 'failed' && evaluation.error_message ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {evaluation.error_message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <SectionCard title="Transcript">
            {(() => {
              const formattedTurns = formatTranscriptIntoTurns(transcriptText)
              if (formattedTurns.length > 0) {
                return (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                    {formattedTurns.map((turn, idx) => {
                      const isSpk0 = turn.speaker === 0
                      const label = isSpk0 ? 'Assistant' : 'User'
                      return (
                        <p key={idx} className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                          <span className="font-semibold text-gray-900">{label}:</span> {turn.lines.join(' ')}
                        </p>
                      )
                    })}
                  </div>
                )
              }
              // Fallback
              return (
                <div className="max-h-[600px] overflow-y-auto pr-2">
                  <p className="whitespace-pre-wrap text-sm leading-7 text-gray-700">{transcriptText}</p>
                </div>
              )
            })()}
          </SectionCard>

          <SectionCard title="AI Evaluation">
            <div className="space-y-5">
              <TextBlock label="Call Summary" value={evaluation.call_summary} />
              <TextBlock label="Customer Intent" value={evaluation.customer_intent} />

              {/* ── Lead Status Section ─────────────────────────────────── */}
              {evaluation.lead_status && (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Lead Status</p>
                  <div className="flex flex-wrap gap-3 items-start">
                    <LeadStatusBadge status={evaluation.lead_status} />
                    {evaluation.meeting_datetime && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">Meeting Date &amp; Time</span>
                        <span className="text-sm font-medium text-gray-800">{evaluation.meeting_datetime}</span>
                      </div>
                    )}
                    {evaluation.meeting_location && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 uppercase tracking-wide">Address / Location</span>
                        <span className="text-sm font-medium text-gray-800">{evaluation.meeting_location}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <ListBlock label="Main Discussion Points" items={toStringArray(evaluation.main_discussion_points)} />
              <TextBlock label="Call Outcome" value={evaluation.call_outcome || evaluation.ai_calls?.outcome || null} />
              <ListBlock label="What Went Well" items={toStringArray(evaluation.strengths)} />
              <ListBlock label="Areas for Improvement" items={toStringArray(evaluation.areas_for_improvement)} />
              <ListBlock label="Next Best Actions" items={toStringArray(evaluation.next_best_actions)} />
              <TextBlock label="Overall Feedback" value={evaluation.overall_feedback} />
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Scores">
            <div className="space-y-3">
              <ScoreRow label="Overall Call Score" value={evaluation.overall_score ?? evaluation.score} />
              <ScoreRow label="Agent Performance Score" value={evaluation.agent_performance_score} />
              <ScoreRow label="Customer Engagement Score" value={evaluation.customer_engagement_score} />
              <ScoreRow label="Communication Score" value={evaluation.communication_score} />
              <ScoreRow label="Qualification Score" value={evaluation.qualification_score} />
            </div>
          </SectionCard>

          <SectionCard title="Agent Performance">
            <div className="space-y-4">
              {performanceEntries.length === 0 ? (
                <p className="text-sm text-gray-500">Agent performance details will appear here when evaluation completes.</p>
              ) : (
                performanceEntries.map((entry) => (
                  <div key={entry.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <p className="text-sm font-semibold text-gray-900">{entry.label}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm">
                        {entry.score ?? '-'}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-gray-600">{entry.feedback || 'No feedback provided.'}</p>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-cyan-100">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

function TextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm leading-7 text-gray-700">{value || '-'}</p>
    </div>
  )
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">-</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={`${label}-${index}`} className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <span className="text-sm font-semibold text-gray-900">
        {typeof value === 'number' ? value.toFixed(0) : '-'}
      </span>
    </div>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; dot: string }> = {
    'Interested':          { bg: 'bg-green-50 border-green-200',   text: 'text-green-700',  dot: 'bg-green-500'  },
    'Not Interested':      { bg: 'bg-red-50 border-red-200',       text: 'text-red-700',    dot: 'bg-red-500'    },
    'Follow-up Required':  { bg: 'bg-yellow-50 border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500' },
    'Callback Requested':  { bg: 'bg-blue-50 border-blue-200',     text: 'text-blue-700',   dot: 'bg-blue-500'   },
  }
  const style = map[status] ?? { bg: 'bg-gray-50 border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' }
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${style.bg} ${style.text}`}>
      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
      {status}
    </span>
  )
}

'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  Info,
  ListChecks,
  Loader2,
  MessageSquare,
  Phone,
  Play,
  User,
  MessageCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDateTime } from '@/lib/utils'
import { formatTranscriptIntoTurns } from '@/lib/transcriptFormatter'

interface TranscriptTurn {
  role?: string
  speaker?: string
  content?: string
  text?: string
  message?: string
}

interface C2CCall {
  call_id: string
  from_number: string | null
  to_number: string | null
  status: string | null
  duration: number | null
  recording_url: string | null
  created_at: string | null
  outcome: string | null
  transcript_status: string | null
  c2c_transcripts: C2CTranscript[] | null
}

interface C2CTranscript {
  summary: string | null
  call_outcome: string | null
  history: TranscriptTurn[] | null
  raw_text: string | null
}

interface ScoreDetail {
  score: number
  explanation: string
}

interface AnalysisData {
  call_summary?: string
  conversation_objective?: string
  conversation_outcome?: string
  main_discussion_points?: string[]
  what_went_well?: string[]
  areas_for_improvement?: string[]
  next_best_actions?: string[]
  overall_feedback?: string
  key_insights?: string[]
  communication_highlights?: string[]
  important_decisions?: string[]
  action_items?: string[]
  communication_analysis?: Record<string, ScoreDetail>
  c2c_scores?: Record<string, number>
  scores?: Record<string, number>
  agent_performance?: Record<string, ScoreDetail>
}

interface EvaluationDetail {
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
  analysis_json: AnalysisData | null
  communication_score: number | null
  agent_performance_score: number | null
  customer_engagement_score: number | null
  created_at: string
  c2c_calls: C2CCall | null
}

type TabId = 'overview' | 'transcript' | 'analysis' | 'scores' | 'info'

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Info },
  { id: 'transcript', label: 'Transcript', icon: MessageSquare },
  { id: 'analysis', label: 'AI Analysis', icon: BarChart3 },
  { id: 'scores', label: 'Scores', icon: ListChecks },
  { id: 'info', label: 'Call Information', icon: FileText },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function safeArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean)
  return []
}

function safeAnalysis(value: unknown): AnalysisData {
  if (isRecord(value)) return value as AnalysisData
  return {}
}

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-gray-400'
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function getScoreBg(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-200'
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getScoreBadgeBg(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-100 text-gray-600'
  if (score >= 80) return 'bg-green-100 text-green-800'
  if (score >= 60) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '-'
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
}

export default function C2CEvaluationDetailPage() {
  const params = useParams<{ id: string }>()
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const fetchEvaluation = useCallback(async () => {
    try {
      const response = await fetch(`/api/c2c/evaluations/${params.id}?_t=${Date.now()}`, {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to load evaluation')
      }
      setEvaluation(result.evaluation)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load evaluation')
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    if (params.id) {
      void fetchEvaluation()
    }
  }, [fetchEvaluation, params.id])

  useEffect(() => {
    if (evaluation?.status !== 'processing') return
    const intervalId = window.setInterval(() => void fetchEvaluation(), 15000)
    return () => window.clearInterval(intervalId)
  }, [evaluation?.status, fetchEvaluation])

  const analysis = useMemo(() => safeAnalysis(evaluation?.analysis_json), [evaluation?.analysis_json])

  const overallScore = evaluation?.overall_score ?? evaluation?.score

  const communicationAnalysis = useMemo(() => {
    const ca = analysis.communication_analysis
    if (ca && isRecord(ca) && Object.keys(ca).length > 0) {
      return Object.entries(ca).map(([key, val]) => {
        const detail = isRecord(val) ? val as ScoreDetail : { score: 0, explanation: '' }
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        return { key, label, score: typeof detail.score === 'number' ? detail.score : 0, explanation: detail.explanation || '' }
      })
    }

    const ap = analysis.agent_performance
    if (ap && isRecord(ap) && Object.keys(ap).length > 0) {
      const LABEL_MAP: Record<string, string> = {
        tone: 'Tone',
        clarity: 'Clarity',
        listening_ability: 'Listening Ability',
        confidence: 'Confidence',
        conversation_flow: 'Conversation Flow',
        professionalism: 'Professionalism',
        question_quality: 'Question Quality',
        closing_quality: 'Closing Quality',
        objection_handling: 'Resolution Effectiveness',
        accuracy: 'Response Quality',
      }
      const seen = new Set<string>()
      const result: { key: string; label: string; score: number; explanation: string }[] = []
      for (const [key, val] of Object.entries(ap)) {
        const label = LABEL_MAP[key]
        if (!label || seen.has(label)) continue
        seen.add(label)
        const detail = isRecord(val) ? val as Record<string, unknown> : {}
        const score = typeof detail.score === 'number' ? detail.score : 0
        const explanation = typeof detail.explanation === 'string' ? detail.explanation : (typeof detail.feedback === 'string' ? detail.feedback : '')
        result.push({ key, label, score, explanation })
      }
      return result
    }

    return []
  }, [analysis])

  const c2cScores = useMemo(() => {
    const scores = analysis.c2c_scores
    if (scores && isRecord(scores) && Object.keys(scores).length > 0) {
      const LABEL_MAP: Record<string, string> = {
        overall_conversation_score: 'Overall Conversation Score',
        communication_score: 'Communication Score',
        listening_score: 'Listening Score',
        clarity_score: 'Clarity Score',
        conversation_flow_score: 'Conversation Flow Score',
        engagement_score: 'Engagement Score',
        professionalism_score: 'Professionalism Score',
        confidence_score: 'Confidence Score',
        resolution_effectiveness_score: 'Resolution Effectiveness Score',
      }
      return Object.entries(scores).map(([key, val]) => {
        const label = LABEL_MAP[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const score = typeof val === 'number' ? val : 0
        return { key, label, score }
      })
    }

    const fallback: { key: string; label: string; score: number }[] = []
    const os = evaluation?.overall_score ?? evaluation?.score
    if (os != null) fallback.push({ key: 'overall_conversation_score', label: 'Overall Conversation Score', score: os })
    if (evaluation?.communication_score != null) fallback.push({ key: 'communication_score', label: 'Communication Score', score: evaluation.communication_score })
    if (evaluation?.agent_performance_score != null) fallback.push({ key: 'professionalism_score', label: 'Professionalism Score', score: evaluation.agent_performance_score })
    if (evaluation?.customer_engagement_score != null) fallback.push({ key: 'engagement_score', label: 'Engagement Score', score: evaluation.customer_engagement_score })
    return fallback
  }, [analysis, evaluation])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary-600" />
          <p className="mt-4 text-gray-600 text-sm">Loading evaluation...</p>
        </div>
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/c2c-calling"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to C2C Calling
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="h-10 w-10 text-gray-400" />
            <p className="text-gray-700 font-medium">Evaluation not found</p>
            <p className="text-sm text-gray-500">The evaluation you are looking for does not exist or has been removed.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/admin/c2c-calling"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to C2C Calling
        </Link>
      </div>

      {/* Header Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-800 p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-100">
              <Phone className="h-3.5 w-3.5" />
              C2C Call Evaluation
            </div>
            <h1 className="text-3xl font-bold">Evaluation Details</h1>
            <p className="mt-2 text-sm text-slate-200">
              Call {evaluation.call_id.substring(0, 12)}... between{' '}
              {evaluation.c2c_calls?.from_number || 'Caller'} and{' '}
              {evaluation.c2c_calls?.to_number || 'Receiver'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusPill status={evaluation.status} />
            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-100">Overall Score</p>
              <p className={`text-4xl font-bold ${overallScore != null ? 'text-white' : 'text-slate-300'}`}>
                {overallScore != null ? overallScore.toFixed(0) : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <MetricItem label="Caller" value={evaluation.c2c_calls?.from_number || '-'} />
          <MetricItem label="Receiver" value={evaluation.c2c_calls?.to_number || '-'} />
          <MetricItem label="Date & Time" value={formatDateTime(evaluation.created_at)} />
          <MetricItem label="Duration" value={formatDuration(evaluation.c2c_calls?.duration)} />
        </div>
      </div>

      {/* Recording Player */}
      {evaluation.c2c_calls?.recording_url && evaluation.c2c_calls.recording_url !== 'pending' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
              <Play className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Call Recording</h2>
              <p className="text-sm text-gray-500">Listen to the full call recording</p>
            </div>
          </div>
          <audio controls className="w-full">
            <source src={evaluation.c2c_calls.recording_url} type="audio/mpeg" />
            <source src={evaluation.c2c_calls.recording_url} type="audio/ogg" />
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Error Message */}
      {evaluation.status === 'failed' && evaluation.error_message && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <p>{evaluation.error_message}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex overflow-x-auto border-b border-gray-200">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab evaluation={evaluation} analysis={analysis} />}
          {activeTab === 'transcript' && (
            <TranscriptTab evaluation={evaluation} />
          )}
          {activeTab === 'analysis' && (
            <AnalysisTab analysis={analysis} communicationAnalysis={communicationAnalysis} />
          )}
          {activeTab === 'scores' && (
            <ScoresTab
              c2cScores={c2cScores}
              communicationAnalysis={communicationAnalysis}
              overallScore={overallScore}
            />
          )}
          {activeTab === 'info' && <CallInfoTab evaluation={evaluation} />}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: EvaluationDetail['status'] }) {
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

function MetricItem({ label, value }: { label: string; value: string }) {
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
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm leading-7 text-gray-700">{value}</p>
    </div>
  )
}

function ListBlock({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <ul className="mt-2 space-y-2">
        {items.map((item, index) => (
          <li key={`${label}-${index}`} className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScoreBar({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const pct = Math.max(0, Math.min(100, score))
  return (
    <div className="h-2 w-full rounded-full bg-gray-200">
      <div
        className={`h-2 rounded-full transition-all duration-500 ${getScoreBg(score)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/* ===== Tab Components ===== */

function OverviewTab({ evaluation, analysis }: { evaluation: EvaluationDetail; analysis: AnalysisData }) {
  const overallScore = evaluation.overall_score ?? evaluation.score

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.7fr_1fr]">
      <div className="space-y-6">
        <SectionCard title="Conversation Outcome">
          {analysis.conversation_outcome || evaluation.c2c_calls?.outcome ? (
            <p className="text-sm leading-7 text-gray-700">
              {analysis.conversation_outcome || evaluation.c2c_calls?.outcome}
            </p>
          ) : (
            <p className="text-sm text-gray-400">No outcome data available.</p>
          )}
        </SectionCard>

        <SectionCard title="Summary">
          {evaluation.call_summary || analysis.call_summary ? (
            <p className="text-sm leading-7 text-gray-700">
              {evaluation.call_summary || analysis.call_summary}
            </p>
          ) : (
            <p className="text-sm text-gray-400">Summary not available yet.</p>
          )}
        </SectionCard>

        <SectionCard title="Overall Feedback">
          {evaluation.overall_feedback || analysis.overall_feedback ? (
            <p className="text-sm leading-7 text-gray-700">
              {evaluation.overall_feedback || analysis.overall_feedback}
            </p>
          ) : (
            <p className="text-sm text-gray-400">No feedback available.</p>
          )}
        </SectionCard>
      </div>

      <div className="space-y-6">
        <SectionCard title="Score Overview">
          <div className="text-center">
            <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
              {overallScore != null ? overallScore.toFixed(0) : '-'}
            </div>
            <p className="mt-2 text-sm text-gray-500">Overall Conversation Score</p>
            <div className="mt-4">
              <ScoreBar score={overallScore} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Call Details">
          <div className="space-y-3 text-sm">
            <DetailRow label="Status" value={evaluation.status} />
            <DetailRow
              label="Caller"
              value={evaluation.c2c_calls?.from_number || '-'}
              icon={<User className="h-3.5 w-3.5" />}
            />
            <DetailRow
              label="Receiver"
              value={evaluation.c2c_calls?.to_number || '-'}
              icon={<User className="h-3.5 w-3.5" />}
            />
            <DetailRow
              label="Date"
              value={formatDateTime(evaluation.created_at)}
              icon={<Phone className="h-3.5 w-3.5" />}
            />
            <DetailRow label="Duration" value={formatDuration(evaluation.c2c_calls?.duration)} />
            {evaluation.c2c_calls?.recording_url && evaluation.c2c_calls.recording_url !== 'pending' && (
              <DetailRow label="Recording" value="Available" />
            )}
          </div>
        </SectionCard>

        {analysis.conversation_objective && (
          <SectionCard title="Conversation Objective">
            <p className="text-sm leading-7 text-gray-700">{analysis.conversation_objective}</p>
          </SectionCard>
        )}
      </div>
    </div>
  )
}




function TranscriptTab({
  evaluation,
}: {
  evaluation: EvaluationDetail
}) {
  const [whisperTranscript, setWhisperTranscript] = useState<string | null>(null)
  const [loadingWhisper, setLoadingWhisper] = useState(false)
  const [whisperError, setWhisperError] = useState<string | null>(null)

  const isWhisperGenerated = (evaluation.analysis_json as Record<string, unknown>)?.whisper_generated === true
  // Use transcript_text directly if it exists (regardless of whisper_generated flag)
  // This avoids unnecessary Whisper API calls for evaluations that already have text.
  const initialText = evaluation.transcript_text || null
  const needsWhisperFetch = !initialText && !isWhisperGenerated

  useEffect(() => {
    if (!needsWhisperFetch || !evaluation.call_id || evaluation.status === 'processing') return

    let isMounted = true
    setLoadingWhisper(true)
    setWhisperError(null)
    
    fetch(`/api/c2c/evaluations/${evaluation.call_id}/whisper`)
      .then(res => res.json().then(data => ({ status: res.status, data })))
      .then(({ status, data }) => {
        if (!isMounted) return
        if (status !== 200 || data.error) {
          setWhisperError(data.error || 'Unknown error occurred')
        } else if (data.transcript) {
          setWhisperTranscript(data.transcript)
        }
      })
      .catch(err => {
        if (isMounted) setWhisperError(err.message)
      })
      .finally(() => {
        if (isMounted) setLoadingWhisper(false)
      })

    return () => { isMounted = false }
  }, [evaluation.call_id, needsWhisperFetch, evaluation.status])

  if (evaluation.status === 'processing' || loadingWhisper) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-gray-600 text-sm">Transcript is being generated...</p>
      </div>
    )
  }

  if (whisperError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-red-600">
        <AlertCircle className="h-10 w-10 text-red-400 mb-2" />
        <p className="text-sm font-medium">Failed to generate transcript</p>
        <p className="text-xs">{whisperError}</p>
      </div>
    )
  }

  const displayText = initialText || whisperTranscript

  if (displayText) {
    const formattedTurns = formatTranscriptIntoTurns(displayText)
    if (formattedTurns.length > 0) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white p-6 max-h-[600px] overflow-y-auto">
          <div className="space-y-4">
            {formattedTurns.map((turn, idx) => {
              const isSpk0 = turn.speaker === 0
              const label = isSpk0 ? 'Caller' : 'Receiver'
              return (
                <p key={idx} className="whitespace-pre-wrap text-sm leading-7 text-gray-700">
                  <span className="font-semibold text-gray-900">{label}:</span> {turn.lines.join(' ')}
                </p>
              )
            })}
          </div>
        </div>
      )
    }

    // Fallback: render as plain text if formatter returns nothing
    return (
      <div className="rounded-xl bg-gray-50 p-4 max-h-[600px] overflow-y-auto">
        <p className="text-sm leading-relaxed text-gray-700">{displayText}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <MessageSquare className="h-10 w-10 text-gray-300" />
      <p className="text-sm text-gray-500">No transcript available for this call.</p>
    </div>
  )
}

function AnalysisTab({
  analysis,
  communicationAnalysis,
}: {
  analysis: AnalysisData
  communicationAnalysis: { key: string; label: string; score: number; explanation: string }[]
}) {
  const sections = [
    { label: 'Call Summary', value: analysis.call_summary, type: 'text' as const },
    { label: 'Conversation Objective', value: analysis.conversation_objective, type: 'text' as const },
    { label: 'Conversation Outcome', value: analysis.conversation_outcome, type: 'text' as const },
    { label: 'Main Discussion Points', value: safeArray(analysis.main_discussion_points), type: 'list' as const },
    { label: 'What Went Well', value: safeArray(analysis.what_went_well), type: 'list' as const },
    { label: 'Areas for Improvement', value: safeArray(analysis.areas_for_improvement), type: 'list' as const },
    { label: 'Next Best Actions', value: safeArray(analysis.next_best_actions), type: 'list' as const },
    { label: 'Key Insights', value: safeArray(analysis.key_insights), type: 'list' as const },
    { label: 'Communication Highlights', value: safeArray(analysis.communication_highlights), type: 'list' as const },
    { label: 'Important Decisions', value: safeArray(analysis.important_decisions), type: 'list' as const },
    { label: 'Action Items', value: safeArray(analysis.action_items), type: 'list' as const },
    { label: 'Overall Feedback', value: analysis.overall_feedback, type: 'text' as const },
  ]

  const available = sections.filter((s) => {
    if (s.type === 'text') return !!s.value
    return Array.isArray(s.value) && s.value.length > 0
  })

  if (available.length === 0 && communicationAnalysis.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <BarChart3 className="h-10 w-10 text-gray-300" />
        <p className="text-gray-500 text-sm">AI analysis will appear here once evaluation completes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {available.map((section) =>
        section.type === 'text' ? (
          <TextBlock key={section.label} label={section.label} value={section.value as string} />
        ) : (
          <ListBlock key={section.label} label={section.label} items={section.value as string[]} />
        )
      )}

      {communicationAnalysis.length > 0 && (
        <SectionCard title="Conversation Quality Analysis">
          <div className="space-y-4">
            {communicationAnalysis.map((metric) => (
              <div
                key={metric.key}
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-gray-400" />
                    <p className="text-sm font-semibold text-gray-900">{metric.label}</p>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getScoreBadgeBg(metric.score)}`}
                  >
                    {metric.score}
                  </span>
                </div>
                <div className="mb-2">
                  <ScoreBar score={metric.score} />
                </div>
                {metric.explanation && (
                  <p className="text-sm leading-6 text-gray-600">{metric.explanation}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

function ScoresTab({
  c2cScores,
  communicationAnalysis,
  overallScore,
}: {
  c2cScores: { key: string; label: string; score: number }[]
  communicationAnalysis: { key: string; label: string; score: number; explanation: string }[]
  overallScore: number | null | undefined
}) {
  const mainScores = c2cScores

  if (mainScores.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <ListChecks className="h-10 w-10 text-gray-300" />
        <p className="text-gray-500 text-sm">Scores will appear here once evaluation completes.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {overallScore != null && (
        <SectionCard title="Overall Score">
          <div className="flex flex-col items-center py-4">
            <div className={`text-6xl font-bold ${getScoreColor(overallScore)}`}>
              {overallScore.toFixed(0)}
            </div>
            <ScoreBar score={overallScore} />
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mainScores.map((s) => {
          const explanation = communicationAnalysis.find((ca) => ca.key === s.key)?.explanation || ''
          return (
            <div
              key={s.key}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{s.label}</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getScoreBadgeBg(s.score)}`}
                >
                  {s.score}
                </span>
              </div>
              <ScoreBar score={s.score} />
              {explanation && (
                <p className="mt-3 text-xs leading-5 text-gray-600">{explanation}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CallInfoTab({ evaluation }: { evaluation: EvaluationDetail }) {
  const rows = [
    { label: 'Call ID', value: evaluation.call_id },
    { label: 'From Number (Caller)', value: evaluation.c2c_calls?.from_number || '-' },
    { label: 'To Number (Receiver)', value: evaluation.c2c_calls?.to_number || '-' },
    { label: 'Status', value: evaluation.status },
    { label: 'Duration', value: formatDuration(evaluation.c2c_calls?.duration) },
    { label: 'Date', value: formatDateTime(evaluation.created_at) },
    { label: 'Processed At', value: evaluation.processed_at ? formatDateTime(evaluation.processed_at) : '-' },
    {
      label: 'Recording',
      value:
        evaluation.c2c_calls?.recording_url && evaluation.c2c_calls.recording_url !== 'pending'
          ? 'Available'
          : 'Not available',
    },
    {
      label: 'Transcript Status',
      value: evaluation.c2c_calls?.transcript_status || '-',
    },
    { label: 'Analysis Status', value: evaluation.status },
    { label: 'Call Outcome', value: evaluation.c2c_calls?.outcome || '-' },
  ]

  return (
    <div className="max-w-2xl">
      <SectionCard title="Call Information">
        <div className="space-y-0 divide-y divide-gray-100">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between py-3 text-sm"
            >
              <span className="text-gray-500">{row.label}</span>
              <span className="font-mono text-gray-900 max-w-[50%] truncate text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-gray-500">
        {icon}
        {label}
      </span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  )
}

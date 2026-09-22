'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart2,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  Clock,
  DollarSign,
  FileText,
  Info,
  Layers,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Play,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  User,
  Users,
} from 'lucide-react'
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
  key: string
  label: string
  score: number | null
  feedback: string
}> {
  if (!isRecord(value)) {
    return []
  }

  const ORDER = [
    'script_and_flow_adherence',
    'deflection_handling',
    'closing_quality',
    'greeting_quality',
    'professionalism',
    'tone',
    'clarity',
    'listening_ability',
    'question_quality',
    'accuracy',
    'conversation_flow',
    'confidence',
  ]

  const entries = Object.entries(value).map(([key, entry]) => {
    const label = key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase())
    const record = isRecord(entry) ? entry : {}
    const score = typeof record.score === 'number' ? record.score : Number(record.score)

    return {
      key,
      label,
      score: Number.isFinite(score) ? score : null,
      feedback: typeof record.feedback === 'string' ? record.feedback : '',
    }
  })

  // Sort by defined order
  return entries.sort((a, b) => {
    const idxA = ORDER.indexOf(a.key)
    const idxB = ORDER.indexOf(b.key)
    if (idxA !== -1 && idxB !== -1) return idxA - idxB
    if (idxA !== -1) return -1
    if (idxB !== -1) return 1
    return a.label.localeCompare(b.label)
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
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 px-3 py-1 text-xs font-semibold text-blue-200 backdrop-blur-sm">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Processing
      </span>
    )
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-400/30 px-3 py-1 text-xs font-semibold text-red-200 backdrop-blur-sm">
        <AlertCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-sm">
      <CheckCircle2 className="h-3.5 w-3.5" />
      Completed
    </span>
  )
}

function getScoreBg(score: number | null | undefined): string {
  if (score == null) return 'bg-gray-400'
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-blue-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

function getScoreBadge(score: number | null | undefined) {
  if (typeof score !== 'number') {
    return <span className="text-xs font-medium text-gray-500">-</span>
  }
  let bg = 'bg-rose-100 text-rose-800 border-rose-200'
  if (score >= 80) bg = 'bg-emerald-100 text-emerald-800 border-emerald-200'
  else if (score >= 60) bg = 'bg-blue-100 text-blue-800 border-blue-200'
  else if (score >= 40) bg = 'bg-amber-100 text-amber-800 border-amber-200'

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${bg}`}>
      {score.toFixed(0)}/100
    </span>
  )
}

export default function EvaluationDetailPage() {
  const params = useParams<{ id: string }>()
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'transcript' | 'analysis' | 'scores' | 'info'>('overview')

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
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        <p className="text-sm font-medium text-gray-600">Loading evaluation details...</p>
      </div>
    )
  }

  if (!evaluation) {
    return (
      <div className="space-y-4 max-w-4xl mx-auto py-8">
        <Link
          href="/admin/ai-calling-agents"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI Calling Agents
        </Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">Evaluation not found</h2>
          <p className="text-sm text-gray-500">The evaluation you are looking for does not exist or has been deleted.</p>
        </div>
      </div>
    )
  }

  const transcriptText =
    evaluation.transcript_text ||
    evaluation.ai_calls?.ai_transcripts?.[0]?.raw_text ||
    'Transcript is not available yet.'

  const overallScoreVal =
    typeof evaluation.overall_score === 'number'
      ? evaluation.overall_score
      : typeof evaluation.score === 'number'
        ? evaluation.score
        : null

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'transcript', label: 'Transcript', icon: MessageSquare },
    { id: 'analysis', label: 'AI Analysis', icon: BarChart2 },
    { id: 'scores', label: 'Scores', icon: CheckSquare },
    { id: 'info', label: 'Call Information', icon: FileText },
  ] as const

  const isCallback =
    (evaluation.lead_status?.toLowerCase().includes('callback') ||
      evaluation.lead_status?.toLowerCase().includes('follow')) ??
    false

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Top Back Navigation */}
      <div>
        <Link
          href="/admin/ai-calling-agents"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-purple-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to AI Calling Agents
        </Link>
      </div>

      {/* Callback Banner */}
      {isCallback && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 flex items-start gap-4 shadow-sm animate-fade-in">
          <div className="flex-shrink-0 mt-0.5 w-10 h-10 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center">
            <PhoneCall className="w-5 h-5 text-amber-600 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-amber-900 uppercase tracking-wider">📞 Callback Required</p>
            <p className="text-sm text-amber-800 mt-0.5">
              {evaluation.meeting_datetime
                ? <>Scheduled for <strong>{evaluation.meeting_datetime}</strong>{evaluation.meeting_location ? <> at <strong>{evaluation.meeting_location}</strong></> : ''}</>  
                : 'Customer requested a callback — time not yet confirmed.'}
            </p>
          </div>
          <span className="ml-auto shrink-0 inline-flex items-center px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-bold border border-amber-300 uppercase tracking-wide">
            Action Needed
          </span>
        </div>
      )}

      {/* Header Banner Card */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 p-8 text-white shadow-xl relative overflow-hidden border border-purple-900/40">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mb-20" />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
              <Sparkles className="h-3.5 w-3.5 text-purple-300" />
              Shriram PFA • Agent Evaluation
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Evaluation Details
            </h1>
            <p className="text-sm text-slate-300 flex items-center gap-2 flex-wrap">
              <span>Agent: <strong className="text-white">{evaluation.ai_calls?.ai_agents?.name || 'Priya'}</strong></span>
              <span>•</span>
              <span>Customer: <strong className="text-white">{evaluation.ai_calls?.customer_number || 'Unknown'}</strong></span>
              <span>•</span>
              <span>Call ID: <code className="text-xs bg-white/10 px-2 py-0.5 rounded text-purple-200">{evaluation.call_id.substring(0, 14)}...</code></span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-3 shrink-0">
            {statusPill(evaluation.status)}
            <div className="rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 px-6 py-3.5 text-right flex flex-col items-center">
              <span className="text-[11px] font-bold uppercase tracking-widest text-purple-200 mb-0.5">Overall Score</span>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white">
                  {overallScoreVal !== null ? overallScoreVal.toFixed(0) : '-'}
                </span>
                <span className="text-sm font-semibold text-purple-300">/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Top Metrics */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            icon={Phone}
            label="Customer"
            value={evaluation.ai_calls?.customer_number || '-'}
          />
          <MetricCard
            icon={Clock}
            label="Duration"
            value={formatDuration(evaluation.ai_calls?.duration)}
          />
          <MetricCard
            icon={Tag}
            label="Call Type"
            value={evaluation.ai_calls?.call_type || 'Outbound'}
          />
          <MetricCard
            icon={Shield}
            label="Status"
            value={evaluation.lead_status || evaluation.ai_calls?.status || 'Completed'}
          />
        </div>
      </div>

      {/* Modern Tab Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-1.5">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all shrink-0 ${
                  isActive
                    ? 'bg-purple-50 text-purple-700 shadow-xs border border-purple-200/80 font-bold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-purple-600' : 'text-gray-400'}`} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Contents */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab evaluation={evaluation} />
        )}

        {activeTab === 'transcript' && (
          <TranscriptTab
            evaluation={evaluation}
            transcriptText={transcriptText}
          />
        )}

        {activeTab === 'analysis' && (
          <AIAnalysisTab
            evaluation={evaluation}
            performanceEntries={performanceEntries}
          />
        )}

        {activeTab === 'scores' && (
          <ScoresTab
            evaluation={evaluation}
            performanceEntries={performanceEntries}
          />
        )}

        {activeTab === 'info' && (
          <CallInfoTab evaluation={evaluation} />
        )}
      </div>
    </div>
  )
}

/* =========================================================================
   TAB 1: OVERVIEW TAB
   ========================================================================= */

function OverviewTab({ evaluation }: { evaluation: EvaluationDetail }) {
  const infoCaptured = evaluation.information_captured || {}
  // Exactly the 13 fields the Shriram PFA evaluation prompt extracts
  const fields = [
    { key: 'Customer full name',                   alt: "Customer's full name",           icon: User },
    { key: 'Mobile number',                        alt: 'Mobile',                         icon: Phone },
    { key: 'City',                                 alt: 'City / Location',                icon: MapPin },
    { key: 'Age',                                  alt: 'Age',                            icon: Users },
    { key: 'Occupation',                           alt: 'Occupation / Job',               icon: Briefcase },
    { key: 'Policy or product of interest',        alt: 'Policy of interest',             icon: ShieldCheck },
    { key: 'Existing policy holder',               alt: 'Existing policy',                icon: Shield },
    { key: 'Annual income or investment capacity', alt: 'Annual income',                  icon: DollarSign },
    { key: 'Preferred language',                   alt: 'Language preference',            icon: MessageSquare },
    { key: 'Callback date and time',               alt: 'Callback date',                  icon: Calendar },
    { key: 'Email address',                        alt: 'Email',                          icon: Mail },
    { key: 'Number of dependents',                 alt: 'Dependents',                     icon: Users },
    { key: 'Lead source or campaign name',         alt: 'Lead source',                    icon: Tag },
  ]

  return (
    <div className="space-y-6">
      {/* Top Banner with Lead Status */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-gray-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Lead Disposition Status</span>
            <div className="mt-1.5 flex items-center gap-3">
              <LeadStatusBadge status={evaluation.lead_status || 'Information Collected'} />
              {evaluation.meeting_datetime && (
                <span className="text-sm font-semibold text-gray-700 bg-gray-100 px-3 py-1 rounded-full">
                  📅 Callback: {evaluation.meeting_datetime}
                </span>
              )}
            </div>
          </div>
          {evaluation.data_capture_completeness_score !== null && evaluation.data_capture_completeness_score !== undefined && (
            <div className="flex items-center gap-3 bg-purple-50/70 border border-purple-100 px-4 py-2.5 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                {evaluation.data_capture_completeness_score.toFixed(0)}%
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-purple-900">Data Completeness</p>
                <p className="text-xs text-purple-700">Shriram PFA Field Capture</p>
              </div>
            </div>
          )}
        </div>

        {/* 13 Captured Fields Grid */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Information Captured from Transcript
            </h3>
            <span className="text-xs text-gray-500 font-medium">13 Shriram PFA Verification Fields</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {fields.map(({ key, alt, icon: Icon }) => {
              const val = infoCaptured[key] || infoCaptured[alt] || ''
              const isNotCaptured =
                !val ||
                val.trim() === '' ||
                val.toLowerCase() === 'n/a' ||
                val.toLowerCase() === 'not captured' ||
                val.toLowerCase() === 'null'

              return (
                <div
                  key={key}
                  className={`p-3.5 rounded-xl border transition-all ${
                    isNotCaptured
                      ? 'bg-gray-50/70 border-gray-200/70'
                      : 'bg-emerald-50/30 border-emerald-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                      <Icon className="w-3.5 h-3.5 text-gray-400" />
                      <span>{key}</span>
                    </div>
                    {isNotCaptured ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 text-gray-600">
                        N/A
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <Check className="w-3 h-3 text-emerald-600" /> Captured
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-2 text-sm font-medium leading-snug break-words ${
                      isNotCaptured ? 'text-gray-400 italic' : 'text-gray-900 font-semibold'
                    }`}
                  >
                    {isNotCaptured ? 'Not Captured' : val}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Summary and Intent Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Call Summary" icon={FileText}>
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {evaluation.call_summary || 'No call summary generated.'}
          </p>
        </SectionCard>

        <SectionCard title="Customer Intent" icon={Target}>
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {evaluation.customer_intent || 'No customer intent recorded.'}
          </p>
        </SectionCard>
      </div>

      {/* Main Discussion Points & Outcome */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SectionCard title="Main Discussion Points" icon={Layers}>
          {evaluation.main_discussion_points && evaluation.main_discussion_points.length > 0 ? (
            <ul className="space-y-2.5">
              {toStringArray(evaluation.main_discussion_points).map((point, index) => (
                <li key={index} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No discussion points listed.</p>
          )}
        </SectionCard>

        <SectionCard title="Call Outcome & Verdict" icon={Award}>
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {evaluation.call_outcome || evaluation.ai_calls?.outcome || 'No explicit outcome logged.'}
          </p>
        </SectionCard>
      </div>
    </div>
  )
}

/* =========================================================================
   TAB 2: TRANSCRIPT TAB
   ========================================================================= */

function TranscriptTab({
  evaluation,
  transcriptText,
}: {
  evaluation: EvaluationDetail
  transcriptText: string
}) {
  const formattedTurns = useMemo(() => formatTranscriptIntoTurns(transcriptText), [transcriptText])

  return (
    <div className="space-y-6">
      {/* Audio Recording Card */}
      {evaluation.ai_calls?.recording_url && evaluation.ai_calls.recording_url !== 'pending' && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-100">
              <Play className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Call Audio Recording</h2>
              <p className="text-xs text-gray-500">Full stereo / mono call playback</p>
            </div>
          </div>
          <audio controls className="w-full">
            <source src={evaluation.ai_calls.recording_url} type="audio/mpeg" />
            <source src={evaluation.ai_calls.recording_url} type="audio/ogg" />
            <source src={evaluation.ai_calls.recording_url} type="audio/wav" />
            Your browser does not support audio playback.
          </audio>
        </div>
      )}

      {/* Transcript Turns Card */}
      <SectionCard title="Conversation Transcript" icon={MessageSquare}>
        {formattedTurns.length > 0 ? (
          <div className="space-y-3.5 max-h-[700px] overflow-y-auto pr-2">
            {formattedTurns.map((turn, idx) => {
              const isAssistant = turn.speaker === 0
              const label = turn.speakerLabel || (isAssistant ? 'Assistant (Priya)' : 'Customer')

              return (
                <div
                  key={idx}
                  className={`rounded-2xl p-4 border transition-all ${
                    isAssistant
                      ? 'bg-purple-50/70 border-purple-100 text-purple-950 ml-0 mr-8'
                      : 'bg-blue-50/70 border-blue-100 text-blue-950 ml-8 mr-0'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isAssistant
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {label}
                    </span>
                    <span className="text-[11px] font-semibold text-gray-400">Turn #{idx + 1}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {turn.lines.join(' ')}
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-gray-50 p-6 text-center text-sm text-gray-500">
            {transcriptText || 'No transcript text available.'}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

/* =========================================================================
   TAB 3: AI ANALYSIS TAB (COLORFUL & DETAILED)
   ========================================================================= */

function AIAnalysisTab({
  evaluation,
  performanceEntries,
}: {
  evaluation: EvaluationDetail
  performanceEntries: Array<{ key: string; label: string; score: number | null; feedback: string }>
}) {
  const strengths = toStringArray(evaluation.strengths)
  const improvements = toStringArray(evaluation.areas_for_improvement)
  const nextActions = toStringArray(evaluation.next_best_actions)

  return (
    <div className="space-y-6">
      {/* Executive Feedback Card */}
      {evaluation.overall_feedback && (
        <div className="rounded-2xl bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 p-6 text-white shadow-md border border-purple-800/50">
          <div className="flex items-center gap-2.5 text-purple-200 mb-2">
            <Sparkles className="w-5 h-5 text-purple-300" />
            <h3 className="text-sm font-bold uppercase tracking-wider">AI Evaluation Commentary &amp; Verdict</h3>
          </div>
          <p className="text-sm leading-relaxed text-purple-50 whitespace-pre-wrap font-medium">
            {evaluation.overall_feedback}
          </p>
        </div>
      )}

      {/* Colorful 3-Column Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* What Went Well (Green) */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-emerald-800">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">What Went Well</h3>
              <p className="text-xs text-emerald-600">Key agent strengths demonstrated</p>
            </div>
          </div>
          {strengths.length > 0 ? (
            <ul className="space-y-2.5">
              {strengths.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-emerald-950 bg-white/80 p-3 rounded-xl border border-emerald-100/80 shadow-xs">
                  <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-700 italic">No specific strengths recorded.</p>
          )}
        </div>

        {/* Areas for Improvement (Amber / Red) */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-rose-800">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Areas for Improvement</h3>
              <p className="text-xs text-rose-600">Missed steps or critical issues</p>
            </div>
          </div>
          {improvements.length > 0 ? (
            <ul className="space-y-2.5">
              {improvements.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-rose-950 bg-white/80 p-3 rounded-xl border border-rose-100/80 shadow-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-rose-700 italic">No major improvement areas detected.</p>
          )}
        </div>

        {/* Next Best Actions (Blue / Indigo) */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-sky-800">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Next Best Actions</h3>
              <p className="text-xs text-sky-600">Recommended follow-ups</p>
            </div>
          </div>
          {nextActions.length > 0 ? (
            <ul className="space-y-2.5">
              {nextActions.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-sm text-sky-950 bg-white/80 p-3 rounded-xl border border-sky-100/80 shadow-xs">
                  <ArrowLeft className="w-4 h-4 text-sky-600 rotate-180 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-sky-700 italic">No next actions specified.</p>
          )}
        </div>
      </div>

      {/* Detailed Agent Performance Dimension Breakdown */}
      <SectionCard title="Agent Performance Dimension Breakdown" icon={BarChart2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {performanceEntries.map((entry) => {
            const isHighlight =
              entry.key === 'deflection_handling' ||
              entry.key === 'script_and_flow_adherence' ||
              entry.key === 'closing_quality'

            return (
              <div
                key={entry.key}
                className={`rounded-2xl p-5 border transition-all ${
                  isHighlight
                    ? 'bg-purple-50/40 border-purple-200 shadow-xs'
                    : 'bg-gray-50/70 border-gray-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900 text-sm">{entry.label}</span>
                    {isHighlight && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-700 uppercase tracking-wider">
                        Core Task
                      </span>
                    )}
                  </div>
                  {getScoreBadge(entry.score)}
                </div>

                {/* Score Progress Bar */}
                {typeof entry.score === 'number' && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${getScoreBg(entry.score)}`}
                      style={{ width: `${Math.max(5, Math.min(100, entry.score))}%` }}
                    />
                  </div>
                )}

                <p className="text-xs leading-relaxed text-gray-600">
                  {entry.feedback || 'No specific feedback provided for this dimension.'}
                </p>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

/* =========================================================================
   TAB 4: SCORES TAB (COLORFUL EXECUTIVE STATS)
   ========================================================================= */

function ScoresTab({
  evaluation,
  performanceEntries,
}: {
  evaluation: EvaluationDetail
  performanceEntries: Array<{ key: string; label: string; score: number | null; feedback: string }>
}) {
  const scores = [
    {
      label: 'Overall Call Score',
      score: evaluation.overall_score ?? evaluation.score,
      desc: 'Weighted quality & protocol adherence',
      gradient: 'from-purple-600 to-indigo-600',
    },
    {
      label: 'Data Completeness Score',
      score: evaluation.data_capture_completeness_score,
      desc: 'PFA data capture completeness',
      gradient: 'from-emerald-600 to-teal-600',
    },
    {
      label: 'Agent Performance Score',
      score: evaluation.agent_performance_score,
      desc: 'Script order & deflection compliance',
      gradient: 'from-blue-600 to-cyan-600',
    },
    {
      label: 'Customer Engagement',
      score: evaluation.customer_engagement_score,
      desc: 'Clarity, listening & pacing',
      gradient: 'from-indigo-600 to-violet-600',
    },
    {
      label: 'Communication Quality',
      score: evaluation.communication_score,
      desc: 'Tone, confidence & professionalism',
      gradient: 'from-pink-600 to-rose-600',
    },
  ]

  const GRADE_SCALE = [
    { grade: 'A+', range: '90–100', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
    { grade: 'A',  range: '80–89',  color: 'bg-green-500',   text: 'text-green-700',   bg: 'bg-green-50 border-green-200'   },
    { grade: 'B',  range: '70–79',  color: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200'     },
    { grade: 'C',  range: '60–69',  color: 'bg-cyan-500',    text: 'text-cyan-700',    bg: 'bg-cyan-50 border-cyan-200'     },
    { grade: 'D',  range: '40–59',  color: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200'   },
    { grade: 'F',  range: '0–39',   color: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200'     },
  ]

  const getGrade = (score: number | null | undefined) => {
    if (score == null) return null
    if (score >= 90) return 'A+'
    if (score >= 80) return 'A'
    if (score >= 70) return 'B'
    if (score >= 60) return 'C'
    if (score >= 40) return 'D'
    return 'F'
  }

  return (
    <div className="space-y-6">
      {/* Grading Legend */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
          <Award className="w-5 h-5 text-purple-600" />
          <h2 className="text-base font-bold text-gray-900">Shriram PFA Score Grading Legend</h2>
          <span className="ml-auto text-xs text-gray-400 font-medium">Based on Priya agent call flow adherence</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {GRADE_SCALE.map((g) => (
            <div key={g.grade} className={`rounded-xl border p-3 flex flex-col items-center gap-1 ${g.bg}`}>
              <span className={`text-2xl font-extrabold ${g.text}`}>{g.grade}</span>
              <span className="text-xs font-semibold text-gray-600">{g.range}</span>
              <div className={`w-full h-1.5 rounded-full ${g.color} mt-1 opacity-70`} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-500">
          <strong>Critical failure cap:</strong> Any call where the agent repeated the greeting, quoted exact figures, or skipped the callback confirmation is automatically capped at <strong className="text-rose-600">40 (Grade D)</strong> regardless of other scores.
        </p>
      </div>
      {/* Top 5 KPI Score Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {scores.map((s, idx) => {
          const grade = getGrade(typeof s.score === 'number' ? s.score : null)
          return (
            <div
              key={idx}
              className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm relative overflow-hidden flex flex-col justify-between"
            >
              <div className={`h-1.5 w-full absolute top-0 left-0 bg-gradient-to-r ${s.gradient}`} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{s.label}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-gray-900">
                    {typeof s.score === 'number' ? s.score.toFixed(0) : '-'}
                  </span>
                  <span className="text-xs text-gray-400 font-semibold">/100</span>
                  {grade && (
                    <span className={`text-sm font-extrabold ml-auto ${
                      grade === 'A+' || grade === 'A' ? 'text-emerald-600' :
                      grade === 'B' ? 'text-blue-600' :
                      grade === 'C' ? 'text-cyan-600' :
                      grade === 'D' ? 'text-amber-600' : 'text-rose-600'
                    }`}>{grade}</span>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[11px] text-gray-500 leading-tight">{s.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Performance Score Meters */}
      <SectionCard title="Performance Dimension Comparison" icon={Award}>
        <div className="space-y-4">
          {performanceEntries.map((entry) => (
            <div key={entry.key} className="flex flex-col gap-1.5 p-3 rounded-xl hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-gray-800">{entry.label}</span>
                <span className="font-bold text-gray-900">{entry.score !== null ? `${entry.score}/100` : '-'}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className={`h-2.5 rounded-full transition-all duration-700 ${getScoreBg(entry.score)}`}
                  style={{ width: `${Math.max(2, Math.min(100, entry.score || 0))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

/* =========================================================================
   TAB 5: CALL INFORMATION TAB
   ========================================================================= */

function CallInfoTab({ evaluation }: { evaluation: EvaluationDetail }) {
  const call = evaluation.ai_calls

  const metadataItems = [
    { label: 'Call Identifier', value: evaluation.call_id },
    { label: 'Evaluation Status', value: evaluation.status },
    { label: 'Customer Phone', value: call?.customer_number || '-' },
    { label: 'Agent Assigned', value: call?.ai_agents?.name || 'Shriram PFA Agent' },
    { label: 'Assigned DID', value: call?.did || '-' },
    { label: 'Call Direction', value: call?.call_type || 'Outbound' },
    { label: 'Duration', value: formatDuration(call?.duration) },
    { label: 'Transcript Source', value: evaluation.transcript_source || 'whisper-1' },
    { label: 'Created Timestamp', value: formatDateTime(evaluation.created_at) },
    { label: 'Processed At', value: evaluation.processed_at ? formatDateTime(evaluation.processed_at) : '-' },
    { label: 'Call Disposition', value: evaluation.lead_status || call?.outcome || 'Information Collected' },
  ]

  return (
    <SectionCard title="System &amp; Telephony Metadata" icon={FileText}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {metadataItems.map((item, idx) => (
          <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 flex flex-col justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{item.label}</span>
            <span className="text-sm font-semibold text-gray-800 mt-1 break-all">{item.value}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

/* =========================================================================
   REUSABLE UI COMPONENTS
   ========================================================================= */

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl bg-white/10 p-3.5 backdrop-blur-sm border border-white/10">
      <div className="flex items-center gap-1.5 text-purple-200 text-xs">
        <Icon className="w-3.5 h-3.5" />
        <span className="uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="mt-1 text-sm font-bold text-white truncate">{value}</p>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: React.ElementType
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
        {Icon && <Icon className="w-5 h-5 text-purple-600" />}
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const norm = status.toLowerCase()

  let style = {
    bg: 'bg-emerald-50 border-emerald-300',
    text: 'text-emerald-800',
    dot: 'bg-emerald-500',
    label: 'Information Collected',
  }

  if (norm.includes('callback') || norm.includes('follow-up')) {
    style = {
      bg: 'bg-amber-50 border-amber-300',
      text: 'text-amber-800',
      dot: 'bg-amber-500',
      label: 'Callback Required',
    }
  } else if (norm.includes('not interested') || norm.includes('failed')) {
    style = {
      bg: 'bg-rose-50 border-rose-300',
      text: 'text-rose-800',
      dot: 'bg-rose-500',
      label: 'Not Interested',
    }
  } else if (norm.includes('wrong number')) {
    style = {
      bg: 'bg-zinc-50 border-zinc-300',
      text: 'text-zinc-800',
      dot: 'bg-zinc-500',
      label: 'Wrong Number',
    }
  } else if (norm.includes('no answer')) {
    style = {
      bg: 'bg-slate-50 border-slate-300',
      text: 'text-slate-800',
      dot: 'bg-slate-500',
      label: 'No Answer',
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider ${style.bg} ${style.text}`}
    >
      <span className={`w-2 h-2 rounded-full animate-pulse ${style.dot}`} />
      {status || style.label}
    </span>
  )
}

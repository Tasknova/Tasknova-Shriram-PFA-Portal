'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  AlertTriangle,
  Smile,
  Gauge,
  BarChart3,
} from 'lucide-react'
import { formatDate, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { MeetingIntelligence } from '@/types'

type MeetingIntelligenceRow = MeetingIntelligence & {
  standup?: {
    id: string
    meeting_title?: string
    meeting_date?: string
    created_at?: string
  } | null
}

function labelize(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toLineItems(value: unknown, parentKey = ''): string[] {
  if (value === null || value === undefined) return [parentKey ? `${parentKey}: -` : '-']

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [parentKey ? `${parentKey}: ${String(value)}` : String(value)]
  }

  if (Array.isArray(value)) {
    const lines: string[] = []
    value.forEach((item, index) => {
      const itemKey = parentKey ? `${parentKey} ${index + 1}` : `Item ${index + 1}`
      lines.push(...toLineItems(item, itemKey))
    })
    return lines.length ? lines : [parentKey ? `${parentKey}: -` : '-']
  }

  if (isObject(value)) {
    const lines: string[] = []
    Object.entries(value).forEach(([key, nestedValue]) => {
      const nextKey = parentKey ? `${parentKey} - ${labelize(key)}` : labelize(key)
      lines.push(...toLineItems(nestedValue, nextKey))
    })
    return lines.length ? lines : [parentKey ? `${parentKey}: -` : '-']
  }

  return [parentKey ? `${parentKey}: ${String(value)}` : String(value)]
}

function renderAnyValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => renderAnyValue(item)).join(', ')
  if (isObject(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${labelize(k)}: ${renderAnyValue(v)}`)
      .join(' | ')
  }
  return String(value)
}

export default function MeetingsIntelligenceDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [row, setRow] = useState<MeetingIntelligenceRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/admin/meetings-intelligence?id=${id}`)
        if (!res.ok) throw new Error('Request failed')

        const data = await res.json()
        setRow(data)
      } catch {
        toast.error('Failed to fetch meeting intelligence details')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchDetail()
    }
  }, [id])

  const metricCards = useMemo(() => {
    if (!row) return []

    return [
      { label: 'Tasks Completed', value: row.tasks_completed ?? 0, reasoning: row.tasks_completed_details },
      { label: 'Tasks Delayed', value: row.tasks_delayed ?? 0, reasoning: row.tasks_delayed_details },
      { label: 'Blockers Detected', value: row.blockers_detected ?? 0, reasoning: row.blockers_detected_details },
      { label: 'Critical Blockers', value: row.critical_blockers ?? 0, reasoning: row.critical_blockers_details },
      { label: 'Deals Progressed', value: row.pipeline_deals_progressed ?? 0, reasoning: row.pipeline_deals_progressed_details },
      { label: 'Deals Stalled', value: row.pipeline_deals_stalled ?? 0, reasoning: row.pipeline_deals_stalled_details },
      { label: 'Revenue Impact Discussions', value: row.revenue_impact_discussions ?? 0, reasoning: row.revenue_impact_discussions_details },
      { label: 'Revenue Risk Signals', value: row.revenue_risk_signals ?? 0, reasoning: row.revenue_risk_signals_details },
      { label: 'Customer Feedback Count', value: row.customer_feedback_count ?? 0, reasoning: row.customer_feedback_details },
      { label: 'Feature Requests', value: row.feature_requests ?? 0, reasoning: row.feature_requests_details },
      { label: 'Followups Assigned', value: row.followups_assigned ?? 0, reasoning: row.followups_assigned_details },
      { label: 'Followups Pending', value: row.followups_pending ?? 0, reasoning: row.followups_pending_details },
    ]
  }, [row])

  const analysisEntries = useMemo(() => {
    if (!row || !isObject(row.analysis)) return []
    return Object.entries(row.analysis)
  }, [row])

  const participantEntries = useMemo(() => {
    if (!row || !isObject(row.participants_analysis)) return []
    return Object.entries(row.participants_analysis)
  }, [row])

  if (loading) {
    return <div className="text-center py-12">Loading meeting analysis...</div>
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <Link href="/admin/meetings-intelligence" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft className="w-4 h-4" /> Back to Meetings Intelligence
        </Link>
        <div className="card">
          <p className="text-gray-700">Meeting intelligence record not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/admin/meetings-intelligence" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft className="w-4 h-4" /> Back to Meetings Intelligence
        </Link>
      </div>

      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <BrainCircuit className="w-10 h-10" />
          <h1 className="text-3xl md:text-4xl font-bold">Meeting Analysis</h1>
        </div>
        <p className="text-indigo-100 text-lg">{row.standup?.meeting_title || 'Daily Standup Meeting'}</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Meeting Date</p>
            <p className="text-lg font-bold mt-1">{row.standup?.meeting_date ? formatDate(row.standup.meeting_date) : '-'}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase flex items-center gap-1"><Smile className="w-3 h-3" /> Sentiment</p>
            <p className="text-lg font-bold mt-1">{row.sentiment_score ?? '-' }{row.sentiment_score !== null && row.sentiment_score !== undefined ? '/100' : ''}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase flex items-center gap-1"><Gauge className="w-3 h-3" /> Efficiency</p>
            <p className="text-lg font-bold mt-1">{row.meeting_efficiency_score ?? '-' }{row.meeting_efficiency_score !== null && row.meeting_efficiency_score !== undefined ? '/100' : ''}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card border border-blue-200 bg-blue-50">
          <p className="text-xs font-semibold text-blue-700 uppercase mb-2 flex items-center gap-1"><Smile className="w-3 h-3" /> Sentiment Reasoning</p>
          <p className="text-sm text-blue-900 whitespace-pre-wrap">{row.sentiment_reasoning || 'No sentiment reasoning provided.'}</p>
        </div>
        <div className="card border border-purple-200 bg-purple-50">
          <p className="text-xs font-semibold text-purple-700 uppercase mb-2 flex items-center gap-1"><Gauge className="w-3 h-3" /> Efficiency Reasoning</p>
          <p className="text-sm text-purple-900 whitespace-pre-wrap">{row.meeting_efficiency_reasoning || 'No efficiency reasoning provided.'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((item) => (
          <div key={item.label} className="card border border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase">{item.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{item.value}</p>
            {item.reasoning && (
              <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700 uppercase">Reasoning</summary>
                <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{item.reasoning}</p>
              </details>
            )}
          </div>
        ))}
      </div>

      {row.key_insights && (
        <div className="card border border-cyan-200 bg-cyan-50">
          <p className="text-xs font-semibold text-cyan-700 uppercase mb-2 flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Key Insights</p>
          <p className="text-sm text-cyan-900 whitespace-pre-wrap leading-relaxed">{row.key_insights}</p>
        </div>
      )}

      {analysisEntries.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Structured Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysisEntries.map(([key, value]) => (
              <div key={key} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <p className="text-xs font-semibold text-slate-600 uppercase mb-2">{labelize(key)}</p>
                <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">{renderAnyValue(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {participantEntries.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Participants Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {participantEntries.map(([key, value]) => (
              <div key={key} className="border border-emerald-200 rounded-xl p-4 bg-emerald-50">
                <p className="text-xs font-semibold text-emerald-700 uppercase mb-2">{labelize(key)}</p>
                <div className="space-y-1">
                  {toLineItems(value).map((line, index) => (
                    <p key={`${key}-${index}`} className="text-sm text-emerald-900 leading-relaxed break-words">
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card border border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <p className="inline-flex items-center gap-1"><Clock3 className="w-4 h-4" /> Created: {formatDateTime(row.created_at)}</p>
          <p className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Updated: {formatDateTime(row.updated_at)}</p>
          <p className="inline-flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> Record ID: {row.id}</p>
          <p>Meeting Ref: {row.meeting_id}</p>
        </div>
      </div>
    </div>
  )
}

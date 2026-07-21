'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Download,
  Mail,
  MapPin,
  Phone,
  Share2,
  Sparkles,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { VoiceConversation } from '@/types'
import { formatDateTime } from '@/lib/utils'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function unwrapCodeFence(input: string): string {
  const match = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return match ? match[1].trim() : input
}

function extractJsonSubstring(input: string): string | null {
  const firstObject = input.indexOf('{')
  const lastObject = input.lastIndexOf('}')

  if (firstObject !== -1 && lastObject > firstObject) {
    return input.slice(firstObject, lastObject + 1)
  }

  const firstArray = input.indexOf('[')
  const lastArray = input.lastIndexOf(']')
  if (firstArray !== -1 && lastArray > firstArray) {
    return input.slice(firstArray, lastArray + 1)
  }

  return null
}

function parseJsonLikeString(input: string): unknown {
  const queue: string[] = [input]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const raw = queue.shift() || ''
    const current = raw.trim()
    if (!current || visited.has(current)) continue
    visited.add(current)

    const candidate = current.replace(/^`+|`+$/g, '').trim()

    try {
      const parsed: unknown = JSON.parse(candidate)
      if (typeof parsed === 'string') {
        queue.push(parsed)
      } else {
        return parsed
      }
    } catch {
      // Try other normalizations.
    }

    const unfenced = unwrapCodeFence(candidate)
    if (unfenced !== candidate) queue.push(unfenced)

    if (/^json\b/i.test(unfenced)) {
      queue.push(unfenced.replace(/^json\b\s*/i, ''))
    }

    const extracted = extractJsonSubstring(unfenced)
    if (extracted && extracted !== unfenced) queue.push(extracted)

    if (unfenced.includes('\\"') || unfenced.includes('\\n')) {
      queue.push(
        unfenced
          .replace(/^"+|"+$/g, '')
          .replace(/\\n/g, ' ')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
      )
    }
  }

  return input
}

function parseAnalysis(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  return parseJsonLikeString(trimmed)
}

function AnalysisValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 3) {
    return <p className="text-sm text-gray-600">{formatPrimitive(value)}</p>
  }

  if (!Array.isArray(value) && !isRecord(value)) {
    return <p className="text-sm text-gray-800 break-words">{formatPrimitive(value)}</p>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <p className="text-sm text-gray-600">-</p>
    }

    return (
      <ul className="space-y-2">
        {value.map((item, index) => (
          <li key={index} className="rounded-lg border border-gray-200 bg-white p-3">
            {Array.isArray(item) || isRecord(item) ? (
              <AnalysisValue value={item} depth={depth + 1} />
            ) : (
              <p className="text-sm text-gray-800 break-words">{formatPrimitive(item)}</p>
            )}
          </li>
        ))}
      </ul>
    )
  }

  const entries = Object.entries(value)
  if (entries.length === 0) {
    return <p className="text-sm text-gray-600">-</p>
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {entries.map(([key, nested]) => (
        <div key={key} className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            {formatLabel(key)}
          </p>
          {Array.isArray(nested) || isRecord(nested) ? (
            <AnalysisValue value={nested} depth={depth + 1} />
          ) : (
            <p className="text-sm text-gray-800 break-words">{formatPrimitive(nested)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export default function VoiceConversationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [conversation, setConversation] = useState<VoiceConversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [autoAnalysisTried, setAutoAnalysisTried] = useState(false)

  const fetchConversation = async () => {
    try {
      const res = await fetch(`/api/admin/voice-conversations?id=${id}`)
      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      setConversation(data)
    } catch {
      toast.error('Failed to fetch voice conversation details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) {
      fetchConversation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const runAnalysis = useCallback(async (force = false) => {
    const conversationId = conversation?.id
    if (!conversationId) return

    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/voice-conversations/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: conversationId, force }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Failed to analyze conversation')
      }

      if (!data?.success || !data?.conversation) {
        throw new Error(data?.message || 'Analysis did not return updated data')
      }

      setConversation(data.conversation)
      toast.success(data.reused ? 'Using existing analysis' : 'Analysis completed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }, [conversation?.id])

  useEffect(() => {
    if (!conversation || autoAnalysisTried) return
    if (!conversation.transcript || conversation.transcript.trim().length < 20) return

    if (!conversation.analysis) {
      setAutoAnalysisTried(true)
      void runAnalysis(false)
    }
  }, [conversation, autoAnalysisTried, runAnalysis])

  const parsedAnalysis = useMemo(() => parseAnalysis(conversation?.analysis), [conversation?.analysis])
  const hasParsedAnalysis = parsedAnalysis !== null && parsedAnalysis !== undefined

  const analysisOverview = isRecord(parsedAnalysis)
    ? {
        overallSummary: typeof parsedAnalysis.overall_summary === 'string' ? parsedAnalysis.overall_summary : null,
        callOutcome: typeof parsedAnalysis.call_outcome === 'string' ? parsedAnalysis.call_outcome : null,
        sentiment: typeof parsedAnalysis.sentiment === 'string' ? parsedAnalysis.sentiment : null,
        leadScore:
          typeof parsedAnalysis.lead_score === 'number'
            ? parsedAnalysis.lead_score
            : typeof parsedAnalysis.lead_score === 'string'
              ? Number(parsedAnalysis.lead_score)
              : null,
        confidence: typeof parsedAnalysis.confidence === 'string' ? parsedAnalysis.confidence : null,
        intent: toStringList(parsedAnalysis.customer_intent),
        points: toStringList(parsedAnalysis.key_points),
        risks: toStringList(parsedAnalysis.objections_or_risks),
        actions: toStringList(parsedAnalysis.action_items),
        followUps: toStringList(parsedAnalysis.follow_up_recommendations),
      }
    : null

  if (loading) {
    return <div className="text-center py-12">Loading voice conversation details...</div>
  }

  if (!conversation) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/voice-conversations"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Voice Conversations
        </Link>
        <div className="card">
          <p className="text-gray-700">Voice conversation not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/admin/voice-conversations"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Voice Conversations
        </Link>
      </div>

      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Phone className="w-10 h-10" />
          <h1 className="text-3xl md:text-4xl font-bold">Voice Conversation Details</h1>
        </div>
        <p className="text-teal-100 text-lg">{conversation.customer_name || 'Unknown Customer'}</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">Duration</p>
            <p className="text-xl font-bold mt-1">
              {conversation.duration_seconds
                ? `${Math.floor(conversation.duration_seconds / 60)}m ${conversation.duration_seconds % 60}s`
                : '-'}
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">Status</p>
            <p className="text-xl font-bold mt-1">{conversation.status || '-'}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">Cost</p>
            <p className="text-xl font-bold mt-1">{conversation.cost ? `$${conversation.cost.toFixed(2)}` : '-'}</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5" /> Customer Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Name</p>
            <p className="text-base font-semibold text-gray-900">{conversation.customer_name || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </p>
            <p className="text-base text-gray-900 break-words">{conversation.customer_email || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Phone className="w-3 h-3" /> Phone
            </p>
            <p className="text-base text-gray-900">{conversation.customer_phone || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Started At
            </p>
            <p className="text-base text-gray-900">{conversation.started_at ? formatDateTime(conversation.started_at) : '-'}</p>
          </div>
        </div>
      </div>

      {conversation.recording_url && (
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 p-6 rounded-xl border border-teal-200">
          <p className="text-sm font-semibold text-teal-900 mb-3">Recording</p>
          <div className="space-y-3">
            <audio controls className="w-full">
              <source src={conversation.recording_url} />
              Your browser does not support the audio element.
            </audio>
            <a
              href={conversation.recording_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-teal-700 hover:text-teal-900 font-medium text-sm transition-colors"
            >
              <Download className="w-4 h-4 mr-2" /> Download Recording
            </a>
          </div>
        </div>
      )}

      {conversation.web_call_url && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-6 rounded-xl border border-blue-200">
          <p className="text-sm font-semibold text-blue-900 mb-3">Web Call Link</p>
          <a
            href={conversation.web_call_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium text-sm transition-colors"
          >
            <Share2 className="w-4 h-4 mr-2" /> Open Call Link
          </a>
        </div>
      )}

      {conversation.transcript ? (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-3 block">Transcript</p>
          <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 max-h-[460px] overflow-auto">
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{conversation.transcript}</p>
          </div>
        </div>
      ) : (
        <div className="card border border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">Transcript is unavailable, so AI analysis cannot be generated for this conversation.</p>
        </div>
      )}

      {conversation.summary && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Summary</p>
          <p className="text-base text-gray-600 leading-relaxed bg-blue-50 p-4 rounded-lg border border-blue-100">
            {conversation.summary}
          </p>
        </div>
      )}

      {conversation.lead_details && (
        <div>
          <p className="text-sm font-semibold text-gray-700 mb-2">Lead Details</p>
          <p className="text-base text-gray-600 leading-relaxed bg-green-50 p-4 rounded-lg border border-green-100">
            {conversation.lead_details}
          </p>
        </div>
      )}

      <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-6 border border-violet-200">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-lg font-bold text-violet-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5" /> AI Analysis
          </p>
          <button
            onClick={() => runAnalysis(true)}
            disabled={analyzing || !conversation.transcript}
            className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {analyzing ? 'Analyzing...' : 'Re-run Analysis'}
          </button>
        </div>

        {analyzing && (
          <div className="rounded-lg border border-violet-200 bg-white p-4 mb-4">
            <p className="text-sm text-violet-800">Generating transcript-based analysis...</p>
          </div>
        )}

        {!hasParsedAnalysis && !analyzing && (
          <div className="rounded-lg border border-violet-200 bg-white p-4">
            <p className="text-sm text-violet-800">No analysis available yet. Use Re-run Analysis to generate one.</p>
          </div>
        )}

        {hasParsedAnalysis && isRecord(parsedAnalysis) && analysisOverview && (
          <div className="space-y-4">
            {analysisOverview.overallSummary && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Overall Summary</p>
                <p className="text-sm text-gray-800 leading-relaxed">{analysisOverview.overallSummary}</p>
              </div>
            )}

            {analysisOverview.callOutcome && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Call Outcome</p>
                <p className="text-sm text-gray-800 leading-relaxed">{analysisOverview.callOutcome}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-violet-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Sentiment</p>
                <p className="text-sm text-gray-800">{analysisOverview.sentiment || '-'}</p>
              </div>
              <div className="rounded-lg border border-violet-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Lead Score</p>
                <p className="text-sm text-gray-800">
                  {typeof analysisOverview.leadScore === 'number' && Number.isFinite(analysisOverview.leadScore)
                    ? `${Math.round(analysisOverview.leadScore)}/100`
                    : '-'}
                </p>
              </div>
              <div className="rounded-lg border border-violet-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-1">Confidence</p>
                <p className="text-sm text-gray-800">{analysisOverview.confidence || '-'}</p>
              </div>
            </div>

            {analysisOverview.intent.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Customer Intent</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-gray-800">
                  {analysisOverview.intent.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysisOverview.points.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Key Points</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-gray-800">
                  {analysisOverview.points.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysisOverview.risks.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Objections / Risks</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-gray-800">
                  {analysisOverview.risks.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysisOverview.actions.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Action Items</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-gray-800">
                  {analysisOverview.actions.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {analysisOverview.followUps.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Follow-up Recommendations</p>
                <ul className="list-disc ml-5 space-y-1 text-sm text-gray-800">
                  {analysisOverview.followUps.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg border border-violet-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 mb-2">Complete Analysis Details</p>
              <AnalysisValue value={parsedAnalysis} />
            </div>
          </div>
        )}

        {hasParsedAnalysis && !isRecord(parsedAnalysis) && (
          <div className="rounded-lg border border-violet-200 bg-white p-4">
            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">{formatPrimitive(parsedAnalysis)}</p>
          </div>
        )}
      </div>

      <div className="card border border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <p>Created: {conversation.created_at ? formatDateTime(conversation.created_at) : '-'}</p>
          <p>Record ID: {conversation.id}</p>
        </div>
      </div>
    </div>
  )
}

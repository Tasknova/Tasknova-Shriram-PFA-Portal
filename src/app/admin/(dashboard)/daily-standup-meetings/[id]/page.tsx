'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft,
  ClipboardList,
  CalendarDays,
  Clock3,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDate, formatDateTime } from '@/lib/utils'
import { DailyStandupMeeting } from '@/types'

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parsePossiblyStringifiedJson(value: unknown, maxDepth = 4): unknown {
  let current: unknown = value

  for (let depth = 0; depth < maxDepth; depth++) {
    if (typeof current !== 'string') break

    const trimmed = current.trim()
    if (!trimmed) break

    if (!(trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('"'))) {
      break
    }

    try {
      current = JSON.parse(trimmed)
    } catch {
      break
    }
  }

  return current
}

function toReadableLines(value: unknown, parentKey = ''): string[] {
  if (value === null || value === undefined) return [parentKey ? `${parentKey}: -` : '-']

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [parentKey ? `${parentKey}: ${String(value)}` : String(value)]
  }

  if (Array.isArray(value)) {
    const lines: string[] = []
    value.forEach((item, index) => {
      const label = parentKey ? `${parentKey} ${index + 1}` : `Line ${index + 1}`
      lines.push(...toReadableLines(item, label))
    })
    return lines.length ? lines : [parentKey ? `${parentKey}: -` : '-']
  }

  if (isObject(value)) {
    const lines: string[] = []
    Object.entries(value).forEach(([key, nested]) => {
      const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
      const next = parentKey ? `${parentKey} - ${formattedKey}` : formattedKey
      lines.push(...toReadableLines(nested, next))
    })
    return lines.length ? lines : [parentKey ? `${parentKey}: -` : '-']
  }

  return [parentKey ? `${parentKey}: ${String(value)}` : String(value)]
}

function extractSummaryText(value: unknown): string {
  const parsed = parsePossiblyStringifiedJson(value)

  if (typeof parsed === 'string') return parsed
  if (!parsed) return 'No meeting summary available.'

  if (isObject(parsed)) {
    const markdown = parsed.markdown_formatted
    if (typeof markdown === 'string' && markdown.trim()) {
      return markdown
    }

    const summary = parsed.summary
    if (typeof summary === 'string' && summary.trim()) {
      return summary
    }
  }

  return toReadableLines(parsed).join('\n')
}

function getSpeakerName(item: Record<string, unknown>): string {
  if (typeof item.display_name === 'string' && item.display_name.trim()) return item.display_name
  if (typeof item.speaker_name === 'string' && item.speaker_name.trim()) return item.speaker_name
  if (typeof item.name === 'string' && item.name.trim()) return item.name
  if (typeof item.speaker === 'string' && item.speaker.trim()) return item.speaker

  if (isObject(item.speaker)) {
    const nestedSpeaker = item.speaker
    if (typeof nestedSpeaker.display_name === 'string' && nestedSpeaker.display_name.trim()) return nestedSpeaker.display_name
    if (typeof nestedSpeaker.name === 'string' && nestedSpeaker.name.trim()) return nestedSpeaker.name
    if (typeof nestedSpeaker.full_name === 'string' && nestedSpeaker.full_name.trim()) return nestedSpeaker.full_name
  }

  return 'Speaker'
}

function getDialogueText(item: Record<string, unknown>): string {
  const candidates = ['text', 'message', 'content', 'dialogue', 'utterance', 'statement'] as const

  for (const key of candidates) {
    const candidate = item[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate
  }

  if (isObject(item.payload)) {
    const nested = item.payload
    for (const key of candidates) {
      const candidate = nested[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate
    }
  }

  return ''
}

function findTranscriptContainer(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed
  if (!isObject(parsed)) return parsed

  const transcriptKeys = ['transcript', 'conversation', 'dialogues', 'messages', 'entries'] as const
  for (const key of transcriptKeys) {
    const candidate = parsed[key]
    if (candidate !== undefined) {
      return candidate
    }
  }

  return parsed
}

function extractTranscriptLines(value: unknown): string[] {
  const parsed = findTranscriptContainer(parsePossiblyStringifiedJson(value))

  if (!parsed) return ['No transcript available.']

  if (typeof parsed === 'string') {
    return parsed
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  }

  if (Array.isArray(parsed)) {
    const lines: string[] = []

    parsed.forEach((item) => {
      if (isObject(item)) {
        const speaker = getSpeakerName(item)
        const text = getDialogueText(item)

        if (text) {
          lines.push(`${speaker}: ${text}`)
          return
        }
      }

      lines.push(...toReadableLines(item))
    })

    return lines.length ? lines : ['No transcript lines available.']
  }

  return toReadableLines(parsed)
}

export default function DailyStandupMeetingDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [meeting, setMeeting] = useState<DailyStandupMeeting | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/admin/daily-standup-meetings?id=${id}`)
        if (!res.ok) throw new Error('Request failed')

        const data = await res.json()
        setMeeting(data)
      } catch {
        toast.error('Failed to fetch standup meeting details')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchDetail()
    }
  }, [id])

  const summaryText = useMemo(() => extractSummaryText(meeting?.meeting_summary), [meeting])
  const transcriptLines = useMemo(() => extractTranscriptLines(meeting?.meeting_transcript), [meeting])

  if (loading) {
    return <div className="text-center py-12">Loading standup meeting details...</div>
  }

  if (!meeting) {
    return (
      <div className="space-y-4">
        <Link href="/admin/daily-standup-meetings" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft className="w-4 h-4" /> Back to Daily Standup Meetings
        </Link>
        <div className="card">
          <p className="text-gray-700">Standup meeting record not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/admin/daily-standup-meetings" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700">
          <ArrowLeft className="w-4 h-4" /> Back to Daily Standup Meetings
        </Link>
      </div>

      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardList className="w-10 h-10" />
          <h1 className="text-3xl md:text-4xl font-bold">Standup Meeting Details</h1>
        </div>
        <p className="text-cyan-100 text-lg">{meeting.meeting_title || 'Daily Standup Meeting'}</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Meeting Date</p>
            <p className="text-lg font-bold mt-1">{meeting.meeting_date ? formatDate(meeting.meeting_date) : '-'}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase flex items-center gap-1"><Clock3 className="w-3 h-3" /> Duration</p>
            <p className="text-lg font-bold mt-1">{typeof meeting.meeting_duration === 'number' ? `${meeting.meeting_duration} min` : '-'}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Processed Status</p>
            <p className="mt-1">
              {meeting.processed ? (
                <span className="inline-flex items-center gap-1 badge badge-success"><CheckCircle2 className="w-3 h-3" />Processed</span>
              ) : (
                <span className="inline-flex items-center gap-1 badge badge-warning"><AlertTriangle className="w-3 h-3" />Pending</span>
              )}
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Processed At</p>
            <p className="text-lg font-bold mt-1">{meeting.processed_at ? formatDateTime(meeting.processed_at) : '-'}</p>
          </div>
        </div>
      </div>

      {meeting.processing_error && (
        <div className="card border border-red-200 bg-red-50">
          <p className="text-sm font-bold text-red-900 mb-2">Processing Error</p>
          <p className="text-sm text-red-800 whitespace-pre-wrap leading-relaxed">{meeting.processing_error}</p>
        </div>
      )}

      <div className="card border border-sky-200 bg-sky-50">
        <h2 className="text-lg font-bold text-sky-900 mb-3">Meeting Summary</h2>
        <div className="rounded-xl border border-sky-200 bg-white p-4">
          <div className="text-sm leading-relaxed text-slate-800 break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-bold text-slate-900 mt-4 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-3 mb-2">{children}</h3>,
                p: ({ children }) => <p className="mb-3 text-slate-800">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-slate-800">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-slate-800">{children}</ol>,
                li: ({ children }) => <li className="ml-2">{children}</li>,
                code: ({ children }) => <code className="bg-slate-100 text-slate-800 px-1 py-0.5 rounded">{children}</code>,
                pre: ({ children }) => <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg overflow-auto mb-3">{children}</pre>,
                blockquote: ({ children }) => <blockquote className="border-l-4 border-slate-300 pl-3 italic text-slate-700 mb-3">{children}</blockquote>,
              }}
            >
              {summaryText}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="card border border-indigo-200 bg-indigo-50">
        <h2 className="text-lg font-bold text-indigo-900 mb-3">Transcript</h2>
        <div className="rounded-xl border border-indigo-200 bg-white p-4 max-h-[560px] overflow-auto">
          <div className="space-y-2">
            {transcriptLines.map((line, index) => (
              <p key={index} className="text-sm text-slate-800 leading-relaxed break-words">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="card border border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <p className="inline-flex items-center gap-1"><Clock3 className="w-4 h-4" /> Created: {formatDateTime(meeting.created_at)}</p>
          <p className="inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Record ID: {meeting.id}</p>
        </div>
      </div>
    </div>
  )
}

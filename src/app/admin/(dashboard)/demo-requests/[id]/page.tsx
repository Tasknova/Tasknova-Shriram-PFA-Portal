'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  FileText,
  Globe,
  Mail,
  MailCheck,
  MapPin,
  User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { DemoRequest } from '@/types'
import { formatDate, formatDateTime } from '@/lib/utils'

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
    const currentRaw = queue.shift() || ''
    const current = currentRaw.trim()
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
      // Try additional normalizations below.
    }

    const unfenced = unwrapCodeFence(candidate)
    if (unfenced !== candidate) {
      queue.push(unfenced)
    }

    if (/^json\b/i.test(unfenced)) {
      queue.push(unfenced.replace(/^json\b\s*/i, ''))
    }

    const extracted = extractJsonSubstring(unfenced)
    if (extracted && extracted !== unfenced) {
      queue.push(extracted)
    }

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

function parseScrapedInfo(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return null

  return parseJsonLikeString(trimmed)
}

function normalizeKey(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function keyMatchesAlias(key: string, aliases: string[]): boolean {
  const normalizedKey = normalizeKey(key)
  return aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias)
    return (
      normalizedKey === normalizedAlias ||
      normalizedKey.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedKey)
    )
  })
}

function findFieldValue(value: unknown, aliases: string[], depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return undefined

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFieldValue(item, aliases, depth + 1)
      if (found !== undefined) return found
    }
    return undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keyMatchesAlias(key, aliases)) {
      return nested
    }
  }

  for (const nested of Object.values(value)) {
    const found = findFieldValue(nested, aliases, depth + 1)
    if (found !== undefined) return found
  }

  return undefined
}

function toDisplayText(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatPrimitive(value)
  }

  if (Array.isArray(value)) {
    const primitive = value
      .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
      .map((item) => formatPrimitive(item))
      .filter((item) => item !== '-')

    if (primitive.length > 0) {
      return primitive.slice(0, 5).join(', ')
    }

    return value.length > 0 ? `${value.length} item(s)` : '-'
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
      .map(([k, v]) => `${formatLabel(k)}: ${formatPrimitive(v)}`)

    if (entries.length > 0) {
      return entries.slice(0, 3).join(' | ')
    }
  }

  return valueSummary(value)
}

function getSummaryFromScrapedInfo(scrapedInfo: unknown, fallbackWebsite?: string, fallbackSize?: string) {
  const industry = toDisplayText(
    findFieldValue(scrapedInfo, ['industry', 'sector', 'domain', 'vertical'])
  )

  const websiteRaw =
    findFieldValue(scrapedInfo, ['website', 'site', 'url', 'domain']) || fallbackWebsite || null
  const website = toDisplayText(websiteRaw)

  const headcount = toDisplayText(
    findFieldValue(scrapedInfo, ['headcount', 'employee_count', 'employees', 'company_size', 'team_size']) ||
      fallbackSize ||
      null
  )

  const services = toDisplayText(
    findFieldValue(scrapedInfo, ['services', 'offerings', 'products_services', 'solutions', 'capabilities', 'products'])
  )

  return [
    { label: 'Industry', value: industry },
    { label: 'Website', value: website },
    { label: 'Headcount', value: headcount },
    { label: 'Services', value: services },
  ]
}

function toWebsiteHref(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '-') return null

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (/^(www\.)?[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed.replace(/^www\./i, 'www.')}`
  }

  return null
}

function valueSummary(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return formatPrimitive(value)
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '-'
    const primitiveItems = value
      .filter((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
      .map((item) => formatPrimitive(item))

    return primitiveItems.length > 0 ? primitiveItems.join(', ') : `${value.length} item(s)`
  }

  if (isRecord(value)) {
    const keys = Object.keys(value)
    return keys.length > 0 ? `${keys.length} field(s)` : '-'
  }

  return String(value)
}

function ScrapedValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 3) {
    return <p className="text-sm text-gray-600">{valueSummary(value)}</p>
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
              <ScrapedValue value={item} depth={depth + 1} />
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
      {entries.map(([key, nestedValue]) => (
        <div key={key} className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            {formatLabel(key)}
          </p>
          {Array.isArray(nestedValue) || isRecord(nestedValue) ? (
            <ScrapedValue value={nestedValue} depth={depth + 1} />
          ) : (
            <p className="text-sm text-gray-800 break-words">{formatPrimitive(nestedValue)}</p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function DemoRequestDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id

  const [demoRequest, setDemoRequest] = useState<DemoRequest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDemoRequest = async () => {
      try {
        const res = await fetch(`/api/admin/demo-requests?id=${id}`)
        if (!res.ok) throw new Error('Request failed')

        const data = await res.json()
        setDemoRequest(data)
      } catch {
        toast.error('Failed to fetch demo request details')
      } finally {
        setLoading(false)
      }
    }

    if (id) {
      fetchDemoRequest()
    }
  }, [id])

  const scrapedInfo = useMemo(
    () => parseScrapedInfo(demoRequest?.company_scraped_info),
    [demoRequest?.company_scraped_info]
  )
  const hasScrapedInfo = scrapedInfo !== null && scrapedInfo !== undefined

  const scrapedSummaryItems = useMemo(
    () =>
      getSummaryFromScrapedInfo(
        scrapedInfo,
        demoRequest?.company_website || undefined,
        demoRequest?.team_size || undefined
      ).filter((item) => item.value && item.value !== '-'),
    [scrapedInfo, demoRequest?.company_website, demoRequest?.team_size]
  )

  if (loading) {
    return <div className="text-center py-12">Loading demo request details...</div>
  }

  if (!demoRequest) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/demo-requests"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Demo Requests
        </Link>
        <div className="card">
          <p className="text-gray-700">Demo request not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link
          href="/admin/demo-requests"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Demo Requests
        </Link>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-10 h-10" />
          <h1 className="text-3xl md:text-4xl font-bold">Demo Request Details</h1>
        </div>
        <p className="text-blue-100 text-lg">{demoRequest.company || 'Company details'}</p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Requested On</p>
            <p className="text-xl font-bold mt-1">{formatDate(demoRequest.created_at)}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Mail Status</p>
            <p className="text-xl font-bold mt-1">{demoRequest.mail_sent ? 'Sent' : 'Pending'}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Team Size</p>
            <p className="text-xl font-bold mt-1">{demoRequest.team_size || '-'}</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
        <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
          <User className="w-5 h-5" />
          Contact Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Name</p>
            <p className="text-base font-semibold text-gray-900">{demoRequest.name || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Mail className="w-3 h-3" /> Email
            </p>
            <p className="text-base text-gray-900 break-words">{demoRequest.email || '-'}</p>
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
        <h3 className="text-lg font-bold text-purple-900 mb-4 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Company Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Company</p>
            <p className="text-base font-semibold text-gray-900">{demoRequest.company || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Role</p>
            <p className="text-base text-gray-900">{demoRequest.role || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Team Size</p>
            <p className="text-base font-medium text-gray-900">{demoRequest.team_size || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1">
              <Globe className="w-3 h-3" /> Website
            </p>
            {demoRequest.company_website ? (
              <a
                href={demoRequest.company_website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-primary-600 hover:text-primary-800 hover:underline break-all"
              >
                {demoRequest.company_website}
              </a>
            ) : (
              <p className="text-base text-gray-500">-</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
        <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Scheduling Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Preferred Date
            </p>
            <p className="text-base font-medium text-gray-900">{demoRequest.preferred_date || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1">
              <Clock className="w-3 h-3" /> Preferred Time
            </p>
            <p className="text-base font-medium text-gray-900">{demoRequest.preferred_time || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Timezone
            </p>
            <p className="text-base font-medium text-gray-900">{demoRequest.timezone || '-'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1">
              {demoRequest.mail_sent ? <MailCheck className="w-3 h-3" /> : <Mail className="w-3 h-3" />} Mail Sent
            </p>
            <p className="mt-1">
              <span className={`badge ${demoRequest.mail_sent ? 'badge-success' : 'badge-warning'}`}>
                {demoRequest.mail_sent ? 'Yes' : 'No'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {demoRequest.notes && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200">
          <p className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Notes
          </p>
          <p className="text-base text-gray-700 leading-relaxed bg-white p-4 rounded-lg border border-amber-100">
            {demoRequest.notes}
          </p>
        </div>
      )}

      {hasScrapedInfo && (
        <div className="bg-gradient-to-br from-gray-50 to-slate-100 rounded-xl p-6 border border-gray-300">
          <p className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Company Info (Scraped)
          </p>

          {scrapedSummaryItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
              {scrapedSummaryItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                    {item.label}
                  </p>
                  {item.label === 'Website' && item.value !== '-' && toWebsiteHref(String(item.value)) ? (
                    <a
                      href={toWebsiteHref(String(item.value)) || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:text-primary-800 hover:underline break-all"
                    >
                      {String(item.value)}
                    </a>
                  ) : (
                    <p className="text-sm text-gray-800 break-words">{item.value}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <ScrapedValue value={scrapedInfo} />
        </div>
      )}

      <div className="card border border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
          <p>Created: {formatDateTime(demoRequest.created_at)}</p>
          <p>Record ID: {demoRequest.id}</p>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  RotateCw,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { JobApplicant } from '@/types'
import { formatDate } from '@/lib/utils'

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatScore(value: unknown): string {
  const score = parseScore(value)
  return score === null ? 'N/A' : `${score.toFixed(1)}/10`
}

function scoreClass(value: unknown): string {
  const score = parseScore(value)

  if (score === null) return 'bg-gray-100 text-gray-700'
  if (score >= 8) return 'bg-green-100 text-green-800'
  if (score >= 6) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-800'
}

function statusClass(status: string | null | undefined): string {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'processing') return 'bg-blue-100 text-blue-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function statusLabel(status: string | null | undefined): string {
  if (status === 'completed') return 'Completed'
  if (status === 'processing') return 'Processing'
  if (status === 'failed') return 'Failed'
  return 'Not Started'
}

function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false
  return /^https?:\/\//i.test(value.trim())
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/[^\d.-]/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

interface LinkedInProfileView {
  fullName: string | null
  headline: string | null
  location: string | null
  currentRole: string | null
  currentCompany: string | null
  followers: number | null
  connections: number | null
  summary: string | null
  skills: string[]
  recentExperience: string[]
  education: string[]
  certifications: string[]
}

interface PortfolioProfileView {
  ownerName: string | null
  professionalTitle: string | null
  location: string | null
  summary: string | null
  topSkills: string[]
  projectHighlights: string[]
  experienceHighlights: string[]
  educationHighlights: string[]
}

interface ResumeProfileView {
  fullName: string | null
  email: string | null
  phone: string | null
  summary: string | null
  topSkills: string[]
  experienceHighlights: string[]
  educationHighlights: string[]
}

const PROFILE_SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Python', pattern: /\bpython\b/i },
  { label: 'JavaScript', pattern: /\bjavascript\b/i },
  { label: 'TypeScript', pattern: /\btypescript\b/i },
  { label: 'Java', pattern: /\bjava\b/i },
  { label: 'Node.js', pattern: /\bnode(?:\.js|js)?\b/i },
  { label: 'React', pattern: /\breact\b/i },
  { label: 'Next.js', pattern: /\bnext(?:\.js|js)?\b/i },
  { label: 'Django', pattern: /\bdjango\b/i },
  { label: 'FastAPI', pattern: /\bfastapi\b/i },
  { label: 'Supabase', pattern: /\bsupabase\b/i },
  { label: 'PostgreSQL', pattern: /\bpostgres(?:ql)?\b/i },
  { label: 'MySQL', pattern: /\bmysql\b/i },
  { label: 'Tailwind CSS', pattern: /\btailwind\b/i },
  { label: 'AI/ML', pattern: /\b(ai|ml|machine learning|genai|llm|nlp|rag)\b/i },
]

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  const compact = normalizeWhitespace(text)
  if (!compact) return []

  return compact
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractSkills(text: string, limit: number): string[] {
  const found: string[] = []

  for (const candidate of PROFILE_SKILL_PATTERNS) {
    if (candidate.pattern.test(text)) {
      found.push(candidate.label)
    }
  }

  return found.slice(0, limit)
}

function isLowSignalLinkedInPreview(text: string): boolean {
  const compact = normalizeWhitespace(text)
  if (!compact) return true

  const lowSignalPatterns = [
    /linkedin learning/i,
    /take a break and reconnect with your network through quick daily games/i,
    /linkedin\.com\/products\/categories/i,
    /artificial intelligence for business/i,
  ]

  return lowSignalPatterns.some((pattern) => pattern.test(compact))
}

function parseLinkedInProfile(value: unknown): LinkedInProfileView | null {
  const rec = toRecord(value)
  if (!rec) return null

  const pickString = (key: string): string | null => {
    const raw = rec[key]
    if (typeof raw !== 'string') return null
    const compact = raw.replace(/\s+/g, ' ').trim()
    return compact.length > 0 ? compact : null
  }

  const pickStringArray = (key: string): string[] => {
    const raw = rec[key]
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => String(item).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12)
  }

  const profile: LinkedInProfileView = {
    fullName: pickString('full_name'),
    headline: pickString('headline'),
    location: pickString('location'),
    currentRole: pickString('current_role'),
    currentCompany: pickString('current_company'),
    followers: toNumber(rec.followers),
    connections: toNumber(rec.connections),
    summary: pickString('summary'),
    skills: pickStringArray('skills'),
    recentExperience: pickStringArray('recent_experience'),
    education: pickStringArray('education'),
    certifications: pickStringArray('certifications'),
  }

  const hasAnyValue = Boolean(
    profile.fullName ||
    profile.headline ||
    profile.location ||
    profile.currentRole ||
    profile.currentCompany ||
    profile.summary ||
    profile.skills.length ||
    profile.recentExperience.length ||
    profile.education.length ||
    profile.certifications.length ||
    profile.followers !== null ||
    profile.connections !== null
  )

  return hasAnyValue ? profile : null
}

function parseLinkedInProfileFromScrape(data: Record<string, unknown> | null): LinkedInProfileView | null {
  if (!data) return null

  const normalized = parseLinkedInProfile(data.linkedin_profile)
  if (normalized) return normalized

  const title = typeof data.title === 'string' ? normalizeWhitespace(data.title) : ''
  const description = typeof data.description === 'string' ? normalizeWhitespace(data.description) : ''
  const excerpt = typeof data.text_excerpt === 'string' ? normalizeWhitespace(data.text_excerpt) : ''

  if (!excerpt || isLowSignalLinkedInPreview(excerpt)) {
    return null
  }

  const publicIdentifierFromUrl = typeof data.url === 'string'
    ? data.url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1]?.replace(/-/g, ' ') || null
    : null

  const inferredName = title || publicIdentifierFromUrl
  const snippets = splitSentences(excerpt)

  const profile: LinkedInProfileView = {
    fullName: inferredName ? inferredName.replace(/\b\w/g, (ch) => ch.toUpperCase()) : null,
    headline: description || null,
    location: null,
    currentRole: null,
    currentCompany: null,
    followers: null,
    connections: null,
    summary: snippets.slice(0, 2).join(' ') || null,
    skills: extractSkills(excerpt.toLowerCase(), 10),
    recentExperience: snippets.filter((line) => /\b(experience|intern|developer|engineer|worked|built|deployed)\b/i.test(line)).slice(0, 5),
    education: snippets.filter((line) => /\b(education|bachelor|master|university|college)\b/i.test(line)).slice(0, 4),
    certifications: snippets.filter((line) => /\b(certification|certified|credential)\b/i.test(line)).slice(0, 4),
  }

  const hasAnyValue = Boolean(
    profile.fullName ||
    profile.headline ||
    profile.summary ||
    profile.skills.length ||
    profile.recentExperience.length ||
    profile.education.length ||
    profile.certifications.length
  )

  return hasAnyValue ? profile : null
}

function parsePortfolioProfile(value: unknown): PortfolioProfileView | null {
  const rec = toRecord(value)
  if (!rec) return null

  const pickString = (key: string): string | null => {
    const raw = rec[key]
    if (typeof raw !== 'string') return null
    const compact = raw.replace(/\s+/g, ' ').trim()
    return compact.length > 0 ? compact : null
  }

  const pickStringArray = (key: string, max: number): string[] => {
    const raw = rec[key]
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) => String(item).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, max)
  }

  const profile: PortfolioProfileView = {
    ownerName: pickString('owner_name'),
    professionalTitle: pickString('professional_title'),
    location: pickString('location'),
    summary: pickString('summary'),
    topSkills: pickStringArray('top_skills', 12),
    projectHighlights: pickStringArray('project_highlights', 6),
    experienceHighlights: pickStringArray('experience_highlights', 6),
    educationHighlights: pickStringArray('education_highlights', 6),
  }

  const hasAnyValue = Boolean(
    profile.ownerName ||
    profile.professionalTitle ||
    profile.location ||
    profile.summary ||
    profile.topSkills.length ||
    profile.projectHighlights.length ||
    profile.experienceHighlights.length ||
    profile.educationHighlights.length
  )

  return hasAnyValue ? profile : null
}

function parseResumeProfile(text: string | null | undefined): ResumeProfileView | null {
  if (!text) return null
  const compact = normalizeWhitespace(text)
  if (!compact) return null

  const email = compact.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null
  const phone = compact.match(/(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){10,12}/)?.[0]?.replace(/\s+/g, '') || null
  const name = compact.split(/\||\n/)[0]?.trim() || null

  const lines = splitSentences(compact)
  const summary = lines.slice(0, 2).join(' ') || null
  const topSkills = extractSkills(compact.toLowerCase(), 12)
  const experienceHighlights = lines.filter((line) => /\b(experience|intern|developer|engineer|built|deployed|implemented|optimized)\b/i.test(line)).slice(0, 6)
  const educationHighlights = lines.filter((line) => /\b(education|bachelor|master|diploma|university|college|cgpa|percentage)\b/i.test(line)).slice(0, 5)

  const profile: ResumeProfileView = {
    fullName: name && name.length <= 60 ? name : null,
    email,
    phone,
    summary,
    topSkills,
    experienceHighlights,
    educationHighlights,
  }

  const hasAnyValue = Boolean(
    profile.fullName ||
    profile.email ||
    profile.phone ||
    profile.summary ||
    profile.topSkills.length ||
    profile.experienceHighlights.length ||
    profile.educationHighlights.length
  )

  return hasAnyValue ? profile : null
}

function parseEvidenceList(value: unknown, keyLabel: 'strength' | 'concern') {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const rec = toRecord(item)
      if (!rec) return null

      const point = typeof rec[keyLabel] === 'string' ? rec[keyLabel] : ''
      const source = typeof rec.source === 'string' ? rec.source : 'unknown'
      const evidence = typeof rec.evidence === 'string' ? rec.evidence : ''

      if (!point) return null

      return { point, source, evidence }
    })
    .filter((item): item is { point: string; source: string; evidence: string } => item !== null)
}

function parseInterviewQuestions(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      const rec = toRecord(item)
      if (!rec) return null

      const question = typeof rec.question === 'string' ? rec.question : ''
      const purpose = typeof rec.purpose === 'string' ? rec.purpose : ''

      if (!question) return null
      return { question, purpose }
    })
    .filter((item): item is { question: string; purpose: string } => item !== null)
}

export default function ApplicantAnalysisPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const applicantId = params?.id

  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [showCoverLetter, setShowCoverLetter] = useState(false)
  const [applicant, setApplicant] = useState<JobApplicant | null>(null)

  const fetchApplicant = useCallback(async () => {
    if (!applicantId) return

    try {
      const res = await fetch(`/api/admin/job-applicants?id=${encodeURIComponent(applicantId)}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch applicant')
      }

      setApplicant(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch applicant'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [applicantId])

  useEffect(() => {
    fetchApplicant()
  }, [fetchApplicant])

  const runAnalysis = async (forceRescrape: boolean) => {
    if (!applicantId) return

    setAnalyzing(true)
    try {
      const res = await fetch('/api/admin/job-applicants/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'single',
          applicantId,
          forceRescrape,
        }),
      })

      const payload = await res.json()

      if (!res.ok || !payload.success) {
        throw new Error(payload.error || payload.message || 'Failed to analyze candidate')
      }

      toast.success(`Analysis complete: ${formatScore(payload.score)}`)
      await fetchApplicant()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to analyze candidate'
      toast.error(message)
    } finally {
      setAnalyzing(false)
    }
  }

  const analysis = useMemo(() => toRecord(applicant?.analysis_data), [applicant?.analysis_data])
  const scoringBreakdown = toRecord(analysis?.scoring_breakdown)
  const strengthsWithEvidence = parseEvidenceList(analysis?.strengths_with_evidence, 'strength')
  const concernsWithEvidence = parseEvidenceList(analysis?.concerns_with_evidence, 'concern')
  const interviewQuestionBank = parseInterviewQuestions(analysis?.interview_question_bank)

  if (loading) {
    return <div className="text-center py-12">Loading applicant analysis...</div>
  }

  if (!applicant) {
    return <div className="text-center py-12">Applicant not found.</div>
  }

  const mailtoSchedule = `mailto:${encodeURIComponent(applicant.email)}?subject=${encodeURIComponent(`Interview Scheduling - ${applicant.full_name}`)}`

  const linkedinData = toRecord(applicant.linkedin_scraped_data)
  const linkedinProfile = parseLinkedInProfileFromScrape(linkedinData)
  const portfolioData = toRecord(applicant.portfolio_scraped_data)
  const portfolioProfile = parsePortfolioProfile(portfolioData?.portfolio_profile)
  const resumeProfile = parseResumeProfile(applicant.resume_extracted_text)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <button
              onClick={() => router.push('/admin/job-applicants')}
              className="inline-flex items-center gap-2 text-blue-100 hover:text-white mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Applicants
            </button>
            <h1 className="text-3xl font-bold">{applicant.full_name}</h1>
            <p className="text-blue-100 mt-1">Detailed job applicant analysis and evidence</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => runAnalysis(false)}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {analyzing ? 'Analyzing...' : 'Analyze Candidate'}
            </button>
            <button
              onClick={() => runAnalysis(true)}
              disabled={analyzing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-white font-medium disabled:opacity-60"
            >
              <RotateCw className="w-4 h-4" />
              {analyzing ? 'Processing...' : 'Re-Analyze'}
            </button>
            <a
              href={mailtoSchedule}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium"
            >
              <CalendarClock className="w-4 h-4" />
              Schedule Interview
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">Final Score</p>
          <p className="mt-1">
            <span className={`px-2 py-1 text-sm rounded-full font-semibold ${scoreClass(applicant.ai_score)}`}>
              {formatScore(applicant.ai_score)}
            </span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">Status</p>
          <p className="mt-1">
            <span className={`px-2 py-1 text-sm rounded-full font-semibold ${statusClass(applicant.analysis_status)}`}>
              {statusLabel(applicant.analysis_status)}
            </span>
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">Applied</p>
          <p className="mt-1 text-gray-800">{formatDate(applicant.created_at)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 uppercase font-semibold">Analyzed At</p>
          <p className="mt-1 text-gray-800">{applicant.analyzed_at ? formatDate(applicant.analyzed_at) : '-'}</p>
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Applicant Inputs</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-gray-700">{applicant.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Phone</label>
            <p className="mt-1 text-gray-700">{applicant.phone || '-'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Experience</label>
            <p className="mt-1 text-gray-700">{applicant.experience_years ?? 0} years</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Job Role</label>
            <p className="mt-1 text-gray-700">{applicant.job_opening?.title || '-'}</p>
          </div>
        </div>

        {applicant.portfolio_url && (
          <div>
            <label className="text-sm font-medium text-gray-700">Portfolio</label>
            <a
              href={applicant.portfolio_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              <ExternalLink className="w-4 h-4" />
              View Portfolio
            </a>
          </div>
        )}

        {applicant.resume_url && (
          <div>
            <label className="text-sm font-medium text-gray-700">Resume</label>
            <a
              href={applicant.resume_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              <ExternalLink className="w-4 h-4" />
              View Resume
            </a>
          </div>
        )}

        {applicant.linkedin_url && (
          <div>
            <label className="text-sm font-medium text-gray-700">LinkedIn</label>
            <a
              href={applicant.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
            >
              <ExternalLink className="w-4 h-4" />
              View LinkedIn Profile
            </a>
          </div>
        )}

        {applicant.cover_letter && (
          <div>
            <label className="text-sm font-medium text-gray-700">Cover Letter</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {isHttpUrl(applicant.cover_letter) ? (
                <a
                  href={applicant.cover_letter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Cover Letter
                </a>
              ) : (
                <button
                  onClick={() => setShowCoverLetter((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700"
                >
                  <UserCheck className="w-4 h-4" />
                  {showCoverLetter ? 'Hide Cover Letter' : 'Show Cover Letter'}
                </button>
              )}
            </div>
            {!isHttpUrl(applicant.cover_letter) && showCoverLetter && (
              <pre className="mt-3 text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap border border-gray-200">
                {applicant.cover_letter}
              </pre>
            )}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-900">Detailed Analysis</h2>

        {applicant.ai_score_reasoning && (
          <div>
            <label className="text-sm font-medium text-gray-700">Summary</label>
            <p className="mt-1 text-gray-700">{applicant.ai_score_reasoning}</p>
          </div>
        )}

        {applicant.analysis_error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            <span className="font-semibold">Analysis Error:</span> {applicant.analysis_error}
          </div>
        )}

        {analysis && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border bg-gray-50">
                <p className="text-xs font-semibold uppercase text-gray-500">Hiring Recommendation</p>
                <p className="mt-1 text-gray-800 font-semibold">{String(analysis.hiring_recommendation || 'N/A')}</p>
              </div>
              <div className="p-4 rounded-lg border bg-gray-50">
                <p className="text-xs font-semibold uppercase text-gray-500">Confidence</p>
                <p className="mt-1 text-gray-800 font-semibold">{String(analysis.confidence || 'N/A')}</p>
              </div>
              <div className="p-4 rounded-lg border bg-gray-50">
                <p className="text-xs font-semibold uppercase text-gray-500">Generated At</p>
                <p className="mt-1 text-gray-800 font-semibold">{typeof analysis.generated_at === 'string' ? formatDate(analysis.generated_at) : '-'}</p>
              </div>
            </div>

            {typeof analysis.recommendation_reasoning === 'string' && analysis.recommendation_reasoning && (
              <div>
                <label className="text-sm font-medium text-gray-700">Recommendation Reasoning</label>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap">{analysis.recommendation_reasoning}</p>
              </div>
            )}

            {typeof analysis.detailed_reasoning === 'string' && analysis.detailed_reasoning && (
              <div>
                <label className="text-sm font-medium text-gray-700">Detailed Reasoning</label>
                <p className="mt-1 text-gray-700 whitespace-pre-wrap">{analysis.detailed_reasoning}</p>
              </div>
            )}

            {scoringBreakdown && (
              <div>
                <label className="text-sm font-medium text-gray-700">Scoring Breakdown</label>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-5 gap-3">
                  {Object.entries(scoringBreakdown).map(([key, value]) => (
                    <div key={key} className="p-3 rounded border bg-gray-50">
                      <p className="text-xs uppercase text-gray-500 font-semibold">{key.replaceAll('_', ' ')}</p>
                      <p className="text-sm text-gray-800 mt-1">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toStringArray(analysis.good_points).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Good Points</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.good_points).map((item, idx) => (
                    <li key={`good-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {toStringArray(analysis.bad_points).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Bad Points / Risks</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.bad_points).map((item, idx) => (
                    <li key={`bad-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {strengthsWithEvidence.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Strengths With Evidence</label>
                <div className="mt-2 space-y-2">
                  {strengthsWithEvidence.map((item, idx) => (
                    <div key={`strength-${idx}`} className="p-3 rounded border bg-green-50">
                      <p className="text-sm font-semibold text-green-900">{item.point}</p>
                      <p className="text-xs text-green-700 mt-1">Source: {item.source}</p>
                      <p className="text-sm text-green-800 mt-1">{item.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {concernsWithEvidence.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Concerns With Evidence</label>
                <div className="mt-2 space-y-2">
                  {concernsWithEvidence.map((item, idx) => (
                    <div key={`concern-${idx}`} className="p-3 rounded border bg-red-50">
                      <p className="text-sm font-semibold text-red-900">{item.point}</p>
                      <p className="text-xs text-red-700 mt-1">Source: {item.source}</p>
                      <p className="text-sm text-red-800 mt-1">{item.evidence}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {toStringArray(analysis.matched_requirements).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Matched JD Requirements</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.matched_requirements).map((item, idx) => (
                    <li key={`match-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {toStringArray(analysis.missing_requirements).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Missing JD Requirements</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.missing_requirements).map((item, idx) => (
                    <li key={`miss-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {toStringArray(analysis.red_flags).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Red Flags</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.red_flags).map((item, idx) => (
                    <li key={`flag-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {toStringArray(analysis.interview_focus_areas).length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Interview Focus Areas</label>
                <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-gray-700">
                  {toStringArray(analysis.interview_focus_areas).map((item, idx) => (
                    <li key={`focus-${idx}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {interviewQuestionBank.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Interview Question Bank</label>
                <div className="mt-2 space-y-2">
                  {interviewQuestionBank.map((item, idx) => (
                    <div key={`q-${idx}`} className="p-3 rounded border bg-gray-50">
                      <p className="text-sm font-semibold text-gray-900">{item.question}</p>
                      <p className="text-sm text-gray-600 mt-1">{item.purpose}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Scraped Source Data</h2>

        {linkedinData && (
          <div>
            <label className="text-sm font-medium text-gray-700">LinkedIn Scrape</label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Status:</span> {String(linkedinData.success)}
              </div>
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Method:</span> {String(linkedinData.source_method || 'direct')}
              </div>
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Text Length:</span> {String(linkedinData.text_length || 0)}
              </div>
            </div>
            {linkedinProfile && (
              <div className="mt-4 p-4 rounded-xl border bg-blue-50/50 space-y-3">
                <p className="text-sm font-semibold text-blue-900">Normalized LinkedIn Profile</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-blue-900">
                  {linkedinProfile.fullName && <div><span className="font-semibold">Name:</span> {linkedinProfile.fullName}</div>}
                  {linkedinProfile.headline && <div><span className="font-semibold">Headline:</span> {linkedinProfile.headline}</div>}
                  {linkedinProfile.currentRole && <div><span className="font-semibold">Current Role:</span> {linkedinProfile.currentRole}</div>}
                  {linkedinProfile.currentCompany && <div><span className="font-semibold">Current Company:</span> {linkedinProfile.currentCompany}</div>}
                  {linkedinProfile.location && <div><span className="font-semibold">Location:</span> {linkedinProfile.location}</div>}
                  {linkedinProfile.followers !== null && <div><span className="font-semibold">Followers:</span> {linkedinProfile.followers}</div>}
                  {linkedinProfile.connections !== null && <div><span className="font-semibold">Connections:</span> {linkedinProfile.connections}</div>}
                </div>

                {linkedinProfile.summary && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">About</p>
                    <p className="mt-1 text-sm text-blue-900 whitespace-pre-wrap">{linkedinProfile.summary}</p>
                  </div>
                )}

                {linkedinProfile.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Skills</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {linkedinProfile.skills.map((skill, idx) => (
                        <span key={`skill-${idx}`} className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {linkedinProfile.recentExperience.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Recent Experience</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-blue-900">
                      {linkedinProfile.recentExperience.map((item, idx) => (
                        <li key={`exp-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {linkedinProfile.education.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Education</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-blue-900">
                      {linkedinProfile.education.map((item, idx) => (
                        <li key={`edu-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {linkedinProfile.certifications.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Certifications</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-blue-900">
                      {linkedinProfile.certifications.map((item, idx) => (
                        <li key={`cert-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!linkedinProfile && typeof linkedinData.text_excerpt === 'string' && linkedinData.text_excerpt && (
              <div className="mt-3 text-sm text-gray-700 rounded border bg-gray-50 p-3">
                Unable to build a clean LinkedIn profile from scraped content. Please use Re-Analyze after updating LinkedIn source.
              </div>
            )}
            {typeof linkedinData.error === 'string' && linkedinData.error && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded whitespace-pre-wrap">
                {linkedinData.error}
              </div>
            )}
            {(!linkedinData.text_excerpt || String(linkedinData.text_excerpt).trim().length === 0) && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded">
                No LinkedIn text excerpt was captured.
              </div>
            )}
          </div>
        )}

        {portfolioData && (
          <div>
            <label className="text-sm font-medium text-gray-700">Portfolio Scrape</label>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Status:</span> {String(portfolioData.success)}
              </div>
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Method:</span> {String(portfolioData.source_method || 'direct')}
              </div>
              <div className="p-3 rounded border bg-gray-50 text-sm">
                <span className="font-semibold">Text Length:</span> {String(portfolioData.text_length || 0)}
              </div>
            </div>
            {portfolioProfile && (
              <div className="mt-4 p-4 rounded-xl border bg-emerald-50/60 space-y-3">
                <p className="text-sm font-semibold text-emerald-900">Normalized Portfolio Profile</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-emerald-900">
                  {portfolioProfile.ownerName && <div><span className="font-semibold">Name:</span> {portfolioProfile.ownerName}</div>}
                  {portfolioProfile.professionalTitle && <div><span className="font-semibold">Title:</span> {portfolioProfile.professionalTitle}</div>}
                  {portfolioProfile.location && <div><span className="font-semibold">Location:</span> {portfolioProfile.location}</div>}
                </div>

                {portfolioProfile.summary && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Overview</p>
                    <p className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">{portfolioProfile.summary}</p>
                  </div>
                )}

                {portfolioProfile.topSkills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Top Skills</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {portfolioProfile.topSkills.map((skill, idx) => (
                        <span key={`portfolio-skill-${idx}`} className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {portfolioProfile.projectHighlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Project Highlights</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-emerald-900">
                      {portfolioProfile.projectHighlights.map((item, idx) => (
                        <li key={`portfolio-project-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {portfolioProfile.experienceHighlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Experience Highlights</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-emerald-900">
                      {portfolioProfile.experienceHighlights.map((item, idx) => (
                        <li key={`portfolio-exp-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {portfolioProfile.educationHighlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Education Highlights</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-emerald-900">
                      {portfolioProfile.educationHighlights.map((item, idx) => (
                        <li key={`portfolio-edu-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {!portfolioProfile && typeof portfolioData.text_excerpt === 'string' && portfolioData.text_excerpt && (
              <div className="mt-3 text-sm text-gray-700 rounded border bg-gray-50 p-3">
                {String(portfolioData.text_excerpt).slice(0, 500)}
              </div>
            )}
            {typeof portfolioData.error === 'string' && portfolioData.error && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded whitespace-pre-wrap">
                {portfolioData.error}
              </div>
            )}
            {(!portfolioData.text_excerpt || String(portfolioData.text_excerpt).trim().length === 0) && (
              <div className="mt-3 text-xs bg-amber-50 border border-amber-200 text-amber-700 p-3 rounded">
                No portfolio text excerpt was captured.
              </div>
            )}
          </div>
        )}

        {applicant.resume_extracted_text && (
          <div>
            <label className="text-sm font-medium text-gray-700">Resume Extracted Text (from Resume file)</label>
            {resumeProfile ? (
              <div className="mt-2 p-4 rounded-xl border bg-violet-50/60 space-y-3">
                <p className="text-sm font-semibold text-violet-900">Normalized Resume Profile</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-violet-900">
                  {resumeProfile.fullName && <div><span className="font-semibold">Name:</span> {resumeProfile.fullName}</div>}
                  {resumeProfile.email && <div><span className="font-semibold">Email:</span> {resumeProfile.email}</div>}
                  {resumeProfile.phone && <div><span className="font-semibold">Phone:</span> {resumeProfile.phone}</div>}
                </div>

                {resumeProfile.summary && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Overview</p>
                    <p className="mt-1 text-sm text-violet-900 whitespace-pre-wrap">{resumeProfile.summary}</p>
                  </div>
                )}

                {resumeProfile.topSkills.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Top Skills</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {resumeProfile.topSkills.map((skill, idx) => (
                        <span key={`resume-skill-${idx}`} className="px-2 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-800 border border-violet-200">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {resumeProfile.experienceHighlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Experience Highlights</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-violet-900">
                      {resumeProfile.experienceHighlights.map((item, idx) => (
                        <li key={`resume-exp-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {resumeProfile.educationHighlights.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Education Highlights</p>
                    <ul className="mt-2 list-disc ml-5 space-y-1 text-sm text-violet-900">
                      {resumeProfile.educationHighlights.map((item, idx) => (
                        <li key={`resume-edu-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 text-sm text-gray-700 rounded border bg-gray-50 p-3">
                {applicant.resume_extracted_text.slice(0, 700)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

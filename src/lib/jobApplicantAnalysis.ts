import { z } from 'zod'

const ANALYSIS_MODEL = 'gemini-2.5-flash'
const MAX_SOURCE_TEXT = 8000
const MAX_PROMPT_TEXT = 12000

const analysisSchema = z.object({
  score_out_of_10: z.number().min(0).max(10),
  overall_summary: z.string().min(1),
  detailed_reasoning: z.string().min(1),
  hiring_recommendation: z.enum(['strong_yes', 'yes', 'maybe', 'no']).default('maybe'),
  recommendation_reasoning: z.string().default(''),
  good_points: z.array(z.string()).default([]),
  bad_points: z.array(z.string()).default([]),
  matched_requirements: z.array(z.string()).default([]),
  missing_requirements: z.array(z.string()).default([]),
  red_flags: z.array(z.string()).default([]),
  interview_focus_areas: z.array(z.string()).default([]),
  strengths_with_evidence: z
    .array(
      z.object({
        strength: z.string(),
        source: z.enum(['resume', 'linkedin', 'portfolio', 'cover_letter', 'jd']),
        evidence: z.string(),
      })
    )
    .default([]),
  concerns_with_evidence: z
    .array(
      z.object({
        concern: z.string(),
        source: z.enum(['resume', 'linkedin', 'portfolio', 'cover_letter', 'jd']),
        evidence: z.string(),
      })
    )
    .default([]),
  interview_question_bank: z
    .array(
      z.object({
        question: z.string(),
        purpose: z.string(),
      })
    )
    .default([]),
  scoring_breakdown: z
    .object({
      technical_fit: z.number().min(0).max(10),
      experience_fit: z.number().min(0).max(10),
      communication_fit: z.number().min(0).max(10),
      project_quality: z.number().min(0).max(10),
      role_alignment: z.number().min(0).max(10),
    })
    .optional(),
  confidence: z.enum(['low', 'medium', 'high']).default('medium'),
  component_scores: z
    .object({
      resume: z.number().min(0).max(10),
      linkedin: z.number().min(0).max(10),
      portfolio: z.number().min(0).max(10),
      cover_letter: z.number().min(0).max(10),
      jd_alignment: z.number().min(0).max(10),
    })
    .optional(),
  evidence: z
    .array(
      z.object({
        point: z.string(),
        source: z.enum(['resume', 'linkedin', 'portfolio', 'cover_letter', 'jd']),
        quote: z.string(),
      })
    )
    .default([]),
})

export type ApplicantAnalysisOutput = z.infer<typeof analysisSchema> & {
  generated_at: string
  source_coverage: {
    resume: boolean
    linkedin: boolean
    portfolio: boolean
    cover_letter: boolean
  }
}

export interface JobApplicantRecord {
  id: string
  job_id: string | null
  full_name: string
  email: string
  phone: string | null
  experience_years: number | null
  portfolio_url: string | null
  resume_url: string | null
  cover_letter: string | null
  linkedin_url: string | null
  linkedin_scraped_data: Record<string, unknown> | null
  portfolio_scraped_data: Record<string, unknown> | null
  resume_extracted_text: string | null
}

export interface JobOpeningRecord {
  id: string
  title: string
  department: string | null
  location: string | null
  type: string | null
  description: string | null
  about: string | null
  responsibilities: unknown
  skills: unknown
}

export interface ScrapedSourceData {
  url: string
  success: boolean
  status_code: number | null
  title: string | null
  description: string | null
  text_excerpt: string | null
  text_length: number
  source_method?: 'direct' | 'jina_fallback' | 'apify'
  fallback_used?: boolean
  linkedin_profile?: LinkedInProfileSummary
  portfolio_profile?: PortfolioProfileSummary
  fetched_at: string
  error: string | null
}

export interface LinkedInProfileSummary {
  full_name: string | null
  headline: string | null
  location: string | null
  current_role: string | null
  current_company: string | null
  followers: number | null
  connections: number | null
  summary: string | null
  skills: string[]
  recent_experience: string[]
  education: string[]
  certifications: string[]
}

export interface PortfolioProfileSummary {
  owner_name: string | null
  professional_title: string | null
  location: string | null
  summary: string | null
  top_skills: string[]
  project_highlights: string[]
  experience_highlights: string[]
  education_highlights: string[]
}

export interface ResumeExtractionResult {
  success: boolean
  text: string | null
  mime_type: string | null
  file_name: string | null
  bytes: number
  error: string | null
}

interface AnalyzeResult {
  analysis: ApplicantAnalysisOutput
  linkedinScrapedData: ScrapedSourceData | Record<string, unknown> | null
  portfolioScrapedData: ScrapedSourceData | Record<string, unknown> | null
  resumeExtraction: ResumeExtractionResult
}

function truncateText(input: string | null | undefined, maxLength: number): string {
  if (!input) return ''
  const compact = input.replace(/\s+/g, ' ').trim()
  return compact.length > maxLength ? compact.slice(0, maxLength) : compact
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean)
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function extractJsonObject(text: string): unknown {
  const directParse = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  })()

  if (directParse) {
    return directParse
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')

  if (first === -1 || last === -1 || last <= first) {
    throw new Error('Model response did not contain JSON')
  }

  const raw = text.slice(first, last + 1)
  return JSON.parse(raw)
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TasknovaBot/1.0; +https://tasknova.io)',
        Accept: 'text/html,application/pdf,text/plain,*/*',
      },
      signal: controller.signal,
      cache: 'no-store',
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchViaJinaFallback(url: string): Promise<{ text: string; length: number } | null> {
  try {
    const normalized = url.replace(/^https?:\/\//i, '')
    const jinaUrl = `https://r.jina.ai/http://${normalized}`
    const response = await fetchWithTimeout(jinaUrl, 20000)

    if (!response.ok) {
      return null
    }

    const text = await response.text()
    const compact = truncateText(text, MAX_SOURCE_TEXT)

    if (!compact || compact.length < 120) {
      return null
    }

    // Low-signal fallback output from blocked LinkedIn pages is not useful for analysis.
    if (/target url returned error\s*999|warning:\s*this page maybe not yet fully loaded/i.test(compact)) {
      return null
    }

    return {
      text: compact,
      length: compact.length,
    }
  } catch {
    return null
  }
}

function collectStringValues(value: unknown, out: string[], depth: number = 0): void {
  if (depth > 4 || out.length > 200) return

  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim()
    if (normalized.length > 0) {
      out.push(normalized)
    }
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, out, depth + 1)
      if (out.length > 200) break
    }
    return
  }

  if (value && typeof value === 'object') {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStringValues(entry, out, depth + 1)
      if (out.length > 200) break
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const compact = value.replace(/\s+/g, ' ').trim()
  return compact.length > 0 ? compact : null
}

function asNumber(value: unknown): number | null {
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

function asStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const extractString = (item: unknown): string | null => {
    const direct = asString(item)
    if (direct) {
      return direct
    }

    const record = asRecord(item)
    if (!record) {
      return null
    }

    return (
      asString(record.name) ||
      asString(record.title) ||
      asString(record.skill) ||
      asString(record.label) ||
      null
    )
  }

  const deduped = Array.from(
    new Set(
      value
        .map((item) => extractString(item))
        .filter((item): item is string => Boolean(item))
    )
  )

  return deduped.slice(0, limit)
}

function formatLinkedInDate(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const month = asNumber(record.month)
  const year = asNumber(record.year)

  if (!year) {
    return null
  }

  if (month && month >= 1 && month <= 12) {
    return `${month}/${year}`
  }

  return String(year)
}

function formatLinkedInTimePeriod(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) {
    return null
  }

  const start = formatLinkedInDate(record.startDate)
  const end = formatLinkedInDate(record.endDate)

  if (!start && !end) {
    return null
  }

  return `${start || '?'} - ${end || 'Present'}`
}

function summarizeLinkedInPositions(value: unknown): {
  lines: string[]
  currentRole: string | null
  currentCompany: string | null
} {
  if (!Array.isArray(value)) {
    return {
      lines: [],
      currentRole: null,
      currentCompany: null,
    }
  }

  const lines: string[] = []
  let currentRole: string | null = null
  let currentCompany: string | null = null

  for (const item of value) {
    const position = asRecord(item)
    if (!position) continue

    const title = asString(position.title) || asString(position.jobTitle)
    const company = asString(asRecord(position.company)?.name) || asString(position.companyName)
    const location = asString(position.locationName)
    const duration = asString(position.totalDuration) || formatLinkedInTimePeriod(position.timePeriod)

    if (!currentRole && title) {
      currentRole = title
    }

    if (!currentCompany && company) {
      currentCompany = company
    }

    const roleCompany = [title, company].filter(Boolean).join(' at ')
    const details = [duration, location].filter(Boolean).join(' | ')
    const description = asString(position.description)
    const line = [roleCompany, details, description].filter(Boolean).join(' - ')

    if (line) {
      lines.push(line)
    }

    if (lines.length >= 5) {
      break
    }
  }

  return {
    lines,
    currentRole,
    currentCompany,
  }
}

function summarizeLinkedInEducation(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const lines: string[] = []

  for (const item of value) {
    const education = asRecord(item)
    if (!education) continue

    const school = asString(education.schoolName)
    const degree = asString(education.degreeName)
    const field = asString(education.fieldOfStudy)
    const period = formatLinkedInTimePeriod(education.timePeriod)

    const line = [
      [degree, field].filter(Boolean).join(' in '),
      school,
      period,
    ]
      .filter(Boolean)
      .join(' - ')

    if (line) {
      lines.push(line)
    }

    if (lines.length >= 4) {
      break
    }
  }

  return lines
}

function summarizeLinkedInCertifications(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const lines: string[] = []

  for (const item of value) {
    const cert = asRecord(item)
    if (!cert) continue

    const name = asString(cert.name)
    const authority = asString(cert.authority)
    const line = [name, authority].filter(Boolean).join(' - ')

    if (line) {
      lines.push(line)
    }

    if (lines.length >= 6) {
      break
    }
  }

  return lines
}

function buildLinkedInProfileSummary(profile: Record<string, unknown>): LinkedInProfileSummary {
  const firstName = asString(profile.firstName)
  const lastName = asString(profile.lastName)
  const explicitName =
    asString(profile.fullName) ||
    asString(profile.name) ||
    asString(profile.profileName) ||
    asString(profile.full_name)
  const fullName = explicitName || [firstName, lastName].filter(Boolean).join(' ') || null

  const positions = summarizeLinkedInPositions(
    profile.positions || profile.experience || profile.experiences || profile.currentPositions
  )

  const skillsValue = profile.skills || profile.skillSet || profile.skill_set
  const educationValue = profile.educations || profile.education
  const certificationsValue = profile.certifications || profile.licenses || profile.licenseAndCertificates

  return {
    full_name: fullName,
    headline:
      asString(profile.headline) ||
      asString(profile.position) ||
      asString(profile.occupation) ||
      asString(profile.title),
    location:
      asString(profile.geoLocationName) ||
      asString(profile.geoCountryName) ||
      asString(profile.location) ||
      asString(profile.country),
    current_role:
      asString(profile.jobTitle) ||
      asString(profile.currentPosition) ||
      asString(profile.position) ||
      positions.currentRole,
    current_company:
      asString(profile.currentCompany) ||
      asString(profile.companyName) ||
      asString(profile.company) ||
      positions.currentCompany,
    followers: asNumber(profile.followerCount) ?? asNumber(profile.followers),
    connections: asNumber(profile.connectionsCount) ?? asNumber(profile.connections),
    summary:
      asString(profile.summary) ||
      asString(profile.about) ||
      asString(profile.biography) ||
      asString(profile.description),
    skills: asStringArray(skillsValue, 12),
    recent_experience: positions.lines,
    education: summarizeLinkedInEducation(educationValue),
    certifications: summarizeLinkedInCertifications(certificationsValue),
  }
}

function buildLinkedInTextExcerpt(summary: LinkedInProfileSummary): string {
  const sections: string[] = []

  sections.push('LinkedIn Profile Summary')
  if (summary.full_name) sections.push(`Name: ${summary.full_name}`)
  if (summary.headline) sections.push(`Headline: ${summary.headline}`)
  if (summary.current_role) sections.push(`Current Role: ${summary.current_role}`)
  if (summary.current_company) sections.push(`Current Company: ${summary.current_company}`)
  if (summary.location) sections.push(`Location: ${summary.location}`)
  if (summary.followers !== null) sections.push(`Followers: ${summary.followers}`)
  if (summary.connections !== null) sections.push(`Connections: ${summary.connections}`)

  if (summary.summary) {
    sections.push('')
    sections.push(`About: ${summary.summary}`)
  }

  if (summary.skills.length > 0) {
    sections.push('')
    sections.push(`Skills: ${summary.skills.join(', ')}`)
  }

  if (summary.recent_experience.length > 0) {
    sections.push('')
    sections.push('Experience:')
    for (const item of summary.recent_experience) {
      sections.push(`- ${item}`)
    }
  }

  if (summary.education.length > 0) {
    sections.push('')
    sections.push('Education:')
    for (const item of summary.education) {
      sections.push(`- ${item}`)
    }
  }

  if (summary.certifications.length > 0) {
    sections.push('')
    sections.push('Certifications:')
    for (const item of summary.certifications) {
      sections.push(`- ${item}`)
    }
  }

  return truncateText(sections.join('\n'), MAX_SOURCE_TEXT)
}

const PORTFOLIO_SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Python', pattern: /\bpython\b/i },
  { label: 'JavaScript', pattern: /\bjavascript\b/i },
  { label: 'TypeScript', pattern: /\btypescript\b/i },
  { label: 'Java', pattern: /\bjava\b/i },
  { label: 'C++', pattern: /c\+\+/i },
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

function splitIntoSentences(text: string): string[] {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return []

  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean)

  if (sentences.length > 0) {
    return sentences
  }

  return compact
    .split(/\s{2,}/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractPortfolioSkills(text: string): string[] {
  const found: string[] = []

  for (const candidate of PORTFOLIO_SKILL_PATTERNS) {
    if (candidate.pattern.test(text)) {
      found.push(candidate.label)
    }
  }

  return found.slice(0, 10)
}

function buildPortfolioProfileSummary(params: {
  title: string | null
  description: string | null
  text: string
}): PortfolioProfileSummary {
  const compactText = truncateText(params.text, MAX_SOURCE_TEXT)
  const sentences = splitIntoSentences(compactText)
  const lower = compactText.toLowerCase()

  const ownerFromTitle = params.title?.match(/^(.+?)\s*-\s*portfolio/i)?.[1]?.trim() || null
  const ownerFromGreeting = compactText.match(/hello!?\s*i'?m\s+([A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i)?.[1]?.trim() || null
  const ownerName = ownerFromTitle || ownerFromGreeting

  const location =
    compactText.match(/\b[A-Z][a-z]+,\s*(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/)?.[0]?.trim() || null

  const summary =
    asString(params.description) ||
    truncateText(sentences.slice(0, 2).join(' '), 320) ||
    truncateText(compactText, 320) ||
    null

  const projectHighlights = Array.from(
    new Set(
      (compactText.match(/(?:developed|built|created|deployed|implemented|optimized)[^.!?]{30,170}/gi) || [])
        .map((item) => item.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    )
  ).slice(0, 5)

  const experienceHighlights = Array.from(
    new Set(
      sentences
        .filter((item) => /\b(intern|experience|worked|deployment|production|clients?)\b/i.test(item))
        .map((item) => truncateText(item, 180))
    )
  ).slice(0, 4)

  const educationHighlights = Array.from(
    new Set(
      sentences
        .filter((item) => /\b(education|bachelor|diploma|university|college|engineering|cgpa|percentage)\b/i.test(item))
        .map((item) => truncateText(item, 180))
    )
  ).slice(0, 4)

  let professionalTitle = asString(params.description)
  if (!professionalTitle) {
    professionalTitle =
      compactText.match(/\b(full[- ]stack[^.,;]*|web[^.,;]*developer|software[^.,;]*engineer|ai[^.,;]*(developer|engineer))\b/i)?.[0]?.trim() ||
      null
  }

  const topSkills = extractPortfolioSkills(lower)

  return {
    owner_name: ownerName,
    professional_title: professionalTitle,
    location,
    summary,
    top_skills: topSkills,
    project_highlights: projectHighlights,
    experience_highlights: experienceHighlights,
    education_highlights: educationHighlights,
  }
}

function buildPortfolioTextExcerpt(summary: PortfolioProfileSummary, rawText: string): string {
  const lines: string[] = []

  lines.push('Portfolio Summary')
  if (summary.owner_name) lines.push(`Name: ${summary.owner_name}`)
  if (summary.professional_title) lines.push(`Professional Title: ${summary.professional_title}`)
  if (summary.location) lines.push(`Location: ${summary.location}`)

  if (summary.summary) {
    lines.push('')
    lines.push(`Overview: ${summary.summary}`)
  }

  if (summary.top_skills.length > 0) {
    lines.push('')
    lines.push(`Top Skills: ${summary.top_skills.join(', ')}`)
  }

  if (summary.project_highlights.length > 0) {
    lines.push('')
    lines.push('Project Highlights:')
    for (const item of summary.project_highlights) {
      lines.push(`- ${item}`)
    }
  }

  if (summary.experience_highlights.length > 0) {
    lines.push('')
    lines.push('Experience Highlights:')
    for (const item of summary.experience_highlights) {
      lines.push(`- ${item}`)
    }
  }

  if (summary.education_highlights.length > 0) {
    lines.push('')
    lines.push('Education Highlights:')
    for (const item of summary.education_highlights) {
      lines.push(`- ${item}`)
    }
  }

  const base = lines.join('\n')
  const fallbackEvidence = truncateText(rawText, 1200)
  return truncateText(
    [base, fallbackEvidence ? `\n\nSupporting Extract:\n${fallbackEvidence}` : ''].filter(Boolean).join(''),
    MAX_SOURCE_TEXT
  )
}

function isLowSignalLinkedInText(text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim()
  if (!compact) return true

  if (compact.length < 220) return true

  const lowSignalPatterns = [
    /target url returned error\s*999/i,
    /warning:\s*this page maybe not yet fully loaded/i,
    /linkedin learning/i,
    /take a break and reconnect with your network through quick daily games/i,
    /linkedin\.com\/products\/categories/i,
    /show all\]\(https:\/\/www\.linkedin\.com\/products/i,
  ]

  if (lowSignalPatterns.some((pattern) => pattern.test(compact))) {
    return true
  }

  const profileSignal = [
    /\bexperience\b/i,
    /\beducation\b/i,
    /\bskills\b/i,
    /\bheadline\b/i,
    /\bsummary\b/i,
    /\babout\b/i,
  ]

  const signalsFound = profileSignal.filter((pattern) => pattern.test(compact)).length
  return signalsFound < 2
}

async function scrapeLinkedInWithApify(url: string): Promise<ScrapedSourceData | null> {
  const apifyToken = process.env.APIFY_API_TOKEN

  if (!apifyToken) {
    return null
  }

  const endpoint = `https://api.apify.com/v2/acts/anchor~linkedin-profile-enrichment/run-sync-get-dataset-items?token=${apifyToken}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startUrls: [
          {
            url,
            id: '1',
            method: 'GET',
          },
        ],
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const raw = await response.text().catch(() => '')
      return {
        url,
        success: false,
        status_code: response.status,
        title: null,
        description: null,
        text_excerpt: null,
        text_length: 0,
        source_method: 'apify',
        fallback_used: false,
        fetched_at: new Date().toISOString(),
        error: `Apify error (${response.status}): ${raw || 'Unknown error'}`,
      }
    }

    const data = await response.json()
    const first = Array.isArray(data) ? data[0] : null

    if (!first || typeof first !== 'object') {
      return {
        url,
        success: false,
        status_code: 200,
        title: null,
        description: null,
        text_excerpt: null,
        text_length: 0,
        source_method: 'apify',
        fallback_used: false,
        fetched_at: new Date().toISOString(),
        error: 'Apify returned empty LinkedIn profile data',
      }
    }

    const profile = first as Record<string, unknown>
    const linkedinProfile = buildLinkedInProfileSummary(profile)
    const curatedText = buildLinkedInTextExcerpt(linkedinProfile)

    const supplementalCollected: string[] = []
    collectStringValues(profile.positions, supplementalCollected)
    collectStringValues(profile.projects, supplementalCollected)
    collectStringValues(profile.publications, supplementalCollected)
    const supplementalText = truncateText(Array.from(new Set(supplementalCollected)).join('\n'), 2500)

    const textBlob = truncateText(
      [curatedText, supplementalText ? `Additional Details:\n${supplementalText}` : '']
        .filter(Boolean)
        .join('\n\n'),
      MAX_SOURCE_TEXT
    )
    const title = linkedinProfile.full_name
    const description = linkedinProfile.headline

    if (!textBlob || textBlob.length < 100) {
      return {
        url,
        success: false,
        status_code: 200,
        title,
        description,
        text_excerpt: null,
        text_length: textBlob.length,
        source_method: 'apify',
        fallback_used: false,
        linkedin_profile: linkedinProfile,
        fetched_at: new Date().toISOString(),
        error: 'Apify returned low-signal LinkedIn data',
      }
    }

    return {
      url,
      success: true,
      status_code: 200,
      title,
      description,
      text_excerpt: textBlob,
      text_length: textBlob.length,
      source_method: 'apify',
      fallback_used: false,
      linkedin_profile: linkedinProfile,
      fetched_at: new Date().toISOString(),
      error: null,
    }
  } catch (error) {
    return {
      url,
      success: false,
      status_code: null,
      title: null,
      description: null,
      text_excerpt: null,
      text_length: 0,
      source_method: 'apify',
      fallback_used: false,
      fetched_at: new Date().toISOString(),
      error: error instanceof Error ? `Apify request failed: ${error.message}` : 'Apify request failed',
    }
  }
}

export async function scrapePublicProfile(url: string | null | undefined): Promise<ScrapedSourceData | null> {
  if (!url) return null

  if (!/^https?:\/\//i.test(url)) {
    return {
      url,
      success: false,
      status_code: null,
      title: null,
      description: null,
      text_excerpt: null,
      text_length: 0,
      fetched_at: new Date().toISOString(),
      error: 'Invalid URL format',
    }
  }

  const isLinkedIn = /linkedin\.com/i.test(url)
  let apifyError: string | null = null

  if (isLinkedIn) {
    const apifyResult = await scrapeLinkedInWithApify(url)
    if (apifyResult?.success) {
      return apifyResult
    }
    if (apifyResult && apifyResult.error) {
      apifyError = apifyResult.error
    }
  }

  try {
    const response = await fetchWithTimeout(url, 15000)

    if (!response.ok) {
      const jinaResult = await fetchViaJinaFallback(url)

      if (jinaResult) {
        if (isLinkedIn && isLowSignalLinkedInText(jinaResult.text)) {
          return {
            url,
            success: false,
            status_code: response.status,
            title: null,
            description: null,
            text_excerpt: null,
            text_length: 0,
            source_method: 'jina_fallback',
            fallback_used: true,
            fetched_at: new Date().toISOString(),
            error: apifyError
              ? `${apifyError}; LinkedIn fallback returned low-signal content`
              : 'LinkedIn fallback returned low-signal content',
          }
        }

        const portfolioProfile = !isLinkedIn
          ? buildPortfolioProfileSummary({
            title: null,
            description: null,
            text: jinaResult.text,
          })
          : undefined
        const finalText = !isLinkedIn && portfolioProfile
          ? buildPortfolioTextExcerpt(portfolioProfile, jinaResult.text)
          : jinaResult.text

        return {
          url,
          success: true,
          status_code: response.status,
          title: null,
          description: null,
          text_excerpt: finalText,
          text_length: finalText.length,
          source_method: 'jina_fallback',
          fallback_used: true,
          portfolio_profile: portfolioProfile,
          fetched_at: new Date().toISOString(),
          error: null,
        }
      }

      return {
        url,
        success: false,
        status_code: response.status,
        title: null,
        description: null,
        text_excerpt: null,
        text_length: 0,
        fetched_at: new Date().toISOString(),
        error: apifyError ? `${apifyError}; HTTP ${response.status}` : `HTTP ${response.status}`,
      }
    }

    const html = await response.text()
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const descriptionMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["'][^>]*>/i)
    const cleaned = stripHtml(html)
    let excerpt = truncateText(cleaned, MAX_SOURCE_TEXT)
    let sourceMethod: 'direct' | 'jina_fallback' = 'direct'
    let fallbackUsed = false

    if (isLinkedIn || excerpt.length < 250) {
      const jinaResult = await fetchViaJinaFallback(url)
      if (jinaResult && jinaResult.length > excerpt.length) {
        if (isLinkedIn && isLowSignalLinkedInText(jinaResult.text)) {
          // Keep direct extraction when fallback content is generic LinkedIn shell text.
        } else {
          excerpt = jinaResult.text
          sourceMethod = 'jina_fallback'
          fallbackUsed = true
        }
      }
    }

    const portfolioProfile = !isLinkedIn
      ? buildPortfolioProfileSummary({
        title: titleMatch?.[1]?.trim() || null,
        description: descriptionMatch?.[1]?.trim() || null,
        text: excerpt,
      })
      : undefined
    const finalText = !isLinkedIn && portfolioProfile
      ? buildPortfolioTextExcerpt(portfolioProfile, excerpt)
      : excerpt

    return {
      url,
      success: true,
      status_code: response.status,
      title: titleMatch?.[1]?.trim() || null,
      description: descriptionMatch?.[1]?.trim() || null,
      text_excerpt: finalText || null,
      text_length: finalText.length,
      source_method: sourceMethod,
      fallback_used: fallbackUsed,
      portfolio_profile: portfolioProfile,
      fetched_at: new Date().toISOString(),
      error: apifyError,
    }
  } catch (error) {
    const jinaResult = await fetchViaJinaFallback(url)

    if (jinaResult) {
      if (isLinkedIn && isLowSignalLinkedInText(jinaResult.text)) {
        return {
          url,
          success: false,
          status_code: null,
          title: null,
          description: null,
          text_excerpt: null,
          text_length: 0,
          source_method: 'jina_fallback',
          fallback_used: true,
          fetched_at: new Date().toISOString(),
          error: apifyError
            ? `${apifyError}; LinkedIn fallback returned low-signal content`
            : 'LinkedIn fallback returned low-signal content',
        }
      }

      const portfolioProfile = !isLinkedIn
        ? buildPortfolioProfileSummary({
          title: null,
          description: null,
          text: jinaResult.text,
        })
        : undefined
      const finalText = !isLinkedIn && portfolioProfile
        ? buildPortfolioTextExcerpt(portfolioProfile, jinaResult.text)
        : jinaResult.text

      return {
        url,
        success: true,
        status_code: null,
        title: null,
        description: null,
        text_excerpt: finalText,
        text_length: finalText.length,
        source_method: 'jina_fallback',
        fallback_used: true,
        portfolio_profile: portfolioProfile,
        fetched_at: new Date().toISOString(),
        error: apifyError,
      }
    }

    return {
      url,
      success: false,
      status_code: null,
      title: null,
      description: null,
      text_excerpt: null,
      text_length: 0,
      fetched_at: new Date().toISOString(),
      error: apifyError
        ? `${apifyError}; ${error instanceof Error ? error.message : 'Failed to scrape URL'}`
        : (error instanceof Error ? error.message : 'Failed to scrape URL'),
    }
  }
}

export async function extractTextFromResumeUrl(resumeUrl: string | null | undefined): Promise<ResumeExtractionResult> {
  if (!resumeUrl) {
    return {
      success: false,
      text: null,
      mime_type: null,
      file_name: null,
      bytes: 0,
      error: 'Resume URL is missing',
    }
  }

  if (!/^https?:\/\//i.test(resumeUrl)) {
    return {
      success: false,
      text: null,
      mime_type: null,
      file_name: null,
      bytes: 0,
      error: 'Invalid resume URL format',
    }
  }

  try {
    const response = await fetchWithTimeout(resumeUrl, 20000)

    if (!response.ok) {
      return {
        success: false,
        text: null,
        mime_type: response.headers.get('content-type'),
        file_name: null,
        bytes: 0,
        error: `HTTP ${response.status}`,
      }
    }

    const contentType = response.headers.get('content-type') || ''
    const urlPath = new URL(resumeUrl).pathname.toLowerCase()
    const isPdf = contentType.includes('application/pdf') || urlPath.endsWith('.pdf')
    const isDocx =
      contentType.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document') ||
      urlPath.endsWith('.docx')
    const isTxt = contentType.includes('text/plain') || urlPath.endsWith('.txt')
    const isHtml = contentType.includes('text/html') || urlPath.endsWith('.html') || urlPath.endsWith('.htm')

    if (isPdf || isDocx) {
      const arrayBuffer = await response.arrayBuffer()
      const bytes = arrayBuffer.byteLength
      const buffer = Buffer.from(arrayBuffer)

      if (isPdf) {
        const pdfParseModule = await import('pdf-parse')
        const pdfParse = pdfParseModule.default as (buffer: Buffer) => Promise<{ text: string }>
        const parsed = await pdfParse(buffer)
        const text = truncateText(parsed.text, MAX_PROMPT_TEXT)

        return {
          success: text.length > 0,
          text: text || null,
          mime_type: contentType || 'application/pdf',
          file_name: urlPath.split('/').pop() || null,
          bytes,
          error: text.length > 0 ? null : 'No text found in PDF',
        }
      }

      const mammothModule = await import('mammoth')
      const mammoth = mammothModule.default
      const parsed = await mammoth.extractRawText({ buffer })
      const text = truncateText(parsed.value, MAX_PROMPT_TEXT)

      return {
        success: text.length > 0,
        text: text || null,
        mime_type: contentType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        file_name: urlPath.split('/').pop() || null,
        bytes,
        error: text.length > 0 ? null : 'No text found in DOCX',
      }
    }

    const rawText = await response.text()
    const text = truncateText(isHtml ? stripHtml(rawText) : rawText, MAX_PROMPT_TEXT)

    return {
      success: text.length > 0,
      text: text || null,
      mime_type: contentType || (isTxt ? 'text/plain' : isHtml ? 'text/html' : 'text/plain'),
      file_name: urlPath.split('/').pop() || null,
      bytes: new TextEncoder().encode(rawText).length,
      error: text.length > 0 ? null : 'No text extracted from resume',
    }
  } catch (error) {
    return {
      success: false,
      text: null,
      mime_type: null,
      file_name: null,
      bytes: 0,
      error: error instanceof Error ? error.message : 'Failed to fetch or parse resume',
    }
  }
}

function buildJobDescription(jobOpening: JobOpeningRecord): string {
  const responsibilities = normalizeStringArray(jobOpening.responsibilities)
  const skills = normalizeStringArray(jobOpening.skills)

  return [
    `Job Title: ${jobOpening.title}`,
    jobOpening.department ? `Department: ${jobOpening.department}` : '',
    jobOpening.location ? `Location: ${jobOpening.location}` : '',
    jobOpening.type ? `Employment Type: ${jobOpening.type}` : '',
    jobOpening.description ? `Description: ${jobOpening.description}` : '',
    jobOpening.about ? `About Role: ${jobOpening.about}` : '',
    responsibilities.length ? `Responsibilities: ${responsibilities.join('; ')}` : '',
    skills.length ? `Required Skills: ${skills.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildHeuristicAnalysis(params: {
  applicant: JobApplicantRecord
  jobOpening: JobOpeningRecord
  resumeText: string
  linkedinText: string
  portfolioText: string
}): ApplicantAnalysisOutput {
  const { applicant, jobOpening, resumeText, linkedinText, portfolioText } = params
  const skills = normalizeStringArray(jobOpening.skills)
  const responsibilities = normalizeStringArray(jobOpening.responsibilities)
  const candidateText = [resumeText, linkedinText, portfolioText, applicant.cover_letter || '']
    .join(' ')
    .toLowerCase()

  const matchedSkills = skills.filter((skill) => candidateText.includes(skill.toLowerCase()))
  const missingSkills = skills.filter((skill) => !candidateText.includes(skill.toLowerCase()))

  const overlapRatio = skills.length > 0 ? matchedSkills.length / skills.length : 0.5
  const experience = Math.max(0, applicant.experience_years || 0)
  const experienceFactor = Math.min(experience / 8, 1)
  const hasResume = resumeText.length > 0 ? 1 : 0
  const hasLinkedin = linkedinText.length > 0 ? 1 : 0
  const hasPortfolio = portfolioText.length > 0 ? 1 : 0
  const hasCoverLetter = applicant.cover_letter?.trim().length ? 1 : 0

  const rawScore =
    2.5 +
    overlapRatio * 4.5 +
    experienceFactor * 1.5 +
    hasResume * 0.7 +
    hasLinkedin * 0.3 +
    hasPortfolio * 0.3 +
    hasCoverLetter * 0.2

  const clamped = Math.max(0, Math.min(10, rawScore))
  const score = Math.round(clamped * 10) / 10

  const goodPoints = [
    matchedSkills.length > 0
      ? `Candidate matches ${matchedSkills.length} required skill(s): ${matchedSkills.slice(0, 8).join(', ')}`
      : 'Candidate profile includes limited explicit skill overlap from the job posting.',
    experience > 0 ? `Reported professional experience: ${experience} year(s).` : 'Experience data is missing or minimal.',
    hasPortfolio ? 'Portfolio URL is present and could be reviewed for project quality.' : 'Portfolio evidence is missing.',
    hasResume ? 'Resume text extraction succeeded, enabling document-based evaluation.' : 'Resume parsing did not succeed.',
    hasLinkedin ? 'LinkedIn/public profile content was available for additional signal.' : 'LinkedIn signal is weak or unavailable.',
    responsibilities.length > 0
      ? `JD includes ${responsibilities.length} responsibility items that can be tested in interview.`
      : 'JD responsibilities are limited, reducing requirement-specific confidence.',
  ]

  const badPoints = [
    missingSkills.length > 0
      ? `Potential skill gaps: ${missingSkills.slice(0, 8).join(', ')}`
      : 'No major skill gaps identified from listed requirements.',
    hasResume ? '' : 'Resume content could not be extracted, reducing confidence in this evaluation.',
    hasLinkedin ? '' : 'LinkedIn data is missing or inaccessible.',
    hasPortfolio ? '' : 'Portfolio evidence is missing, making project quality harder to validate.',
    hasCoverLetter ? '' : 'Cover letter signal is absent or inaccessible.',
    experience < 2 ? 'Candidate may have limited experience for this role level.' : '',
  ].filter(Boolean)

  const summary =
    score >= 8
      ? 'Strong candidate fit based on available evidence.'
      : score >= 6
        ? 'Moderate fit with both strengths and notable gaps.'
        : 'Low fit for this role based on currently available evidence.'

  const hiringRecommendation: ApplicantAnalysisOutput['hiring_recommendation'] =
    score >= 8.5 ? 'strong_yes' : score >= 7 ? 'yes' : score >= 5.5 ? 'maybe' : 'no'

  return {
    score_out_of_10: score,
    overall_summary: summary,
    detailed_reasoning: [
      `Heuristic evaluation used because AI analysis was unavailable.`,
      `Skill overlap ratio: ${(overlapRatio * 100).toFixed(0)}%.`,
      `Matched skills: ${matchedSkills.length}. Missing skills: ${missingSkills.length}.`,
      `Evidence coverage - resume: ${hasResume ? 'yes' : 'no'}, LinkedIn: ${hasLinkedin ? 'yes' : 'no'}, portfolio: ${hasPortfolio ? 'yes' : 'no'}, cover letter: ${hasCoverLetter ? 'yes' : 'no'}.`,
    ].join(' '),
    hiring_recommendation: hiringRecommendation,
    recommendation_reasoning:
      hiringRecommendation === 'strong_yes'
        ? 'Candidate appears highly aligned to role requirements based on available evidence.'
        : hiringRecommendation === 'yes'
          ? 'Candidate is likely suitable, with moderate risks to validate during interview.'
          : hiringRecommendation === 'maybe'
            ? 'Candidate has mixed signal quality; interview is needed before decision.'
            : 'Current evidence suggests role mismatch or major data gaps.',
    good_points: goodPoints,
    bad_points: badPoints,
    matched_requirements: matchedSkills,
    missing_requirements: missingSkills,
    red_flags: hasResume ? [] : ['Resume could not be extracted; verification required.'],
    interview_focus_areas: [
      ...missingSkills.slice(0, 5).map((skill) => `Demonstrate depth in ${skill}.`),
      ...responsibilities.slice(0, 3).map((item) => `Validate hands-on ownership for: ${item}`),
      'Ask for concrete examples of impact and ownership in prior roles.',
    ],
    strengths_with_evidence: matchedSkills.slice(0, 5).map((skill) => ({
      strength: `Evidence of skill: ${skill}`,
      source: 'resume' as const,
      evidence: `Skill '${skill}' appears in the candidate materials.`,
    })),
    concerns_with_evidence: missingSkills.slice(0, 5).map((skill) => ({
      concern: `Potential gap in ${skill}`,
      source: 'jd' as const,
      evidence: `No explicit evidence found for required skill '${skill}'.`,
    })),
    interview_question_bank: [
      ...missingSkills.slice(0, 3).map((skill) => ({
        question: `Can you describe a recent project where you used ${skill}?`,
        purpose: `Validate practical depth in ${skill}.`,
      })),
      ...responsibilities.slice(0, 2).map((item) => ({
        question: `Walk through a situation where you handled responsibility similar to: ${item}`,
        purpose: 'Validate real execution ability on core JD responsibilities.',
      })),
      {
        question: 'What measurable business impact did your last major project deliver?',
        purpose: 'Assess ownership and outcome orientation.',
      },
      {
        question: 'Which parts of this job description are strongest and weakest fits for you?',
        purpose: 'Assess self-awareness and role fit clarity.',
      },
    ],
    scoring_breakdown: {
      technical_fit: Math.round((overlapRatio * 10) * 10) / 10,
      experience_fit: Math.round((experienceFactor * 10) * 10) / 10,
      communication_fit: hasCoverLetter ? 6.5 : 4,
      project_quality: hasPortfolio ? 6.5 : 3,
      role_alignment: Math.round((score / 10) * 10) / 10,
    },
    confidence: hasResume || hasLinkedin || hasPortfolio ? 'medium' : 'low',
    component_scores: {
      resume: hasResume ? 6.5 : 2,
      linkedin: hasLinkedin ? 6 : 2,
      portfolio: hasPortfolio ? 6.5 : 2,
      cover_letter: hasCoverLetter ? 6 : 3,
      jd_alignment: Math.round((overlapRatio * 10) * 10) / 10,
    },
    evidence: [],
    generated_at: new Date().toISOString(),
    source_coverage: {
      resume: hasResume === 1,
      linkedin: hasLinkedin === 1,
      portfolio: hasPortfolio === 1,
      cover_letter: hasCoverLetter === 1,
    },
  }
}

async function runGeminiAnalysis(params: {
  applicant: JobApplicantRecord
  jobDescription: string
  resumeText: string
  linkedinText: string
  portfolioText: string
}): Promise<ApplicantAnalysisOutput> {
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY

  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const { applicant, jobDescription, resumeText, linkedinText, portfolioText } = params

  const prompt = `You are an expert technical recruiter and hiring analyst.

TASK:
Analyze the candidate against the job description and return STRICT JSON only.
Score must be out of 10 (0 to 10, one decimal place preferred).

JOB DESCRIPTION:
${truncateText(jobDescription, MAX_PROMPT_TEXT)}

CANDIDATE PROFILE:
Name: ${applicant.full_name}
Email: ${applicant.email}
Experience (years): ${applicant.experience_years ?? 'unknown'}

RESUME TEXT:
${truncateText(resumeText, MAX_PROMPT_TEXT) || 'Not available'}

LINKEDIN PUBLIC DATA:
${truncateText(linkedinText, MAX_PROMPT_TEXT) || 'Not available'}

PORTFOLIO PUBLIC DATA:
${truncateText(portfolioText, MAX_PROMPT_TEXT) || 'Not available'}

COVER LETTER:
${truncateText(applicant.cover_letter || '', MAX_PROMPT_TEXT) || 'Not available'}

RETURN JSON WITH THIS EXACT SHAPE:
{
  "score_out_of_10": number,
  "overall_summary": string,
  "detailed_reasoning": string,
  "hiring_recommendation": "strong_yes" | "yes" | "maybe" | "no",
  "recommendation_reasoning": string,
  "good_points": string[],
  "bad_points": string[],
  "matched_requirements": string[],
  "missing_requirements": string[],
  "red_flags": string[],
  "interview_focus_areas": string[],
  "strengths_with_evidence": [{ "strength": string, "source": "resume"|"linkedin"|"portfolio"|"cover_letter"|"jd", "evidence": string }],
  "concerns_with_evidence": [{ "concern": string, "source": "resume"|"linkedin"|"portfolio"|"cover_letter"|"jd", "evidence": string }],
  "interview_question_bank": [{ "question": string, "purpose": string }],
  "scoring_breakdown": {
    "technical_fit": number,
    "experience_fit": number,
    "communication_fit": number,
    "project_quality": number,
    "role_alignment": number
  },
  "confidence": "low" | "medium" | "high",
  "component_scores": {
    "resume": number,
    "linkedin": number,
    "portfolio": number,
    "cover_letter": number,
    "jd_alignment": number
  },
  "evidence": [{ "point": string, "source": "resume"|"linkedin"|"portfolio"|"cover_letter"|"jd", "quote": string }]
}

Rules:
- No markdown.
- No code blocks.
- Output valid JSON only.
- Give highly detailed reasoning and explicit evidence quotes.
- Provide at least 5 good_points, 5 bad_points, and 6 interview_question_bank items whenever evidence allows.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${ANALYSIS_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const errorData = await response.text().catch(() => '')
    throw new Error(`Gemini API error: ${response.status} ${errorData}`)
  }

  const data = await response.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error('Gemini returned an empty analysis response')
  }

  const parsed = extractJsonObject(text)
  const validated = analysisSchema.parse(parsed)

  return {
    ...validated,
    score_out_of_10: Math.round(Math.min(10, Math.max(0, validated.score_out_of_10)) * 10) / 10,
    generated_at: new Date().toISOString(),
    source_coverage: {
      resume: resumeText.length > 0,
      linkedin: linkedinText.length > 0,
      portfolio: portfolioText.length > 0,
      cover_letter: !!applicant.cover_letter?.trim(),
    },
  }
}

export async function analyzeApplicant(params: {
  applicant: JobApplicantRecord
  jobOpening: JobOpeningRecord
  forceRescrape?: boolean
}): Promise<AnalyzeResult> {
  const { applicant, jobOpening, forceRescrape = false } = params

  const linkedinFromDb = applicant.linkedin_scraped_data as ScrapedSourceData | null
  const portfolioFromDb = applicant.portfolio_scraped_data as ScrapedSourceData | null

  const linkedinScrapedData =
    forceRescrape || !linkedinFromDb?.success ? await scrapePublicProfile(applicant.linkedin_url) : linkedinFromDb

  const portfolioScrapedData =
    forceRescrape || !portfolioFromDb?.success ? await scrapePublicProfile(applicant.portfolio_url) : portfolioFromDb

  const resumeExtraction =
    !forceRescrape && applicant.resume_extracted_text
      ? {
          success: true,
          text: applicant.resume_extracted_text,
          mime_type: null,
          file_name: null,
          bytes: applicant.resume_extracted_text.length,
          error: null,
        }
      : await extractTextFromResumeUrl(applicant.resume_url)

  const resumeText = truncateText(resumeExtraction.text || '', MAX_PROMPT_TEXT)
  const linkedinText = truncateText((linkedinScrapedData?.text_excerpt as string) || '', MAX_PROMPT_TEXT)
  const portfolioText = truncateText((portfolioScrapedData?.text_excerpt as string) || '', MAX_PROMPT_TEXT)
  const jobDescription = buildJobDescription(jobOpening)

  let analysis: ApplicantAnalysisOutput

  try {
    analysis = await runGeminiAnalysis({
      applicant,
      jobDescription,
      resumeText,
      linkedinText,
      portfolioText,
    })
  } catch {
    analysis = buildHeuristicAnalysis({
      applicant,
      jobOpening,
      resumeText,
      linkedinText,
      portfolioText,
    })
  }

  return {
    analysis,
    linkedinScrapedData,
    portfolioScrapedData,
    resumeExtraction,
  }
}

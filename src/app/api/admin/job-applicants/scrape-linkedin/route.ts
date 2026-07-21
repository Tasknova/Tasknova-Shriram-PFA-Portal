import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import { scrapePublicProfile, ScrapedSourceData } from '@/lib/jobApplicantAnalysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  mode: z.enum(['all', 'single']).optional().default('all'),
  applicantId: z.string().uuid().optional(),
  forceRescrape: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(200),
})

type ApplicantLinkedInRow = {
  id: string
  linkedin_url: string | null
  linkedin_scraped_data: Record<string, unknown> | null
}

function hasSuccessfulLinkedInScrape(value: Record<string, unknown> | null | undefined): boolean {
  if (!value || typeof value !== 'object') return false
  return value.success === true
}

async function scrapeAndPersistLinkedIn(
  supabase: ReturnType<typeof createServerClient>,
  row: ApplicantLinkedInRow,
  forceRescrape: boolean
) {
  if (!row.linkedin_url) {
    return {
      id: row.id,
      status: 'skipped' as const,
      reason: 'linkedin_url_missing',
    }
  }

  if (!forceRescrape && hasSuccessfulLinkedInScrape(row.linkedin_scraped_data)) {
    return {
      id: row.id,
      status: 'skipped' as const,
      reason: 'already_scraped',
    }
  }

  const scraped = await scrapePublicProfile(row.linkedin_url)

  const payload: ScrapedSourceData | Record<string, unknown> =
    scraped || {
      url: row.linkedin_url,
      success: false,
      status_code: null,
      title: null,
      description: null,
      text_excerpt: null,
      text_length: 0,
      source_method: 'apify',
      fallback_used: false,
      fetched_at: new Date().toISOString(),
      error: 'LinkedIn scrape returned empty payload',
    }

  const { error } = await supabase
    .from('job_applicants')
    .update({
      linkedin_scraped_data: payload,
    })
    .eq('id', row.id)

  if (error) {
    return {
      id: row.id,
      status: 'failed' as const,
      reason: error.message,
    }
  }

  return {
    id: row.id,
    status: payload.success ? ('completed' as const) : ('failed' as const),
    reason: payload.success ? null : (typeof payload.error === 'string' ? payload.error : 'scrape_failed'),
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  try {
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      rawBody = {}
    }

    const payload = requestSchema.parse(rawBody)

    if (payload.mode === 'single') {
      if (!payload.applicantId) {
        return NextResponse.json({ error: 'applicantId is required for single mode' }, { status: 400 })
      }

      const { data, error } = await supabase
        .from('job_applicants')
        .select('id, linkedin_url, linkedin_scraped_data')
        .eq('id', payload.applicantId)
        .single()

      if (error || !data) {
        return NextResponse.json({ error: 'Applicant not found' }, { status: 404 })
      }

      const result = await scrapeAndPersistLinkedIn(
        supabase,
        data as ApplicantLinkedInRow,
        payload.forceRescrape
      )

      return NextResponse.json({
        success: true,
        mode: 'single',
        result,
      })
    }

    const { data: rows, error } = await supabase
      .from('job_applicants')
      .select('id, linkedin_url, linkedin_scraped_data')
      .not('linkedin_url', 'is', null)
      .neq('linkedin_url', '')
      .order('created_at', { ascending: false })
      .limit(payload.limit)

    if (error) {
      throw error
    }

    const applicants = (rows || []) as ApplicantLinkedInRow[]

    if (applicants.length === 0) {
      return NextResponse.json({
        success: true,
        mode: 'all',
        message: 'No applicants with LinkedIn URLs found',
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0,
        results: [],
      })
    }

    const results = []
    for (const row of applicants) {
      const result = await scrapeAndPersistLinkedIn(supabase, row, payload.forceRescrape)
      results.push(result)
    }

    const completed = results.filter((item) => item.status === 'completed').length
    const failed = results.filter((item) => item.status === 'failed').length
    const skipped = results.filter((item) => item.status === 'skipped').length

    return NextResponse.json({
      success: true,
      mode: 'all',
      total: applicants.length,
      completed,
      failed,
      skipped,
      forceRescrape: payload.forceRescrape,
      results,
    })
  } catch (error) {
    console.error('LinkedIn bulk scrape error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scrape LinkedIn profiles' },
      { status: 500 }
    )
  }
}

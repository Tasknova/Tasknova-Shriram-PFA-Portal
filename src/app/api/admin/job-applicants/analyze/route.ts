import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import {
  analyzeApplicant,
  JobApplicantRecord,
  JobOpeningRecord,
} from '@/lib/jobApplicantAnalysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  applicantId: z.string().uuid().optional(),
  forceRescrape: z.boolean().optional().default(false),
  mode: z.enum(['single', 'bulk']).optional().default('single'),
  limit: z.number().int().min(1).max(20).optional().default(5),
})

async function loadApplicant(supabase: ReturnType<typeof createServerClient>, applicantId: string) {
  const { data, error } = await supabase
    .from('job_applicants')
    .select('*')
    .eq('id', applicantId)
    .single()

  if (error || !data) {
    throw new Error('Applicant not found')
  }

  return data as JobApplicantRecord
}

async function loadJobOpening(supabase: ReturnType<typeof createServerClient>, applicant: JobApplicantRecord) {
  if (!applicant.job_id) {
    throw new Error('Job opening is not linked for this applicant')
  }

  const { data, error } = await supabase
    .from('job_openings')
    .select('*')
    .eq('id', applicant.job_id)
    .single()

  if (error || !data) {
    throw new Error('Job opening not found for this applicant')
  }

  return data as JobOpeningRecord
}

async function markProcessing(supabase: ReturnType<typeof createServerClient>, applicantId: string) {
  await supabase
    .from('job_applicants')
    .update({
      analysis_status: 'processing',
      analysis_error: null,
    })
    .eq('id', applicantId)
}

async function markFailed(
  supabase: ReturnType<typeof createServerClient>,
  applicantId: string,
  errorMessage: string
) {
  await supabase
    .from('job_applicants')
    .update({
      analysis_status: 'failed',
      analysis_error: errorMessage,
      analyzed_at: new Date().toISOString(),
    })
    .eq('id', applicantId)
}

async function analyzeAndPersist(
  supabase: ReturnType<typeof createServerClient>,
  applicantId: string,
  forceRescrape: boolean
) {
  await markProcessing(supabase, applicantId)

  try {
    const applicant = await loadApplicant(supabase, applicantId)
    const jobOpening = await loadJobOpening(supabase, applicant)

    const result = await analyzeApplicant({
      applicant,
      jobOpening,
      forceRescrape,
    })

    const { error: updateError } = await supabase
      .from('job_applicants')
      .update({
        ai_score: result.analysis.score_out_of_10,
        ai_score_reasoning: result.analysis.overall_summary,
        analysis_data: result.analysis,
        analysis_status: 'completed',
        analysis_error: null,
        analyzed_at: new Date().toISOString(),
        linkedin_scraped_data: result.linkedinScrapedData,
        portfolio_scraped_data: result.portfolioScrapedData,
        resume_extracted_text: result.resumeExtraction.text,
      })
      .eq('id', applicantId)

    if (updateError) {
      throw updateError
    }

    return {
      id: applicantId,
      status: 'completed' as const,
      score: result.analysis.score_out_of_10,
      summary: result.analysis.overall_summary,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analysis failed'
    await markFailed(supabase, applicantId, message)

    return {
      id: applicantId,
      status: 'failed' as const,
      error: message,
    }
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
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = requestSchema.parse(rawBody)

    if (payload.mode === 'bulk') {
      const { data: applicants, error } = await supabase
        .from('job_applicants')
        .select('id, analysis_status, ai_score')
        .or('analysis_status.eq.not_started,analysis_status.eq.failed,ai_score.is.null')
        .order('created_at', { ascending: false })
        .limit(payload.limit)

      if (error) {
        throw error
      }

      const ids = (applicants || []).map((item) => item.id)

      if (ids.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No applicants are pending analysis',
          results: [],
        })
      }

      const results = []
      for (const id of ids) {
        const result = await analyzeAndPersist(supabase, id, payload.forceRescrape)
        results.push(result)
      }

      return NextResponse.json({
        success: true,
        mode: 'bulk',
        requested: ids.length,
        completed: results.filter((r) => r.status === 'completed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
      })
    }

    if (!payload.applicantId) {
      return NextResponse.json({ error: 'applicantId is required' }, { status: 400 })
    }

    const result = await analyzeAndPersist(supabase, payload.applicantId, payload.forceRescrape)

    if (result.status === 'failed') {
      return NextResponse.json(
        {
          success: false,
          ...result,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      mode: 'single',
      ...result,
    })
  } catch (error) {
    console.error('Job applicant analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze applicant' },
      { status: 500 }
    )
  }
}

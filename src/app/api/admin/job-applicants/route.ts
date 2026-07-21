import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  try {
    if (id) {
      const { data: applicant, error: applicantError } = await supabase
        .from('job_applicants')
        .select('*')
        .eq('id', id)
        .single()

      if (applicantError) throw applicantError

      let jobOpening = null

      if (applicant?.job_id) {
        const { data: jobData } = await supabase
          .from('job_openings')
          .select('*')
          .eq('id', applicant.job_id)
          .single()

        jobOpening = jobData || null
      }

      return NextResponse.json({
        ...applicant,
        job_opening: jobOpening,
      })
    }

    const { data, error } = await supabase
      .from('job_applicants')
      .select('id, full_name, email, phone, experience_years, analysis_status, ai_score, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch applicants' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 })
  }

  const supabase = createServerClient()

  try {
    const { error } = await supabase
      .from('job_applicants')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete applicant' }, { status: 500 })
  }
}

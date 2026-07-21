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
      const { data, error } = await supabase
        .from('daily_standup_meetings')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      return NextResponse.json(data)
    }

    const { data, error } = await supabase
      .from('daily_standup_meetings')
      .select('id, meeting_title, meeting_date, meeting_duration, processed, processing_error, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Daily standup meetings fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch daily standup meetings' },
      { status: 500 }
    )
  }
}

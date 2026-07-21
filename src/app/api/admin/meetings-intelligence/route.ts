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
      const [{ data: intelligenceRow, error: intelligenceError }, { data: standups, error: standupsError }] = await Promise.all([
        supabase
          .from('meetings_intelligence')
          .select('*')
          .eq('id', id)
          .single(),
        supabase
          .from('daily_standup_meetings')
          .select('id, meeting_title, meeting_date, created_at')
      ])

      if (intelligenceError) throw intelligenceError
      if (standupsError) throw standupsError

      const standupById = new Map((standups || []).map((item) => [item.id, item]))

      const enrichedRow = {
        ...intelligenceRow,
        standup: standupById.get(intelligenceRow.meeting_id) || null,
      }

      return NextResponse.json(enrichedRow)
    }

    const [{ data: intelligenceRows, error: intelligenceError }, { data: standups, error: standupsError }] = await Promise.all([
      supabase
        .from('meetings_intelligence')
        .select('id, meeting_id, tasks_completed, sentiment_score, meeting_efficiency_score, key_insights, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('daily_standup_meetings')
        .select('id, meeting_title, meeting_date, created_at')
    ])

    if (intelligenceError) throw intelligenceError
    if (standupsError) throw standupsError

    const standupById = new Map((standups || []).map((item) => [item.id, item]))

    const enrichedRows = (intelligenceRows || []).map((row) => ({
      ...row,
      standup: standupById.get(row.meeting_id) || null,
    }))

    return NextResponse.json(enrichedRows)
  } catch (error) {
    console.error('Meetings intelligence fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch meetings intelligence data' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/ai-agents/upload-recording/batch-status?call_ids=id1,id2,id3
 *
 * Returns evaluation status, scores and lead status for a list of call IDs.
 * Used by the Upload Recordings page to poll evaluation results inline.
 */
export async function GET(req: NextRequest) {
  try {
    const rawIds = req.nextUrl.searchParams.get('call_ids') || ''
    const callIds = rawIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)

    if (callIds.length === 0) {
      return NextResponse.json({ evaluations: [] })
    }

    const client = createServerClient()

    const { data, error } = await client
      .from('ai_evaluations')
      .select(
        'id, call_id, status, score, overall_score, lead_status, meeting_datetime, overall_feedback, error_message, processed_at, created_at, ai_calls(call_id, customer_number, duration, created_at)'
      )
      .in('call_id', callIds)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Batch Status API] DB error:', error)
      return NextResponse.json({ error: 'Failed to fetch evaluation status' }, { status: 500 })
    }

    return NextResponse.json(
      { evaluations: data || [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (err) {
    console.error('[Batch Status API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

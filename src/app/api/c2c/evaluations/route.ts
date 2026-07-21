import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const searchParams = req.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let query = client
      .from('c2c_evaluations')
      .select('*, transcript_text, c2c_calls(call_id, from_number, to_number, status, duration, created_at, c2c_transcripts(summary, call_outcome, history, raw_text))', { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[C2C Evaluations API] Database error:', error)
      return NextResponse.json({ error: 'Failed to fetch evaluations' }, { status: 500 })
    }

    return NextResponse.json({
      evaluations: data || [],
      total: count,
      limit,
      offset,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[C2C Evaluations API] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

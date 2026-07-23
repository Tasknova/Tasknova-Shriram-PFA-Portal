import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const searchParams = req.nextUrl.searchParams
    const status = searchParams.get('status')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    let query = client
      .from('c2c_calls')
      .select('*', { count: 'exact' })

    if (status) {
      query = query.eq('status', status)
    }

    const { data: calls, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('[C2C] Error fetching calls:', error)
      return NextResponse.json({ error: 'Failed to fetch calls' }, { status: 500 })
    }

    if (!calls || calls.length === 0) {
      return NextResponse.json(
        { calls: [], total: count, limit, offset },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      )
    }

    const callIds = calls.map((c) => c.call_id)

    // Fetch transcripts and evaluations separately to avoid join issues
    const [transcriptsResult, evaluationsResult] = await Promise.all([
      client
        .from('c2c_transcripts')
        .select('call_id, summary, call_outcome, history, raw_text')
        .in('call_id', callIds),
      client
        .from('c2c_evaluations')
        .select('call_id, status, score, overall_score, overall_feedback, call_summary, error_message')
        .in('call_id', callIds),
    ])

    // Fix missing history from raw_text
    for (const t of transcriptsResult.data || []) {
      const h = t.history as unknown[] | null | undefined
      const r = typeof t.raw_text === 'string' ? t.raw_text.trim() : ''
      const isJunk = r === '[]' || r === '{}' || r === ''
      if (h && Array.isArray(h) && h.length > 0) {
        const first = h[0] as Record<string, unknown> | null | undefined
        if (first && first.content === '[]') {
          t.history = []
          await client.from('c2c_transcripts').update({ history: [], updated_at: new Date().toISOString() }).eq('call_id', t.call_id)
        }
      }
      if ((!h || h.length === 0) && !isJunk && r) {
        t.history = [{ role: 'Conversation', content: r }]
        await client.from('c2c_transcripts').update({ history: t.history, updated_at: new Date().toISOString() }).eq('call_id', t.call_id)
      }
    }

    // Build lookup maps
    const transcriptMap = new Map(
      (transcriptsResult.data || []).map((t) => [t.call_id, t])
    )
    const evaluationMap = new Map(
      (evaluationsResult.data || []).map((e) => [e.call_id, e])
    )

    // Merge
    const enrichedCalls = calls.map((call) => ({
      ...call,
      c2c_transcripts: transcriptMap.has(call.call_id) ? [transcriptMap.get(call.call_id)] : [],
      c2c_evaluations: evaluationMap.has(call.call_id) ? [evaluationMap.get(call.call_id)] : [],
    }))

    return NextResponse.json(
      { calls: enrichedCalls, total: count, limit, offset },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('[C2C] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

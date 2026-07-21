import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const callId = url.searchParams.get('call_id')

    const client = createServerClient()

    // Source of truth: the ai_calls table which has the final recording_url
    // after IndusLabs sends it (either via call.completed or transcript.ready webhook)
    let query = client
      .from('ai_calls')
      .select('call_id, recording_url, status, created_at, updated_at')
      // Only show calls that have actually completed (webhook was received)
      .eq('status', 'completed')

    if (callId) {
      query = query.ilike('call_id', `%${callId}%`)
    }

    const { data: calls, error } = await query
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json(
      { logs: calls ?? [] },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('Error fetching recording logs:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

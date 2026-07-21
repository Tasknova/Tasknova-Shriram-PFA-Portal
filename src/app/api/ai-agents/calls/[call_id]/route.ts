import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { call_id: string } }
) {
  try {
    const { call_id } = params

    if (!call_id) {
      return NextResponse.json(
        { error: 'call_id is required' },
        { status: 400 }
      )
    }

    const client = createServerClient()

    // Fetch call details with all related data
    const { data: call, error: callError } = await client
      .from('ai_calls')
      .select(`
        *,
        ai_agents(agent_id, name),
        ai_transcripts(*),
        ai_evaluations(*)
      `)
      .eq('call_id', call_id)
      .single()

    if (callError || !call) {
      console.error('Call not found:', callError)
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      call,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Error fetching call details:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

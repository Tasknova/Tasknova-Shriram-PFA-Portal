import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = createServerClient()

    const { data, error } = await client
      .from('ai_evaluations')
      .select(`
        *,
        ai_calls(
          call_id,
          agent_id,
          status,
          call_type,
          duration,
          transcript_status,
          outcome,
          customer_number,
          agent_number,
          did,
          created_at,
          updated_at,
          started_at,
          ended_at,
          recording_url,
          agent_config,
          ai_agents(agent_id, name),
          ai_transcripts(id, summary, call_outcome, history, transcript_id, raw_text)
        )
      `)
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ evaluation: data }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('Error fetching evaluation details:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

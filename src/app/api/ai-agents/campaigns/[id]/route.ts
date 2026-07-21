import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/ai-agents/campaigns/[id] — fetch campaign with its call details
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = createServerClient()

    // Fetch campaign
    const { data: campaign, error: campError } = await client
      .from('ai_campaigns')
      .select('*')
      .eq('id', params.id)
      .single()

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Fetch campaign call rows (without relationship join to avoid schema cache errors)
    const { data: campaignCalls, error: callsError } = await client
      .from('ai_campaign_calls')
      .select(`
        id,
        campaign_id,
        call_id,
        customer_name,
        customer_number,
        status,
        error_message,
        created_at
      `)
      .eq('campaign_id', params.id)
      .order('created_at', { ascending: true })

    if (callsError) {
      console.error('Error fetching campaign calls:', callsError)
    }

    const calls = campaignCalls || []

    // Extract non-null call IDs
    const callIds = calls.map(c => c.call_id).filter(Boolean) as string[]
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aiCallsMap: Record<string, any> = {}

    // Manually fetch ai_calls data if there are any
    if (callIds.length > 0) {
      const { data: aiCallsData, error: aiCallsError } = await client
        .from('ai_calls')
        .select(`
          call_id,
          status,
          duration,
          recording_url,
          transcript_status,
          outcome,
          created_at,
          ai_transcripts ( summary, call_outcome ),
          ai_evaluations ( id, score, overall_score, status, issues, suggestions )
        `)
        .in('call_id', callIds)

      if (aiCallsError) {
        console.error('Error fetching ai_calls:', aiCallsError)
      } else if (aiCallsData) {
        aiCallsMap = aiCallsData.reduce((acc, call) => {
          acc[call.call_id] = call
          return acc
        }, {} as Record<string, typeof aiCallsData[0]>)
      }
    }

    // Merge them together
    const mergedCalls = calls.map(c => ({
      ...c,
      ai_calls: c.call_id && aiCallsMap[c.call_id] ? aiCallsMap[c.call_id] : null
    }))

    return NextResponse.json({ campaign, calls: mergedCalls })
  } catch (err) {
    console.error('Campaign GET [id] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/ai-agents/campaigns/[id] — update campaign progress / status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json() as {
      status?: string
      executed_calls?: number
    }

    const client = createServerClient()

    const { error } = await client
      .from('ai_campaigns')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Campaign PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

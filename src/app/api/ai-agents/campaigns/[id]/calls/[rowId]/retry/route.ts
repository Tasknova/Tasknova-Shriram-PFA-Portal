import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/ai-agents/campaigns/[id]/calls/[rowId]/retry
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string, rowId: string } }
) {
  try {
    const client = createServerClient()

    // 1. Verify row exists
    const { data: row, error: rowError } = await client
      .from('ai_campaign_calls')
      .select('*')
      .eq('id', params.rowId)
      .eq('campaign_id', params.id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ error: 'Call record not found' }, { status: 404 })
    }

    // 2. Verify campaign exists
    const { data: campaign, error: campError } = await client
      .from('ai_campaigns')
      .select('status, did')
      .eq('id', params.id)
      .single()

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // 3. Reset row to pending
    await client
      .from('ai_campaign_calls')
      .update({
        status: 'pending',
        error_message: null,
      })
      .eq('id', params.rowId)

    // 4. Set campaign back to pending if it was completed or failed, so the execute route will run it
    if (campaign.status === 'completed' || campaign.status === 'failed') {
      await client
        .from('ai_campaigns')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', params.id)
    }

    // 5. Trigger the execute route again
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/ai-agents/campaigns/${params.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ did: campaign.did }), // send DID in case DB column doesn't exist yet
    }).catch((err) => {
      console.error('Failed to trigger campaign execution from retry:', err)
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Campaign retry error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

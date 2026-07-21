import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/ai-agents/campaigns/[id]/cancel — cancel a running campaign
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = createServerClient()

    const { data: campaign } = await client
      .from('ai_campaigns')
      .select('status')
      .eq('id', params.id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status !== 'running' && campaign.status !== 'pending') {
      return NextResponse.json({ error: 'Campaign cannot be cancelled in its current state' }, { status: 400 })
    }

    const { error } = await client
      .from('ai_campaigns')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) {
      return NextResponse.json({ error: 'Failed to cancel campaign' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Campaign cancellation requested. In-progress calls will complete normally.' })
  } catch (err) {
    console.error('Campaign cancel error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

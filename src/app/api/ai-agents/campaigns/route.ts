import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/ai-agents/campaigns — list all campaigns
export async function GET() {
  try {
    const client = createServerClient()
    const { data, error } = await client
      .from('ai_campaigns')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching campaigns:', error)
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 })
    }

    return NextResponse.json({ campaigns: data || [] })
  } catch (err) {
    console.error('Campaigns GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/ai-agents/campaigns — create a campaign and start execution
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      name: string
      agent_id: string
      contacts: Array<{ name: string; phone: string }>
      did?: string
    }

    const { name, agent_id, contacts, did } = body

    if (!name?.trim() || !agent_id || !contacts?.length) {
      return NextResponse.json(
        { error: 'name, agent_id, and contacts are required' },
        { status: 400 }
      )
    }

    const client = createServerClient()

    // Verify agent exists
    const { data: agent, error: agentError } = await client
      .from('ai_agents')
      .select('agent_id, name')
      .eq('agent_id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Build insert payload — 'did' column may not exist yet if migration hasn't been run
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertPayload: any = {
      name: name.trim(),
      agent_id,
      total_calls: contacts.length,
      executed_calls: 0,
      status: 'pending',
      contacts,
    }
    // Only include did if provided (requires ALTER TABLE migration — see supabase/campaigns_migration.sql)
    if (did) insertPayload.did = did

    // Create the campaign record
    const { data: campaign, error: createError } = await client
      .from('ai_campaigns')
      .insert(insertPayload)
      .select()
      .single()

    // If failed because of 'did' column missing, retry without it
    if (createError?.code === 'PGRST204' && createError.message?.includes("'did'")) {
      delete insertPayload.did
      const { data: retryData, error: retryError } = await client
        .from('ai_campaigns')
        .insert(insertPayload)
        .select()
        .single()

      if (retryError || !retryData) {
        console.error('Failed to create campaign (retry):', retryError)
        return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
      }

      // Store did in contacts metadata for execute route
      const { data: retrycampaign } = await client
        .from('ai_campaigns')
        .select()
        .eq('id', retryData.id)
        .single()

      const callRows = contacts.map((c) => ({
        campaign_id: retryData.id,
        customer_name: c.name || null,
        customer_number: c.phone,
        status: 'pending',
      }))
      await client.from('ai_campaign_calls').insert(callRows)

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      fetch(`${baseUrl}/api/ai-agents/campaigns/${retryData.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did }),
      }).catch((err) => console.error('Failed to trigger campaign execution:', err))

      return NextResponse.json({ campaign: retrycampaign || retryData }, { status: 201 })
    }

    if (createError || !campaign) {
      console.error('Failed to create campaign:', createError)
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
    }

    // Insert individual call rows (one per contact)
    const callRows = contacts.map((c) => ({
      campaign_id: campaign.id,
      customer_name: c.name || null,
      customer_number: c.phone,
      status: 'pending',
    }))

    const { error: rowsError } = await client.from('ai_campaign_calls').insert(callRows)
    if (rowsError) {
      console.error('Failed to insert campaign call rows:', rowsError)
    }

    // Trigger background execution (fire-and-forget via self-call)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    fetch(`${baseUrl}/api/ai-agents/campaigns/${campaign.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      console.error('Failed to trigger campaign execution:', err)
    })

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (err) {
    console.error('Campaigns POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

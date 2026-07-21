import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  getIndusLabsAccessToken,
  isShriramPFAAgent,
  resolveAiCallingCallbackUrl,
  SHRIRAM_PFA_DIDS,
} from '@/lib/aiAgentsUtils'
import { triggerEvaluationPipeline } from '@/lib/aiCallingEvaluation'

// Allow this route to run for up to 5 minutes (Next.js max for background tasks)
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// POST /api/ai-agents/campaigns/[id]/execute — runs the full campaign loop server-side
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const campaignId = params.id
  const client = createServerClient()

  // Accept optional did from POST body (fallback when did column doesn't exist in DB yet)
  let bodyDid = ''
  try {
    const body = await req.json() as { did?: string }
    bodyDid = body?.did || ''
  } catch { /* no body */ }

  try {
    // Load campaign
    const { data: campaign, error: campError } = await client
      .from('ai_campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (campError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Guard: only start if in pending or if it was interrupted running
    if (campaign.status !== 'pending' && campaign.status !== 'running') {
      return NextResponse.json({ message: 'Campaign already executed or cancelled' })
    }

    // Load agent
    const { data: agent, error: agentError } = await client
      .from('ai_agents')
      .select('*')
      .eq('agent_id', campaign.agent_id)
      .single()

    if (agentError || !agent) {
      await client
        .from('ai_campaigns')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', campaignId)
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isShriramPFA = isShriramPFAAgent(agent.name)

    // Mark campaign as running
    await client
      .from('ai_campaigns')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', campaignId)

    // Get pending campaign call rows
    const { data: pendingRows, error: rowsError } = await client
      .from('ai_campaign_calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (rowsError || !pendingRows?.length) {
      await client
        .from('ai_campaigns')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', campaignId)
      return NextResponse.json({ message: 'No pending contacts' })
    }

    // Resolve auth and DID (use cached token if available)
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      // Mark campaign as failed
      await client
        .from('ai_campaigns')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', campaignId)
      
      // Update all pending rows to failed so the UI reflects the auth failure
      await client
        .from('ai_campaign_calls')
        .update({ status: 'failed', error_message: 'Failed to authenticate with IndusLabs API (504 Gateway Timeout or similar)' })
        .eq('campaign_id', campaignId)
        .eq('status', 'pending')

      return NextResponse.json({ error: 'IndusLabs auth failed' }, { status: 500 })
    }

    // Resolve DID: use campaign's stored DID first, then body did, then last successful call, then first Shriram PFA DID
    let did: string = (campaign.did as string) || bodyDid || ''
    if (!did) {
      const { data: lastCall } = await client
        .from('ai_calls')
        .select('did')
        .eq('agent_id', campaign.agent_id)
        .not('did', 'is', null)
        .neq('did', '')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      did = lastCall?.did || ''
    }
    if (!did && isShriramPFA) did = SHRIRAM_PFA_DIDS[0].value

    const callbackUrl = await resolveAiCallingCallbackUrl()

    let executedCount = campaign.executed_calls || 0
    let hadFailure = false

    for (const row of pendingRows) {
      // Check if campaign was cancelled mid-run
      const { data: freshCampaign } = await client
        .from('ai_campaigns')
        .select('status')
        .eq('id', campaignId)
        .single()

      if (freshCampaign?.status === 'cancelled') {
        console.log(`Campaign ${campaignId} was cancelled, stopping execution`)
        return NextResponse.json({ message: 'Campaign cancelled' })
      }

      // Normalize phone number
      let phone = row.customer_number.toString().trim().replace(/\s/g, '')
      if (!phone.startsWith('91')) phone = '91' + phone

      // Concurrency control: Wait until active channels for this DID are less than 2
      let activeCalls = 2
      let checkAttempts = 0
      while (activeCalls >= 2 && checkAttempts < 120) { // wait up to 10 minutes (120 * 5s)
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
        const { count } = await client
          .from('ai_calls')
          .select('*', { count: 'exact', head: true })
          .eq('did', did)
          .eq('status', 'in_progress')
          .gt('started_at', fifteenMinsAgo)
        
        activeCalls = count || 0
        if (activeCalls >= 2) {
          console.log(`[Campaign ${campaignId}] ${activeCalls} active calls on DID ${did}. Waiting 5 seconds...`)
          await sleep(5000)
          checkAttempts++
        }
      }

      const agentConfig: Record<string, string> = {}
      if (isShriramPFA && row.customer_name) {
        agentConfig.customer_name = row.customer_name
      }

      const payload: Record<string, unknown> = {
        customer_number: phone,
        agent_number: campaign.agent_id,
        did,
        callback_url: callbackUrl,
        transcript: true,
        transcript_language: 'en',
      }
      if (Object.keys(agentConfig).length > 0) {
        payload.agent_config = agentConfig
      }

      let callId: string | null = null
      let rowStatus: 'initiated' | 'failed' = 'failed'
      let errorMsg: string | null = null

      let maxRetries = 5;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch('https://developer.induslabs.io/api/calls/click2call', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          })

          if (response.ok) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data = await response.json() as any
            callId = data?.data?.call_id || null
            if (callId) {
              rowStatus = 'initiated'

              // Store AI call record in database
              await client.from('ai_calls').insert({
                call_id: callId,
                agent_id: campaign.agent_id,
                customer_number: phone,
                agent_number: campaign.agent_id,
                did,
                status: 'in_progress',
                call_type: 'unknown',
                transcript_status: 'pending',
                started_at: new Date().toISOString(),
                agent_config: Object.keys(agentConfig).length > 0 ? agentConfig : null,
              }).then()

              // Background transcript polling for each call
              pollCampaignCallTranscript(callId, accessToken, client).catch(console.error)
            }
            break // Success, break the retry loop
          } else if (response.status === 429) {
            // Rate limit / Channel limit hit. Wait and retry if we haven't exhausted retries
            if (attempt < maxRetries) {
              console.log(`[Campaign ${campaignId}] 429 Channel limit hit. Retrying in 5 seconds (attempt ${attempt}/${maxRetries})...`)
              await sleep(5000)
              continue
            } else {
              const errText = await response.text()
              errorMsg = `HTTP 429: ${errText.slice(0, 200)}`
              hadFailure = true
              break
            }
          } else {
            const errText = await response.text()
            errorMsg = `HTTP ${response.status}: ${errText.slice(0, 200)}`
            hadFailure = true
            break
          }
        } catch (err) {
          errorMsg = err instanceof Error ? err.message : 'Unknown error'
          hadFailure = true
          break
        }
      }

      // Update the campaign_call row
      await client
        .from('ai_campaign_calls')
        .update({
          status: rowStatus,
          call_id: callId,
          error_message: errorMsg,
        })
        .eq('id', row.id)

      // Increment executed count
      executedCount++
      await client
        .from('ai_campaigns')
        .update({ executed_calls: executedCount, updated_at: new Date().toISOString() })
        .eq('id', campaignId)

      // Small delay between calls to avoid rate limits
      await sleep(1500)
    }

    // Mark campaign as completed (or failed if ALL calls failed)
    const finalStatus = hadFailure && executedCount === 0 ? 'failed' : 'completed'
    await client
      .from('ai_campaigns')
      .update({ status: finalStatus, updated_at: new Date().toISOString() })
      .eq('id', campaignId)

    return NextResponse.json({ success: true, executed: executedCount })
  } catch (err) {
    console.error('Campaign execute error:', err)
    await client
      .from('ai_campaigns')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', campaignId)
    return NextResponse.json({ error: 'Campaign execution failed' }, { status: 500 })
  }
}

// Background transcript polling helper (mirrors logic in initiate/route.ts)
async function pollCampaignCallTranscript(
  callId: string,
  accessToken: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
) {
  const maxAttempts = 60
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleep(2000)
    try {
      const res = await fetch(
        `https://developer.induslabs.io/api/calls/${callId}/transcript`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      if (!res.ok) continue

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = await res.json() as any
      const transcriptStatus = payload.data?.transcript_status
      const duration = payload.data?.duration ? Number(payload.data.duration) : null
      const recordingUrl = payload.data?.recording || null

      if (transcriptStatus === 'ready') {
        const summary = payload.data?.transcript?.summary || null
        const callOutcome = payload.data?.transcript?.call_outcome || null
        const transcriptId = payload.data?.transcript?.transcript_id || null
        const history = payload.data?.transcript?.history || []
        const transcriptCreatedAt = payload.data?.transcript?.createdAt || null

        await client.from('ai_transcripts').upsert({ call_id: callId, transcript_id: transcriptId, summary, call_outcome: callOutcome, history })
        await client.from('ai_calls').update({
          transcript_status: 'completed',
          duration: duration ?? 0,
          recording_url: recordingUrl,
          outcome: callOutcome,
          status: 'completed',
          ended_at: transcriptCreatedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('call_id', callId)

        if (recordingUrl) {
          await triggerEvaluationPipeline({ callId, recordingUrl })
        }
        return
      }

      if (transcriptStatus === 'failed') {
        await client.from('ai_calls').update({
          transcript_status: 'failed',
          duration: duration ?? 0,
          recording_url: recordingUrl,
          status: 'failed',
          updated_at: new Date().toISOString(),
        }).eq('call_id', callId)
        return
      }
    } catch (err) {
      console.error(`Transcript polling error for ${callId}:`, err)
    }
  }
}

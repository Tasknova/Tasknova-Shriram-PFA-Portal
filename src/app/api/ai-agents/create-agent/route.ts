import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'
import { logAPICall } from '@/lib/apiLogger'

const INDUSLABS_API_URL = 'https://developer.induslabs.io/api'

export async function POST(request: Request) {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json() as Record<string, unknown>

    // Get access token from IndusLabs login
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to authenticate with IndusLabs API' },
        { status: 500 }
      )
    }

    // Prepare the agent creation payload
    const agentPayload = {
      agent_in: {
        agent_name: body.agent_name,
        agent_description: body.agent_description || '',
        team: [],
        agent_type: body.agent_type || 'OUTBOUND',
        is_auto: body.is_auto !== false,
      },
      agent_config: {
        system_prompt: body.system_prompt,
        starting_instructions: body.starting_instructions,
        agent_type: 'generic_alpha',
        guardrail_ids: [
          'personality_v1',
          'environment_v1',
          'tone_v1',
          'goal_v1',
          'Guardrails_v1',
          'ethical_v1',
          'data_formatting_v1',
          'disconnect_guardrail_v1',
        ],
        metadata_schema: [],
        examples: [],
        guidelines: [],
        llm_config: {
          provider: 'groq',
          model: 'openai/gpt-oss-120b',
          temperature: body.temperature || 0.3,
          max_tokens: body.max_tokens || 512,
          context_turns: body.context_turns || 10,
        },
        notes: `Created at ${new Date().toISOString()}`,
        tts_config: {
          voice_id: body.voice_id || 'Indus-hi-maya',
        },
        stt_config: {
          provider: 'deepgram',
          language: body.stt_language || 'en',
        },
        vad_config: {
          min_silence_duration: body.min_silence_duration || 0.3,
          min_speech_duration: body.min_speech_duration || 0.4,
          activation_threshold: body.activation_threshold || 0.45,
        },
      },
      call_outcome: {
        outcome_name: 'call_status',
        outcome_description: 'Overall status of the call',
        outcome_type: 'FIXED',
        outcome_enum: ['successful', 'failed', 'abandoned'],
        is_visible: true,
      },
      call_infield: {
        field_name: 'customer_feedback',
        field_type: 'TEXT',
        field_enum: null,
        is_visible: true,
      },
    }

    // Call IndusLabs API
    const induslabsResponse = await fetch(`${INDUSLABS_API_URL}/agents/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentPayload),
    })

    if (!induslabsResponse.ok) {
      const error = await induslabsResponse.text()
      console.error('IndusLabs API error:', error)
      return NextResponse.json(
        { error: 'Failed to create agent via IndusLabs API' },
        { status: induslabsResponse.status }
      )
    }

    const induslabsData: { agent_id?: string; data?: { agent_id?: string } } = await induslabsResponse.json()
    const agentId = induslabsData.agent_id || induslabsData.data?.agent_id

    if (!agentId) {
      return NextResponse.json(
        { error: 'Invalid response from IndusLabs API' },
        { status: 400 }
      )
    }

    // Store in Supabase
    const client = createServerClient()

    // Check if agent already exists
    const { data: existingAgent } = await client
      .from('ai_agents')
      .select('agent_id')
      .eq('agent_id', agentId)
      .single()

    if (!existingAgent) {
      // Insert agent only if it doesn't exist
      const { error: insertError } = await client.from('ai_agents').insert([
        {
          agent_id: agentId,
          name: body.agent_name,
          status: 'active',
          metadata: {
            description: body.agent_description,
            type: body.agent_type,
          },
        },
      ])

      if (insertError && insertError.code !== '23505') {
        console.error('Database insert error:', insertError)
      }
    }

    // Delete existing prompt versions for this agent (reset to clean state)
    await client.from('prompt_versions').delete().eq('agent_id', agentId)

    // Create initial prompt version with version "1"
    const { error: promptError } = await client.from('prompt_versions').insert([
      {
        agent_id: agentId,
        version: '1',
        prompt_text: body.system_prompt,
        is_active: true,
        performance_score: null,
        call_count: 0,
      },
    ])

    if (promptError) {
      console.error('Prompt version insert error:', promptError)
    }

    // Save initial config to ai_agent_configs table
    const configData = {
      agent_id: agentId,
      system_prompt: body.system_prompt,
      starting_instructions: body.starting_instructions || '',
      agent_type: 'generic_alpha',
      guardrail_ids: [
        'personality_v1',
        'environment_v1',
        'tone_v1',
        'goal_v1',
        'Guardrails_v1',
        'ethical_v1',
        'data_formatting_v1',
        'disconnect_guardrail_v1',
      ],
      call_infields: [],
      tts_config: {
        voice_id: body.voice_id || 'Indus-hi-maya',
      },
      stt_config: {
        provider: 'deepgram',
        language: body.stt_language || 'en',
      },
      llm_config: {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        temperature: body.temperature || 0.3,
        max_tokens: body.max_tokens || 512,
        context_turns: body.context_turns || 10,
      },
      vad_config: {
        min_silence_duration: body.min_silence_duration || 0.3,
        min_speech_duration: body.min_speech_duration || 0.4,
        activation_threshold: body.activation_threshold || 0.45,
      },
      notes: `Created at ${new Date().toISOString()}`,
      status: 'active',
      version: 1,
      is_current: true,
      synced_at: new Date().toISOString(),
    }

    const { error: configError } = await client
      .from('ai_agent_configs')
      .insert([configData])

    if (configError && configError.code !== '23505') {
      const errorMsg = `Failed to save agent configuration: ${configError.message}`
      console.error(errorMsg, { agent_id: agentId, configError })
      
      // Log the failed config save
      await logAPICall({
        endpoint: '/api/ai-agents/create-agent',
        method: 'POST',
        agent_id: agentId,
        request_body: body,
        status_code: 500,
        response_body: { error: errorMsg },
        success: false,
        error_message: configError.message,
        duration_ms: 0,
      })

      return NextResponse.json(
        { error: errorMsg },
        { status: 500 }
      )
    }

    const successResponse = {
      agent_id: agentId,
      agent_name: body.agent_name,
      message: 'Agent created successfully',
      config_saved: true,
    }

    // Log successful creation
    await logAPICall({
      endpoint: '/api/ai-agents/create-agent',
      method: 'POST',
      agent_id: agentId,
      request_body: body,
      status_code: 200,
      response_body: successResponse,
      success: true,
      duration_ms: 0,
    })

    return NextResponse.json(successResponse)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error creating agent:', error)

    // Log the error (body was captured at the start of the function)
    await logAPICall({
      endpoint: '/api/ai-agents/create-agent',
      method: 'POST',
      agent_id: body?.agent_id as string | undefined,
      request_body: body,
      status_code: 500,
      response_body: { error: errorMessage },
      success: false,
      error_message: errorMessage,
      duration_ms: 0,
    })

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

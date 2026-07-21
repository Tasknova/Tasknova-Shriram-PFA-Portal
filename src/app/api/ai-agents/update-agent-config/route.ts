import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'
import { logAPICall } from '@/lib/apiLogger'

const INDUSLABS_API_URL = 'https://developer.induslabs.io/api'

export async function POST(request: Request) {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json() as Record<string, unknown>
    const { 
      agent_id, 
      system_prompt, 
      starting_instructions,
      voice_id,
      stt_language,
      temperature,
      max_tokens,
      context_turns,
      min_silence_duration,
      min_speech_duration,
      activation_threshold,
      call_infields
    } = body

    if (!agent_id || !system_prompt) {
      return NextResponse.json(
        { error: 'agent_id and system_prompt are required' },
        { status: 400 }
      )
    }

    // Get access token from IndusLabs login
    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Failed to authenticate with IndusLabs API' },
        { status: 500 }
      )
    }

    const client = createServerClient()

    // Get all versions for this agent to determine next version number
    const { data: allVersions, error: versionError } = await client
      .from('prompt_versions')
      .select('version')
      .eq('agent_id', agent_id)
      .order('version', { ascending: false })

    if (versionError) {
      console.error('Error fetching versions:', versionError)
    }

    // Calculate next version number
    let nextVersion = '1'
    if (allVersions && allVersions.length > 0) {
      try {
        const versionNumbers = allVersions
          .map((v) => parseInt(v.version) || 0)
          .filter((n) => !isNaN(n))
        
        if (versionNumbers.length > 0) {
          const maxVersion = Math.max(...versionNumbers)
          nextVersion = (maxVersion + 1).toString()
        }
      } catch (error) {
        console.error('Error parsing versions:', error)
        nextVersion = (allVersions.length + 1).toString()
      }
    }

    // Prepare config payload for IndusLabs
    const configPayload = {
      system_prompt,
      starting_instructions: starting_instructions || '',
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
        temperature: temperature || 0.3,
        max_tokens: max_tokens || 512,
        context_turns: context_turns || 10,
      },
      notes: `Updated at ${new Date().toISOString()} - Version ${nextVersion}`,
      tts_config: {
        voice_id: voice_id || 'Indus-hi-maya',
      },
      stt_config: {
        provider: 'deepgram',
        language: stt_language || 'en',
      },
      vad_config: {
        min_silence_duration: min_silence_duration || 0.3,
        min_speech_duration: min_speech_duration || 0.4,
        activation_threshold: activation_threshold || 0.45,
      },
    }

    // Call IndusLabs API to update config
    // Try POST /agents/{agent_id}/configs?publish=true with Bearer access token
    const induslabsResponse = await fetch(
      `${INDUSLABS_API_URL}/agents/${agent_id}/configs?publish=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configPayload),
      }
    )

    console.log(`IndusLabs API response: ${induslabsResponse.status} ${induslabsResponse.statusText}`)

    if (!induslabsResponse.ok) {
      const error = await induslabsResponse.text()
      console.error('IndusLabs API error:', error)
      return NextResponse.json(
        { error: `Failed to update agent config via IndusLabs API: ${induslabsResponse.status}` },
        { status: induslabsResponse.status }
      )
    }

    // Save full configuration to ai_agent_configs table
    const { data: existingConfig } = await client
      .from('ai_agent_configs')
      .select('id')
      .eq('agent_id', agent_id)
      .single()

    // Transform call_infields for storage
    const call_infields_array = call_infields ? (call_infields as Array<{field_name?: string; field_type?: string; is_visible?: boolean; name?: string; type?: string}>).map((field) => 
      JSON.stringify({
        field_name: field.field_name || field.name || '',
        field_type: field.field_type || field.type || 'TEXT',
        is_visible: field.is_visible !== false,
      })
    ) : []

    const configData = {
      agent_id,
      system_prompt,
      starting_instructions: starting_instructions || '',
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
      call_infields: call_infields_array,
      tts_config: {
        voice_id: voice_id || 'Indus-hi-maya',
      },
      stt_config: {
        provider: 'deepgram',
        language: stt_language || 'en',
      },
      llm_config: {
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        temperature: temperature || 0.3,
        max_tokens: max_tokens || 512,
        context_turns: context_turns || 10,
      },
      vad_config: {
        min_silence_duration: min_silence_duration || 0.3,
        min_speech_duration: min_speech_duration || 0.4,
        activation_threshold: activation_threshold || 0.45,
      },
      notes: `Updated at ${new Date().toISOString()} - Version ${nextVersion}`,
      status: 'active',
      version: parseInt(nextVersion),
      is_current: true,
      full_config: configPayload,
      synced_at: new Date().toISOString(),
    }

    let configError
    if (existingConfig) {
      // Update existing config
      const { error: updateError } = await client
        .from('ai_agent_configs')
        .update({...configData, updated_at: new Date().toISOString()})
        .eq('agent_id', agent_id)
      configError = updateError
    } else {
      // Insert new config
      const { error: insertError } = await client
        .from('ai_agent_configs')
        .insert([configData])
      configError = insertError
    }

    // CRITICAL: If database save fails, return error response
    if (configError) {
      const errorMsg = `Failed to save agent configuration to database: ${configError.message}`
      console.error(errorMsg, { agent_id, configError })
      
      // Log the failed attempt
      await logAPICall({
        endpoint: '/api/ai-agents/update-agent-config',
        method: 'POST',
        agent_id: agent_id as string,
        request_body: body,
        status_code: 500,
        response_body: { error: errorMsg },
        success: false,
        error_message: configError.message,
        duration_ms: 0,
      })

      return NextResponse.json(
        { error: errorMsg, code: 'DB_SAVE_FAILED' },
        { status: 500 }
      )
    }

    // Update old versions to set is_active = false
    await client
      .from('prompt_versions')
      .update({ is_active: false })
      .eq('agent_id', agent_id)
      .eq('is_active', true)

    // Create new prompt version
    const { error: promptError } = await client
      .from('prompt_versions')
      .insert([
        {
          agent_id,
          version: nextVersion,
          prompt_text: system_prompt,
          is_active: true,
          performance_score: null,
          call_count: 0,
        },
      ])

    if (promptError) {
      console.error('Prompt version insert error:', promptError)
      return NextResponse.json(
        { error: 'Failed to create new prompt version' },
        { status: 500 }
      )
    }

    const successResponse = {
      agent_id,
      new_version: nextVersion,
      message: 'Agent config updated successfully. All details saved to database.',
      config_saved: true,
      version_created: true,
    }

    // Log successful API call
    await logAPICall({
      endpoint: '/api/ai-agents/update-agent-config',
      method: 'POST',
      agent_id: agent_id as string,
      request_body: body,
      status_code: 200,
      response_body: successResponse,
      success: true,
      duration_ms: 0,
    })

    return NextResponse.json(successResponse)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update agent config'
    console.error('Error updating agent config:', error)

    // Log the error (body was captured at the start of the function)
    await logAPICall({
      endpoint: '/api/ai-agents/update-agent-config',
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

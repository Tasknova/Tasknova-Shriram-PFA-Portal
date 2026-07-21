import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * Insert test agent config data for testing
 * This helps verify the frontend works while debugging IndusLabs API issues
 */
export async function POST() {
  try {
    console.log('=== Inserting Test Config ===')
    const client = createServerClient()
    console.log('Supabase client created')

    // Sample config data for agent AGT_0FBEDCFF
    const testConfig = {
      agent_id: 'AGT_0FBEDCFF',
      system_prompt:
        'You are a helpful AI assistant designed to assist with customer support inquiries. You are professional, courteous, and knowledgeable.',
      starting_instructions:
        'Begin by greeting the caller warmly. Ask how you can assist them today. Listen carefully to their concern and provide appropriate solutions.',
      agent_type: 'support',
      guardrail_ids: ['GUARDRAIL_1', 'GUARDRAIL_2'],
      call_infields: ['customer_id', 'issue_type'],
      tts_config: {
        provider: 'google',
        voice: 'en-US-Neural2-C',
        speed: 1.0,
      },
      stt_config: {
        provider: 'google',
        language: 'en-US',
        model: 'latest_long',
      },
      llm_config: {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 500,
      },
      vad_config: {
        enabled: true,
        threshold: 0.5,
      },
      notes: 'Test configuration for agent AGT_0FBEDCFF',
      status: 'active',
      version: 1,
      is_current: true,
      full_config: {
        agent_id: 'AGT_0FBEDCFF',
        system_prompt:
          'You are a helpful AI assistant designed to assist with customer support inquiries.',
        name: 'Test Support Agent',
      },
    }

    console.log('Inserting test config for agent AGT_0FBEDCFF...')

    const { data, error } = await client
      .from('ai_agent_configs')
      .upsert([testConfig], { onConflict: 'agent_id' })
      .select()

    if (error) {
      console.error('Error inserting config:', error)
      return NextResponse.json(
        {
          error: 'Failed to insert config',
          details: error.message,
          code: error.code,
        },
        { status: 500 }
      )
    }

    console.log('Test config inserted successfully:', data)

    return NextResponse.json({
      success: true,
      message: 'Test config inserted successfully',
      data,
    })
  } catch (error) {
    console.error('Insert test config error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Error details:', errorMessage)
    return NextResponse.json(
      {
        error: errorMessage,
        type: error instanceof Error ? error.name : 'Unknown',
      },
      { status: 500 }
    )
  }
}

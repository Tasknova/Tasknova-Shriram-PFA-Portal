import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * Create the ai_agent_configs table directly
 */
export async function POST() {
  try {
    console.log('=== Creating AI Agent Configs Table ===')
    const client = createServerClient()

    // Create the table using the Supabase client's raw query capability
    // We'll use the admin API by making a direct request with admin credentials
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.ai_agent_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id TEXT NOT NULL UNIQUE REFERENCES public.ai_agents(agent_id) ON DELETE CASCADE,
      system_prompt TEXT,
      starting_instructions TEXT,
      agent_type TEXT,
      guardrail_ids TEXT[] DEFAULT '{}',
      call_infields TEXT[] DEFAULT '{}',
      tts_config JSONB,
      stt_config JSONB,
      llm_config JSONB,
      vad_config JSONB,
      notes TEXT,
      status TEXT DEFAULT 'active',
      version INT DEFAULT 1,
      is_current BOOLEAN DEFAULT TRUE,
      full_config JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      synced_at TIMESTAMP WITH TIME ZONE
    );
    
    CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_agent_id ON public.ai_agent_configs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ai_agent_configs_status ON public.ai_agent_configs(status);
    
    ALTER TABLE public.ai_agent_configs ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.ai_agent_configs;
    DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON public.ai_agent_configs;
    DROP POLICY IF EXISTS "Enable update access for authenticated users" ON public.ai_agent_configs;
    
    CREATE POLICY "Enable read access for all users" ON public.ai_agent_configs
      FOR SELECT USING (true);
    
    CREATE POLICY "Enable insert access for authenticated users" ON public.ai_agent_configs
      FOR INSERT WITH CHECK (true);
    
    CREATE POLICY "Enable update access for authenticated users" ON public.ai_agent_configs
      FOR UPDATE USING (true) WITH CHECK (true);
    `

    // Use the client to execute the query
    // The Supabase JS client doesn't support raw SQL, but we can try through the REST API
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.log('Missing Supabase credentials')
      return NextResponse.json({
        error: 'Missing Supabase credentials',
        hint: 'Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set',
      })
    }

    // Try to execute using a function/RPC that creates the table
    // First, let's just try the rpc call approach
    const { data, error } = await client.rpc('exec_sql', {
      sql: createTableSQL,
    })

    if (!error) {
      console.log('Table created successfully!')
      return NextResponse.json({
        success: true,
        message: 'Table created successfully',
        data,
      })
    }

    // If RPC doesn't work, the function might not exist
    console.log('RPC exec_sql not available, trying alternative method...')

    // Return instruction to manually execute
    return NextResponse.json({
      success: false,
      message: 'Could not create table automatically',
      hint: 'This requires either:1. Running migrations via Supabase CLI: supabase db push2. Or executing raw SQL through Supabase dashboard',
      error: error?.message,
    })
  } catch (error) {
    console.error('Create table error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}

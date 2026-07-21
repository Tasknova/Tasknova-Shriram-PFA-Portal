import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

/**
 * Setup endpoint to create missing ai_agent_configs table
 */
export async function POST() {
  try {
    console.log('=== Setting Up AI Agent Configs Table ===')
    const client = createServerClient()

    // Check if table exists by trying to query it
    console.log('Checking if ai_agent_configs table exists...')
    const { data: existingData, error: checkError } = await client
      .from('ai_agent_configs')
      .select('COUNT(*) as count', { count: 'exact' })
      .limit(1)

    if (!checkError) {
      console.log('Table already exists')
      return NextResponse.json({
        success: true,
        message: 'Table already exists',
        data: existingData,
      })
    }

    // If table doesn't exist, we'll get an error
    console.log('Table does not exist, attempting to create it via raw query...')

    // Use Supabase RPC or admin API to create the table
    // Unfortunately, the JavaScript client doesn't support raw DDL
    // We'll return instructions instead
    return NextResponse.json({
      success: false,
      message: 'Table ai_agent_configs does not exist',
      instructions:
        'Run the following migration: supabase migration up or apply migration 025_create_ai_agent_configs_table.sql',
      error: checkError?.message,
    })
  } catch (error) {
    console.error('Setup error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    )
  }
}

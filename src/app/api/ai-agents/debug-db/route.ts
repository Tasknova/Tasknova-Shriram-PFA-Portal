import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // Check what's in the database
    const { data: allAgents, error: agentsError } = await client
      .from('ai_agents')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: syncStatus } = await client
      .from('ai_settings')
      .select('*')
      .eq('setting_key', 'last_agents_sync')
      .single()

    return NextResponse.json({
      agents_in_db: allAgents?.length || 0,
      all_agents: allAgents || [],
      last_sync_setting: syncStatus || null,
      agents_error: agentsError?.message || null,
    })
  } catch (error) {
    console.error('Error debugging database:', error)
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    )
  }
}

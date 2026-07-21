import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()
    const agentId = 'AGT_3FD52A75'

    // Check ai_agent_configs
    const { data: configs } = await client
      .from('ai_agent_configs')
      .select('*')
      .eq('agent_id', agentId)

    // Check prompt_versions
    const { data: versions } = await client
      .from('prompt_versions')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    return NextResponse.json({
      agent_id: agentId,
      configs_in_db: configs?.length || 0,
      versions_in_db: versions?.length || 0,
      configs,
      versions,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

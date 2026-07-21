import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()
    const agentId = 'AGT_3FD52A75'

    // Query all versions without order
    const { data: allVersions, error } = await client
      .from('prompt_versions')
      .select('version, created_at')
      .eq('agent_id', agentId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      agent_id: agentId,
      all_versions_in_db: allVersions,
      total_count: allVersions?.length || 0,
      versions_summary: allVersions?.map(v => `v${v.version}`).join(', '),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

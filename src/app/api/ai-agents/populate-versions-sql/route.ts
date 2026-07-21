import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Missing Supabase credentials' },
        { status: 400 }
      )
    }

    const client = createClient(supabaseUrl, supabaseServiceKey)
    const agentId = 'AGT_3FD52A75'

    // Use raw SQL to insert the versions
    const insertSql = `
      INSERT INTO prompt_versions (agent_id, version, prompt_text, is_active, created_at, updated_at)
      VALUES 
        ('${agentId}', '4', 'Process Engineer Role Screening Prompt - Version 4 (Archived)', false, now(), now()),
        ('${agentId}', '3', 'Process Engineer Role Screening Prompt - Version 3 (Archived)', false, now(), now()),
        ('${agentId}', '2', 'Process Engineer Role Screening Prompt - Version 2 (Archived)', false, now(), now())
      ON CONFLICT (agent_id, version) DO NOTHING
      RETURNING *;
    `

    const { error } = await client.rpc('exec_sql', { sql: insertSql })

    if (error) {
      console.error('SQL Error:', error)
      // Try alternative approach using REST API
      const insertResult = await insertVersionsViaRest(client, agentId)
      return NextResponse.json(insertResult)
    }

    // Verify final state
    const { data: finalVersions } = await client
      .from('prompt_versions')
      .select('version')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })

    return NextResponse.json({
      agent_id: agentId,
      message: 'Versions populated successfully via SQL',
      final_versions: finalVersions?.map(v => v.version),
      total_count: finalVersions?.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

async function insertVersionsViaRest(client: SupabaseClient, agentId: string) {
  const versionsToAdd = ['4', '3', '2']
  const results = []

  for (const version of versionsToAdd) {
    const { error } = await client.from('prompt_versions').insert(
      {
        agent_id: agentId,
        version: version,
        prompt_text: `Process Engineer Role Screening Prompt - Version ${version} (Archived)`,
        is_active: false,
      }
    )

    if (error) {
      results.push({ version, status: 'error', error: error.message })
    } else {
      results.push({ version, status: 'inserted' })
    }
  }

  // Check final state
  const { data: finalVersions } = await client
    .from('prompt_versions')
    .select('version')
    .eq('agent_id', agentId)

  return {
    agent_id: agentId,
    insert_attempts: results,
    final_versions: finalVersions?.map(v => v.version),
    total_count: finalVersions?.length,
  }
}

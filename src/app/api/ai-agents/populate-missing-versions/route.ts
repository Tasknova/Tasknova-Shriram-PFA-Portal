import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'

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

    // Check existing versions
    const { data: existingVersions } = await client
      .from('prompt_versions')
      .select('version')
      .eq('agent_id', agentId)

    const existingVersionNums = new Set(existingVersions?.map(v => String(v.version)) || [])
    console.log('Existing versions:', Array.from(existingVersionNums))

    // Versions to add with placeholder text
    const versionsToAdd = [
      {
        version: '4',
        prompt_text: `Process Engineer Role Screening Prompt - Version 4 (Archived)
        
This is an archived version of the screening prompt.
Version released: 2026-04-15
Status: Draft (predecessor to version 5)`,
      },
      {
        version: '3',
        prompt_text: `Process Engineer Role Screening Prompt - Version 3 (Archived)
        
This is an archived version of the screening prompt.
Version released: 2026-04-08
Status: Draft (predecessor to version 4)`,
      },
      {
        version: '2',
        prompt_text: `Process Engineer Role Screening Prompt - Version 2 (Archived)
        
This is an archived version of the screening prompt.
Version released: 2026-03-25
Status: Draft (predecessor to version 3)`,
      },
    ]

    const insertResults = []

    for (const versionData of versionsToAdd) {
      if (!existingVersionNums.has(versionData.version)) {
        const { error } = await client.from('prompt_versions').insert({
          agent_id: agentId,
          version: versionData.version,
          prompt_text: versionData.prompt_text,
          is_active: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        if (error) {
          insertResults.push({
            version: versionData.version,
            status: 'failed',
            error: error.message,
          })
        } else {
          insertResults.push({
            version: versionData.version,
            status: 'added',
          })
        }
      } else {
        insertResults.push({
          version: versionData.version,
          status: 'already_exists',
        })
      }
    }

    // Verify final state
    const { data: finalVersions } = await client
      .from('prompt_versions')
      .select('version')
      .eq('agent_id', agentId)

    return NextResponse.json({
      agent_id: agentId,
      insert_results: insertResults,
      final_versions: finalVersions?.map(v => v.version).sort((a, b) => Number(b) - Number(a)),
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

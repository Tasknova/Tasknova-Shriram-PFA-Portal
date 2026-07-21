// Script to populate missing prompt versions
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseKey)

async function populateMissingVersions() {
  const agentId = 'AGT_3FD52A75'
  
  // Check which versions are missing
  const { data: existingVersions } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('agent_id', agentId)
  
  console.log('Existing versions:', existingVersions?.map(v => v.version))
  
  const versionsToAdd = [
    { version: '4', text: 'Process Engineer Role Screening Prompt - Version 4 (Archived)' },
    { version: '3', text: 'Process Engineer Role Screening Prompt - Version 3 (Archived)' },
    { version: '2', text: 'Process Engineer Role Screening Prompt - Version 2 (Archived)' }
  ]
  
  const existingVersionNums = new Set(existingVersions?.map(v => String(v.version)) || [])
  
  for (const versionData of versionsToAdd) {
    if (!existingVersionNums.has(versionData.version)) {
      console.log(`\nAdding version ${versionData.version}...`)
      
      const { data, error } = await supabase
        .from('prompt_versions')
        .insert({
          agent_id: agentId,
          version: versionData.version,
          prompt_text: versionData.text,
          is_active: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        console.error(`Error adding version ${versionData.version}:`, error)
      } else {
        console.log(`✓ Version ${versionData.version} added`)
      }
    } else {
      console.log(`Version ${versionData.version} already exists, skipping`)
    }
  }
  
  // Verify final state
  const { data: finalVersions } = await supabase
    .from('prompt_versions')
    .select('version')
    .eq('agent_id', agentId)
  
  console.log('\nFinal versions:', finalVersions?.map(v => v.version))
  console.log(`Total versions: ${finalVersions?.length}`)
}

populateMissingVersions().catch(console.error)

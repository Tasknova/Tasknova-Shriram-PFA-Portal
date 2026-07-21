import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

async function run() {
  console.log('Cleaning up old evaluations...')
  const { data, error } = await supabase
    .from('ai_evaluations')
    .delete()
    .eq('error_message', 'Failed to parse URL from pending')

  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Deleted orphaned evaluations!')
  }
}

run()

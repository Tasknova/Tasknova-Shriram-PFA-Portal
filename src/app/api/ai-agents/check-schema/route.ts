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

    // Get table info
    const { data: tableInfo, error: tableError } = await client
      .from('information_schema.columns')
      .select('*')
      .eq('table_name', 'prompt_versions')

    if (tableError) {
      console.error('Table info error:', tableError)
    }

    // Try to see constraints
    const { data: constraints, error: constraintError } = await client
      .from('information_schema.key_column_usage')
      .select('*')
      .eq('table_name', 'prompt_versions')

    if (constraintError) {
      console.error('Constraint error:', constraintError)
    }

    // Get existing data
    const { data: existing, error: existingError } = await client
      .from('prompt_versions')
      .select('*')
      .eq('agent_id', 'AGT_3FD52A75')

    return NextResponse.json({
      table_info: tableInfo,
      constraints: constraints,
      existing_data: existing,
      existing_error: existingError?.message,
      table_error: tableError?.message,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // Get recent calls
    const { data: calls } = await client
      .from('ai_calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    // Get recent audit logs
    const { data: auditLogs } = await client
      .from('ai_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    // Get all settings
    const { data: settings } = await client.from('ai_settings').select('*')

    return NextResponse.json(
      {
        recent_calls: calls,
        recent_audit_logs: auditLogs,
        settings,
      },
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

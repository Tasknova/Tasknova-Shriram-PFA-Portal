import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // Get last sync timestamp
    const { data: lastSyncData } = await client
      .from('ai_settings')
      .select('setting_value')
      .eq('setting_key', 'last_agents_sync')
      .single()

    let lastSyncTime: Date | null = null
    if (lastSyncData?.setting_value) {
      try {
        lastSyncTime = new Date(lastSyncData.setting_value)
      } catch (error) {
        console.log('Invalid last_sync timestamp:', lastSyncData.setting_value, error)
      }
    }

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    // Check if we need to sync
    const needsSync = !lastSyncTime || lastSyncTime < oneHourAgo

    return NextResponse.json({
      needs_sync: needsSync,
      last_sync: lastSyncTime?.toISOString() || null,
      next_sync_at: lastSyncTime
        ? new Date(lastSyncTime.getTime() + 60 * 60 * 1000).toISOString()
        : null,
      time_until_next_sync_minutes: lastSyncTime
        ? Math.max(0, Math.ceil((new Date(lastSyncTime.getTime() + 60 * 60 * 1000).getTime() - now.getTime()) / (1000 * 60)))
        : 0,
    })
  } catch (error) {
    console.error('Error checking sync status:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

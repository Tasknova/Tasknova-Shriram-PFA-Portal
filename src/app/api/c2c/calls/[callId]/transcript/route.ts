import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { callId: string } }
) {
  try {
    const { callId } = params
    const client = createServerClient()

    const { data, error } = await client
      .from('c2c_transcripts')
      .select('*')
      .eq('call_id', callId)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Transcript not found' }, { status: 404 })
    }

    return NextResponse.json({ transcript: data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[C2C] Error fetching transcript:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

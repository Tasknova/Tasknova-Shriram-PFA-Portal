import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = createServerClient()
    const agentId = params.id

    // Fetch calls for agent
    const { data: callData, error: callError } = await client
      .from('ai_calls')
      .select('call_id, status, call_type, duration')
      .eq('agent_id', agentId)

    if (callError) {
      console.error('Database error:', callError)
      return NextResponse.json(
        { error: 'Failed to fetch agent metrics' },
        { status: 500 }
      )
    }

    // Fetch evaluations for agent's calls
    const callIds = (callData || []).map((c) => c.call_id)
    const { data: evalData } = await callIds.length > 0
      ? await client
          .from('ai_evaluations')
          .select('score, call_id')
          .in('call_id', callIds)
      : { data: [] }

    const totalCalls = callData?.length || 0
    const validCalls = callData?.filter((c) => c.call_type === 'valid').length || 0
    const failedCalls = callData?.filter((c) => c.call_type === 'failed').length || 0
    const invalidCalls = callData?.filter((c) => c.call_type === 'invalid').length || 0
    const completedCalls = callData?.filter((c) => c.status === 'completed').length || 0

    const avgScore =
      evalData && evalData.length > 0
        ? evalData.reduce((sum, e) => sum + e.score, 0) / evalData.length
        : 0

    const successRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0

    // Average duration
    const avgDuration =
      callData && callData.length > 0
        ? callData.reduce((sum, c) => sum + (c.duration || 0), 0) / callData.length
        : 0

    return NextResponse.json({
      agent_id: agentId,
      total_calls: totalCalls,
      valid_calls: validCalls,
      failed_calls: failedCalls,
      invalid_calls: invalidCalls,
      completed_calls: completedCalls,
      avg_score: Math.round(avgScore * 100) / 100,
      success_rate: Math.round(successRate * 100) / 100,
      avg_duration: Math.round(avgDuration),
    })
  } catch (error) {
    console.error('Error fetching agent metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

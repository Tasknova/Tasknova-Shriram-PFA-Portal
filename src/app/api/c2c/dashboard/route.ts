import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const client = createServerClient()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch recent C2C calls
    const { data: calls, error: callsError } = await client
      .from('c2c_calls')
      .select('call_id, status, duration, created_at, started_at, ended_at')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })

    if (callsError) console.error('[C2C] Error fetching calls:', callsError)

    const allCalls = calls || []
    const callIds = allCalls.map((c) => c.call_id)

    // Fetch evaluations for recent calls
    let evals: Array<{ call_id: string; overall_score: number | null; score: number | null }> = []
    if (callIds.length > 0) {
      const { data: evalData } = await client
        .from('c2c_evaluations')
        .select('call_id, overall_score, score')
        .in('call_id', callIds)
        .eq('status', 'completed')
      evals = evalData || []
    }

    // KPI metrics
    const totalCalls = allCalls.length
    const completedCalls = allCalls.filter((c) => c.status === 'completed').length
    const failedCalls = allCalls.filter((c) => c.status === 'failed').length
    const pendingCalls = allCalls.filter((c) => ['pending', 'in_progress'].includes(c.status)).length

    // Avg duration using started_at/ended_at
    const durationsWithData = allCalls.filter((c) => c.started_at && c.ended_at)
    const avgDuration =
      durationsWithData.length > 0
        ? durationsWithData.reduce((sum, c) => {
            const diff = Math.floor(
              (new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000
            )
            return sum + Math.max(0, Math.min(diff, 7200))
          }, 0) / durationsWithData.length
        : 0

    // Avg evaluation score
    const completedEvals = evals.filter(
      (e) => typeof (e.overall_score ?? e.score) === 'number'
    )
    const avgScore =
      completedEvals.length > 0
        ? completedEvals.reduce((sum, e) => sum + ((e.overall_score ?? e.score) as number), 0) /
          completedEvals.length
        : 0

    // Calls over time (trend)
    const callsByDate: Record<string, number> = {}
    allCalls.forEach((c) => {
      const date = c.created_at.split('T')[0]
      callsByDate[date] = (callsByDate[date] || 0) + 1
    })
    const callsOverTime = Object.entries(callsByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Score trend
    const scoreTrend = (() => {
      const byDate: Record<string, number[]> = {}
      evals.forEach((e) => {
        const call = allCalls.find((c) => c.call_id === e.call_id)
        if (!call) return
        const date = call.created_at.split('T')[0]
        const score = (e.overall_score ?? e.score) as number | null
        if (typeof score === 'number') {
          if (!byDate[date]) byDate[date] = []
          byDate[date].push(score)
        }
      })
      return Object.entries(byDate)
        .map(([date, scores]) => ({
          date,
          avg_score: scores.reduce((a, b) => a + b, 0) / scores.length,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    })()

    // Status distribution
    const statusDistribution: Record<string, number> = {}
    allCalls.forEach((c) => {
      statusDistribution[c.status] = (statusDistribution[c.status] || 0) + 1
    })

    return NextResponse.json(
      {
        metrics: {
          total_calls: totalCalls,
          completed_calls: completedCalls,
          failed_calls: failedCalls,
          pending_calls: pendingCalls,
          avg_duration: Math.round(avgDuration),
          avg_evaluation_score: Math.round(avgScore * 100) / 100,
        },
        trends: {
          calls_over_time: callsOverTime,
          score_trend: scoreTrend,
          status_distribution: statusDistribution,
        },
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error) {
    console.error('[C2C] Dashboard error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Fetch only recent calls (last 30 days) - much faster than all calls
    const { data: recentCalls, error: callsError } = await client
      .from('ai_calls')
      .select('call_id, agent_id, call_type, created_at, status')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })

    if (callsError) {
      console.error('Error fetching calls:', callsError)
    }

    // Fetch evaluations only for recent calls - much faster
    const callIds = (recentCalls || []).map((c) => c.call_id)
    let recentEvaluations: Array<{ score: number; call_id: string; issues: string[] }> = []
    
    if (callIds.length > 0) {
      const { data: evals, error: evaluationsError } = await client
        .from('ai_evaluations')
        .select('score, call_id, issues')
        .in('call_id', callIds)

      if (evaluationsError) {
        console.error('Error fetching evaluations:', evaluationsError)
      } else {
        recentEvaluations = (evals as Array<{ score: number; call_id: string; issues: string[] }>) || []
      }
    }

    // Fetch agents
    const { data: agents, error: agentsError } = await client
      .from('ai_agents')
      .select('agent_id, name')

    if (agentsError) {
      console.error('Error fetching agents:', agentsError)
    }

    const calls = recentCalls || []
    const evaluations = recentEvaluations
    const agentsList = agents || []

    // Calculate metrics
    const totalCalls = calls.length
    const validCalls = calls.filter((c) => c.call_type === 'valid').length
    const failedCalls = calls.filter((c) => c.call_type === 'failed').length
    const invalidCalls = calls.filter((c) => c.call_type === 'invalid').length

    const avgEvaluationScore =
      evaluations.length > 0
        ? evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length
        : 0

    const conversionRate = totalCalls > 0 ? (validCalls / totalCalls) * 100 : 0

    // Group calls by date for trend
    const callsByDate: { [key: string]: number } = {}
    calls.forEach((call) => {
      const date = new Date(call.created_at).toISOString().split('T')[0]
      callsByDate[date] = (callsByDate[date] || 0) + 1
    })

    const callTrend = Object.entries(callsByDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Score trend
    const scoreTrend = evaluations
      .map((e) => {
        const call = calls.find((c) => c.call_id === e.call_id)
        return { date: call?.created_at?.split('T')[0], score: e.score }
      })
      .filter((item) => item.date)
      .reduce(
        (acc, item) => {
          const existing = acc.find((a) => a.date === item.date)
          if (existing) {
            existing.scores.push(item.score)
          } else {
            acc.push({ date: item.date, scores: [item.score] })
          }
          return acc
        },
        [] as { date: string | undefined; scores: number[] }[]
      )
      .map((item) => ({
        date: item.date,
        avg_score: item.scores.reduce((a, b) => a + b, 0) / item.scores.length,
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

    // Outcome distribution
    const outcomes: { [key: string]: number } = {}
    calls.forEach((call) => {
      const outcome = call.call_type || 'unknown'
      outcomes[outcome] = (outcomes[outcome] || 0) + 1
    })

    // Most common issues
    const issueFrequency: { [key: string]: number } = {}
    evaluations.forEach((evaluation: { score?: number; call_id?: string; issues?: string[] }) => {
      if (evaluation.issues && Array.isArray(evaluation.issues)) {
        evaluation.issues.forEach((issue: string) => {
          issueFrequency[issue] = (issueFrequency[issue] || 0) + 1
        })
      }
    })

    const commonIssues = Object.entries(issueFrequency)
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Best performing agent
    const agentPerformance = agentsList.map((agent) => {
      const agentCalls = calls.filter((c) => c.agent_id === agent.agent_id)
      const agentEvals = evaluations.filter((e) =>
        agentCalls.some((c) => c.call_id === e.call_id)
      )
      const avgScore =
        agentEvals.length > 0
          ? agentEvals.reduce((sum, e) => sum + e.score, 0) / agentEvals.length
          : 0

      return {
        agent_id: agent.agent_id,
        name: agent.name,
        total_calls: agentCalls.length,
        avg_score: avgScore,
      }
    })

    const bestAgent = agentPerformance.sort((a, b) => b.avg_score - a.avg_score)[0]
    const worstAgent = agentPerformance.sort((a, b) => a.avg_score - b.avg_score)[0]

    const response = NextResponse.json({
      metrics: {
        total_calls: totalCalls,
        valid_calls: validCalls,
        failed_calls: failedCalls,
        invalid_calls: invalidCalls,
        avg_evaluation_score: Math.round(avgEvaluationScore * 100) / 100,
        conversion_rate: Math.round(conversionRate * 100) / 100,
      },
      trends: {
        calls_over_time: callTrend,
        score_trend: scoreTrend,
        outcome_distribution: outcomes,
      },
      insights: {
        most_common_issues: commonIssues,
        best_performing_agent: bestAgent,
        worst_performing_agent: worstAgent,
      },
    })
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return response
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

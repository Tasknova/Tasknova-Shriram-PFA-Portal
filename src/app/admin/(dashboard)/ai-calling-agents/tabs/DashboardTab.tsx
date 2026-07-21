'use client'
import { useEffect, useState } from 'react'
import { Line, Doughnut } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import toast from 'react-hot-toast'
import { TrendingUp, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

interface DashboardMetrics {
  metrics: {
    total_calls: number
    valid_calls: number
    failed_calls: number
    invalid_calls: number
    avg_evaluation_score: number
    conversion_rate: number
  }
  trends: {
    calls_over_time: { date: string; count: number }[]
    score_trend: { date: string; avg_score: number }[]
    outcome_distribution: { [key: string]: number }
  }
  insights: {
    most_common_issues: { issue: string; count: number }[]
    best_performing_agent: { agent_id: string; name: string; total_calls: number; avg_score: number }
    worst_performing_agent: { agent_id: string; name: string; total_calls: number; avg_score: number }
  }
}

export default function DashboardTab() {
  const [data, setData] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/ai-agents/dashboard', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to fetch dashboard data')
      const result = await response.json()
      console.log('Dashboard API Response:', result)
      setData(result)
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchDashboardData()
  }

  if (loading) {
    return <div className="text-center py-8">Loading dashboard...</div>
  }

  if (!data) {
    return <div className="text-center py-8 text-red-600">Failed to load dashboard data</div>
  }

  const { metrics, trends, insights } = data

  // Prepare chart data
  const callsChartData = {
    labels: trends.calls_over_time.map((item) => item.date),
    datasets: [
      {
        label: 'Calls',
        data: trends.calls_over_time.map((item) => item.count),
        borderColor: 'rgb(168, 85, 247)',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        tension: 0.4,
      },
    ],
  }

  const scoreChartData = {
    labels: trends.score_trend.map((item) => item.date),
    datasets: [
      {
        label: 'Average Score',
        data: trends.score_trend.map((item) => item.avg_score),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
      },
    ],
  }

  const outcomeData = {
    labels: Object.keys(trends.outcome_distribution),
    datasets: [
      {
        label: 'Call Outcomes',
        data: Object.values(trends.outcome_distribution),
        backgroundColor: [
          'rgba(34, 197, 94, 0.6)',
          'rgba(239, 68, 68, 0.6)',
          'rgba(245, 158, 11, 0.6)',
          'rgba(99, 102, 241, 0.6)',
        ],
        borderColor: [
          'rgb(34, 197, 94)',
          'rgb(239, 68, 68)',
          'rgb(245, 158, 11)',
          'rgb(99, 102, 241)',
        ],
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<Clock className="w-8 h-8" />}
          title="Total Calls"
          value={metrics.total_calls}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <MetricCard
          icon={<CheckCircle className="w-8 h-8" />}
          title="Valid Calls"
          value={metrics.valid_calls}
          color="text-green-600"
          bgColor="bg-green-50"
        />
        <MetricCard
          icon={<AlertCircle className="w-8 h-8" />}
          title="Failed Calls"
          value={metrics.failed_calls}
          color="text-red-600"
          bgColor="bg-red-50"
        />
        <MetricCard
          icon={<TrendingUp className="w-8 h-8" />}
          title="Avg Score"
          value={metrics.avg_evaluation_score.toFixed(2)}
          color="text-purple-600"
          bgColor="bg-purple-50"
        />
      </div>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetricCard
          title="Conversion Rate"
          value={`${metrics.conversion_rate.toFixed(2)}%`}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
        <MetricCard
          title="Invalid Calls"
          value={metrics.invalid_calls}
          color="text-yellow-600"
          bgColor="bg-yellow-50"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls Over Time */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Calls Over Time</h3>
          <Line
            data={callsChartData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true } },
            }}
          />
        </div>

        {/* Score Trend */}
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Score Trend</h3>
          <Line
            data={scoreChartData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { min: 0, max: 100 } },
            }}
          />
        </div>
      </div>

      {/* Outcome Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Outcome Distribution</h3>
          <Doughnut
            data={outcomeData}
            options={{
              responsive: true,
              plugins: { legend: { position: 'bottom' as const } },
            }}
          />
        </div>

        {/* Insights */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Insights</h3>

          {/* Most Common Issues */}
          {insights.most_common_issues.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 text-sm mb-2">Most Common Issues:</h4>
              <ul className="space-y-1">
                {insights.most_common_issues.map((issue, idx) => (
                  <li key={idx} className="text-sm text-gray-600">
                    {issue.issue} ({issue.count})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Best Performing Agent */}
          {insights.best_performing_agent && (
            <div>
              <h4 className="font-medium text-gray-700 text-sm mb-2">Best Performing Agent:</h4>
              <p className="text-sm text-green-600 font-medium">{insights.best_performing_agent.name}</p>
              <p className="text-sm text-gray-600">
                Avg Score: {insights.best_performing_agent.avg_score ? insights.best_performing_agent.avg_score.toFixed(2) : 'N/A'}
              </p>
            </div>
          )}

          {/* Worst Performing Agent */}
          {insights.worst_performing_agent && (
            <div>
              <h4 className="font-medium text-gray-700 text-sm mb-2">Needs Attention:</h4>
              <p className="text-sm text-red-600 font-medium">{insights.worst_performing_agent.name}</p>
              <p className="text-sm text-gray-600">
                Avg Score: {insights.worst_performing_agent.avg_score ? insights.worst_performing_agent.avg_score.toFixed(2) : 'N/A'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  icon,
  title,
  value,
  color,
  bgColor,
}: {
  icon?: React.ReactNode
  title: string
  value: string | number
  color: string
  bgColor: string
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
        {icon && <div className={`${color} ${bgColor} p-3 rounded-lg`}>{icon}</div>}
      </div>
    </div>
  )
}

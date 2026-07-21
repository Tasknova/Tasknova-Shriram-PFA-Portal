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
import { TrendingUp, AlertCircle, CheckCircle, Clock, RefreshCw, PhoneCall, Timer } from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

interface C2CDashboardMetrics {
  metrics: {
    total_calls: number
    completed_calls: number
    failed_calls: number
    pending_calls: number
    avg_duration: number
    avg_evaluation_score: number
  }
  trends: {
    calls_over_time: { date: string; count: number }[]
    score_trend: { date: string; avg_score: number }[]
    status_distribution: Record<string, number>
  }
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return m === 0 ? `${s}s` : `${m}m ${s}s`
}

export default function DashboardTab() {
  const [data, setData] = useState<C2CDashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/c2c/dashboard', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch dashboard data')
      const result = await response.json()
      setData(result)
    } catch (error) {
      console.error('[C2C Dashboard] Error:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchDashboardData()
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    void fetchDashboardData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4 animate-pulse">
            <PhoneCall className="w-6 h-6 text-blue-600" />
          </div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-red-600">Failed to load dashboard data</div>
    )
  }

  const { metrics, trends } = data

  const callsChartData = {
    labels: trends.calls_over_time.map((item) => item.date),
    datasets: [
      {
        label: 'Calls',
        data: trends.calls_over_time.map((item) => item.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
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
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        tension: 0.4,
      },
    ],
  }

  const statusColors: Record<string, string> = {
    completed: 'rgba(34, 197, 94, 0.6)',
    failed: 'rgba(239, 68, 68, 0.6)',
    pending: 'rgba(245, 158, 11, 0.6)',
    in_progress: 'rgba(99, 102, 241, 0.6)',
  }

  const statusLabels = Object.keys(trends.status_distribution)
  const statusData = {
    labels: statusLabels,
    datasets: [
      {
        label: 'Call Status',
        data: statusLabels.map((k) => trends.status_distribution[k]),
        backgroundColor: statusLabels.map((k) => statusColors[k] || 'rgba(156, 163, 175, 0.6)'),
        borderColor: statusLabels.map((k) => (statusColors[k] || 'rgba(156, 163, 175, 0.6)').replace('0.6', '1')),
      },
    ],
  }

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard icon={<PhoneCall className="w-8 h-8" />} title="Total Calls" value={metrics.total_calls} color="text-blue-600" bgColor="bg-blue-50" />
        <MetricCard icon={<CheckCircle className="w-8 h-8" />} title="Completed Calls" value={metrics.completed_calls} color="text-green-600" bgColor="bg-green-50" />
        <MetricCard icon={<AlertCircle className="w-8 h-8" />} title="Failed Calls" value={metrics.failed_calls} color="text-red-600" bgColor="bg-red-50" />
        <MetricCard icon={<Clock className="w-8 h-8" />} title="Pending / In-Progress" value={metrics.pending_calls} color="text-yellow-600" bgColor="bg-yellow-50" />
        <MetricCard icon={<Timer className="w-8 h-8" />} title="Avg Duration" value={formatDuration(metrics.avg_duration)} color="text-purple-600" bgColor="bg-purple-50" />
        <MetricCard icon={<TrendingUp className="w-8 h-8" />} title="Avg Evaluation Score" value={metrics.avg_evaluation_score > 0 ? metrics.avg_evaluation_score.toFixed(1) : '-'} color="text-indigo-600" bgColor="bg-indigo-50" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Calls Over Time</h3>
          {trends.calls_over_time.length > 0 ? (
            <Line data={callsChartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }} />
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">No data yet</div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Evaluation Score Trend</h3>
          {trends.score_trend.length > 0 ? (
            <Line data={scoreChartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }} />
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">No evaluations yet</div>
          )}
        </div>
      </div>

      {/* Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status Distribution</h3>
          {statusLabels.length > 0 ? (
            <Doughnut data={statusData} options={{ responsive: true, plugins: { legend: { position: 'bottom' as const } } }} />
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400">No calls yet</div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>
          <div className="space-y-3">
            <StatRow label="Completion Rate" value={metrics.total_calls > 0 ? `${((metrics.completed_calls / metrics.total_calls) * 100).toFixed(1)}%` : '-'} />
            <StatRow label="Failure Rate" value={metrics.total_calls > 0 ? `${((metrics.failed_calls / metrics.total_calls) * 100).toFixed(1)}%` : '-'} />
            <StatRow label="Calls Evaluated" value={metrics.avg_evaluation_score > 0 ? 'Yes' : 'None yet'} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ icon, title, value, color, bgColor }: {
  icon?: React.ReactNode; title: string; value: string | number; color: string; bgColor: string
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  )
}

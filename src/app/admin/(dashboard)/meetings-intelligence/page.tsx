'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BrainCircuit } from 'lucide-react'
import DataTable from '@/components/DataTable'
import { MeetingIntelligence } from '@/types'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

type MeetingIntelligenceRow = MeetingIntelligence & {
  standup?: {
    id: string
    meeting_title?: string
    meeting_date?: string
    created_at?: string
  } | null
}

export default function MeetingsIntelligencePage() {
  const router = useRouter()
  const [rows, setRows] = useState<MeetingIntelligenceRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIntelligence()
  }, [])

  const fetchIntelligence = async () => {
    try {
      const res = await fetch('/api/admin/meetings-intelligence')
      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      setRows(data || [])
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch meetings intelligence')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      key: 'meeting_id',
      label: 'Meeting',
      render: (_value: string, row: MeetingIntelligenceRow) => (
        <div>
          <div className="font-semibold text-gray-900">{row.standup?.meeting_title || 'Standup Meeting'}</div>
          <div className="text-xs text-gray-500">{row.meeting_id.slice(0, 8)}...</div>
        </div>
      ),
    },
    {
      key: 'tasks_completed',
      label: 'Tasks Completed',
      render: (value: number) => (typeof value === 'number' ? value : '-'),
    },
    {
      key: 'sentiment_score',
      label: 'Sentiment',
      render: (value: number) => (typeof value === 'number' ? `${value}/100` : '-'),
    },
    {
      key: 'meeting_efficiency_score',
      label: 'Efficiency',
      render: (value: number) => (typeof value === 'number' ? `${value}/100` : '-'),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value: string) => formatDateTime(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading meetings intelligence...</div>
  }

  const averageSentiment = rows.length
    ? Math.round(rows.reduce((acc, item) => acc + (item.sentiment_score || 0), 0) / rows.length)
    : 0

  const averageEfficiency = rows.length
    ? Math.round(rows.reduce((acc, item) => acc + (item.meeting_efficiency_score || 0), 0) / rows.length)
    : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <BrainCircuit className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Meetings Intelligence</h1>
        </div>
        <p className="text-indigo-100 text-lg">AI-generated standup analytics and operational signals</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Total Records</p>
            <p className="text-3xl font-bold mt-1">{rows.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Avg Sentiment</p>
            <p className="text-3xl font-bold mt-1">{averageSentiment}/100</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Avg Efficiency</p>
            <p className="text-3xl font-bold mt-1">{averageEfficiency}/100</p>
          </div>
        </div>
      </div>

      <DataTable
        data={rows}
        columns={columns}
        onView={(row) => {
          router.push(`/admin/meetings-intelligence/${row.id}`)
        }}
        searchKeys={['meeting_id', 'key_insights']}
      />
    </div>
  )
}



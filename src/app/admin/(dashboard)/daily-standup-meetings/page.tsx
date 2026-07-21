'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import DataTable from '@/components/DataTable'
import { DailyStandupMeeting } from '@/types'
import { formatDate, formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function DailyStandupMeetingsPage() {
  const router = useRouter()
  const [meetings, setMeetings] = useState<DailyStandupMeeting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMeetings()
  }, [])

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/admin/daily-standup-meetings')
      if (!res.ok) throw new Error('Request failed')

      const data = await res.json()
      setMeetings(data || [])
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch daily standup meetings')
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      key: 'meeting_title',
      label: 'Meeting',
      render: (value: string, row: DailyStandupMeeting) => (
        <div>
          <div className="font-semibold text-gray-900">{value || 'Daily Standup'}</div>
          <div className="text-xs text-gray-500">ID: {row.id.slice(0, 8)}...</div>
        </div>
      ),
    },
    {
      key: 'meeting_date',
      label: 'Meeting Date',
      render: (value: string) => (value ? formatDate(value) : '-'),
    },
    {
      key: 'meeting_duration',
      label: 'Duration',
      render: (value: number) => (typeof value === 'number' ? `${value} min` : '-'),
    },
    {
      key: 'processed',
      label: 'Processed',
      render: (value: boolean) => (
        <span className={`badge ${value ? 'badge-success' : 'badge-warning'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value: string) => formatDateTime(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading daily standup meetings...</div>
  }

  const processedCount = meetings.filter((item) => item.processed).length
  const failedCount = meetings.filter((item) => item.processing_error).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <ClipboardList className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Daily Standup Meetings</h1>
        </div>
        <p className="text-cyan-100 text-lg">Review standup meeting records and processing state</p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Total Meetings</p>
            <p className="text-3xl font-bold mt-1">{meetings.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Processed</p>
            <p className="text-3xl font-bold mt-1">{processedCount}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">With Errors</p>
            <p className="text-3xl font-bold mt-1">{failedCount}</p>
          </div>
        </div>
      </div>

      <DataTable
        data={meetings}
        columns={columns}
        onView={(row) => {
          router.push(`/admin/daily-standup-meetings/${row.id}`)
        }}
        searchKeys={['meeting_title', 'meeting_date', 'processing_error']}
      />
    </div>
  )
}



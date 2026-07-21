'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import DeleteConfirm from '@/components/DeleteConfirm'
import { VoiceConversation } from '@/types'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Phone } from 'lucide-react'

export default function VoiceConversationsPage() {
  const router = useRouter()
  const [conversations, setConversations] = useState<VoiceConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState<VoiceConversation | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    fetchConversations()
  }, [])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/admin/voice-conversations')
      const data = await res.json()
      setConversations(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch voice conversations')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedConvo) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/voice-conversations?id=${selectedConvo.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Voice conversation deleted')
      setDeleteModalOpen(false)
      setSelectedConvo(null)
      fetchConversations()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete voice conversation')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = [
    { 
      key: 'customer_name', 
      label: 'Customer', 
      render: (val: string, row: VoiceConversation) => (
        <div>
          <div className="font-semibold text-gray-900">{val || <span className="text-gray-400 italic">No Customer Data</span>}</div>
          {row.customer_email && <div className="text-xs text-gray-500">{row.customer_email}</div>}
        </div>
      )
    },
    { 
      key: 'customer_phone', 
      label: 'Phone', 
      render: (val: string) => val ? (
        <span className="text-sm font-mono text-gray-700">{val}</span>
      ) : (
        <span className="text-gray-400 italic text-xs">Not provided</span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (value: string) => {
        const statusConfig: Record<string, { class: string; label: string }> = {
          'ended': { class: 'badge-success', label: 'Ended' },
          'queued': { class: 'badge-warning', label: 'Queued' },
          'in_progress': { class: 'badge-info', label: 'In Progress' },
          'failed': { class: 'badge-danger', label: 'Failed' },
        }
        const config = statusConfig[value] || { class: 'badge-warning', label: value || 'Unknown' }
        return (
          <span className={`badge ${config.class}`}>
            {config.label}
          </span>
        )
      },
    },
    {
      key: 'duration_seconds',
      label: 'Duration',
      render: (value: number) => value ? (
        <span className="text-sm font-medium text-gray-700">
          {Math.floor(value / 60)}m {value % 60}s
        </span>
      ) : '-',
    },
    {
      key: 'cost',
      label: 'Cost',
      render: (value: number) => value ? (
        <span className="text-sm font-semibold text-green-600">
          ${value.toFixed(2)}
        </span>
      ) : '-',
    },
    {
      key: 'started_at',
      label: 'Date',
      render: (value: string) => value ? formatDateTime(value) : '-',
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-teal-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Phone className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Voice Conversations</h1>
        </div>
        <p className="text-teal-100 text-lg">Manage voice call recordings and transcripts</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">Total Calls</p>
            <p className="text-3xl font-bold mt-1">{conversations.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">With Customer Data</p>
            <p className="text-3xl font-bold mt-1">{conversations.filter(c => c.customer_name).length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-teal-100 text-xs font-semibold uppercase">Status: Ended</p>
            <p className="text-3xl font-bold mt-1">{conversations.filter(c => c.status === 'ended').length}</p>
          </div>
        </div>
      </div>

      <DataTable
        data={conversations}
        columns={columns}
        onView={(row) => {
          router.push(`/admin/voice-conversations/${row.id}`)
        }}
        onDelete={(row) => {
          setSelectedConvo(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['customer_name', 'customer_email', 'customer_phone']}
      />

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Voice Conversation"
        message="Are you sure you want to delete this voice conversation? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



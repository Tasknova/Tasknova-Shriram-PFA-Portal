'use client'

import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import { ChatConversation } from '@/types'
import { formatDateTime } from '@/lib/utils'
import toast from 'react-hot-toast'
import { MessageSquare } from 'lucide-react'

export default function ChatConversationsPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedConvo, setSelectedConvo] = useState<ChatConversation | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [sortBy, setSortBy] = useState<string>('date_desc')

  useEffect(() => {
    fetchConversations()
  }, [])

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/admin/chat-conversations')
      const data = await res.json()
      setConversations(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch chat conversations')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedConvo) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/chat-conversations?id=${selectedConvo.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Chat conversation deleted')
      setDeleteModalOpen(false)
      setSelectedConvo(null)
      fetchConversations()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete chat conversation')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = [
    { key: 'session_id', label: 'Session ID', render: (val: string) => val?.substring(0, 8) + '...' || '-' },
    { key: 'user_id', label: 'User ID', render: (val: string) => val?.substring(0, 8) + '...' || '-' },
    { key: 'agent_id', label: 'Agent ID', render: (val: string) => val || '-' },
    {
      key: 'messages',
      label: 'Messages',
      render: (val: unknown) => {
        if (!val) return '0'
        try {
          const messages = Array.isArray(val) ? val : JSON.parse(val as string)
          return messages.length
        } catch {
          return '0'
        }
      },
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (value: string) => formatDateTime(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  // Calculate stats
  const totalMessages = conversations.reduce((sum, conv) => {
    try {
      const messages = Array.isArray(conv.messages)
        ? conv.messages
        : typeof conv.messages === 'string'
          ? JSON.parse(conv.messages)
          : []
      return sum + messages.length
    } catch {
      return sum
    }
  }, 0)

  // Sort data
  const sortedData = [...conversations].sort((a, b) => {
    switch(sortBy) {
      case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      default: return 0
    }
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Chat Conversations</h1>
        </div>
        <p className="text-cyan-100 text-lg">Manage chatbot conversation sessions</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Total Sessions</p>
            <p className="text-3xl font-bold mt-1">{conversations.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Total Messages</p>
            <p className="text-3xl font-bold mt-1">{totalMessages}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-cyan-100 text-xs font-semibold uppercase">Avg Messages/Session</p>
            <p className="text-3xl font-bold mt-1">{conversations.length ? Math.round(totalMessages / conversations.length) : 0}</p>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={sortedData}
        columns={columns}
        onView={(row) => {
          setSelectedConvo(row)
          setViewModalOpen(true)
        }}
        onDelete={(row) => {
          setSelectedConvo(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['session_id', 'user_id']}
      />

      {/* View Modal */}
      {selectedConvo && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          title="Chat Conversation Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Session ID</label>
                <p className="mt-1 font-mono text-sm">{selectedConvo.session_id || '-'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">User ID</label>
                <p className="mt-1 font-mono text-sm">{selectedConvo.user_id || '-'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Agent ID</label>
                <p className="mt-1 font-mono text-sm">{selectedConvo.agent_id || '-'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Created At</label>
                <p className="mt-1">{formatDateTime(selectedConvo.created_at)}</p>
              </div>
            </div>

            {selectedConvo.summary && (
              <div>
                <label className="text-sm font-medium text-gray-700">Summary</label>
                <p className="mt-1 text-gray-600">{selectedConvo.summary}</p>
              </div>
            )}

            {selectedConvo.messages && (
              <div>
                <label className="text-sm font-medium text-gray-700">Messages</label>
                <div className="mt-2 space-y-2 max-h-96 overflow-auto">
                  {(() => {
                    try {
                      const messages = Array.isArray(selectedConvo.messages) 
                        ? selectedConvo.messages 
                        : typeof selectedConvo.messages === 'string'
                          ? JSON.parse(selectedConvo.messages)
                          : []
                      
                      return messages.map((msg: Record<string, unknown>, idx: number) => (
                        <div key={idx} className={`p-3 rounded ${
                          msg.role === 'user' ? 'bg-blue-50' : 'bg-gray-50'
                        }`}>
                          <p className="text-xs font-semibold text-gray-600 mb-1">
                            {msg.role === 'user' ? 'User' : 'Agent'}
                          </p>
                          <p className="text-sm text-gray-800">{String(msg.content ?? msg.message ?? '')}</p>
                        </div>
                      ))
                    } catch {
                      return <p className="text-sm text-gray-500">Unable to parse messages</p>
                    }
                  })()}
                </div>
              </div>
            )}

            {selectedConvo.metadata && (
              <div>
                <label className="text-sm font-medium text-gray-700">Metadata</label>
                <pre className="mt-1 text-xs bg-gray-50 p-3 rounded overflow-auto max-h-48">
                  {JSON.stringify(selectedConvo.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Chat Conversation"
        message="Are you sure you want to delete this chat conversation? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



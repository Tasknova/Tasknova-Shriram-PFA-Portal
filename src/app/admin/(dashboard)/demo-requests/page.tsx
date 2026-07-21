'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText } from 'lucide-react'
import DataTable from '@/components/DataTable'
import DeleteConfirm from '@/components/DeleteConfirm'
import { DemoRequest } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function DemoRequestsPage() {
  const router = useRouter()
  const [demoRequests, setDemoRequests] = useState<DemoRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDemo, setSelectedDemo] = useState<DemoRequest | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [mailFilter, setMailFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')

  useEffect(() => {
    fetchDemoRequests()
  }, [])

  const fetchDemoRequests = async () => {
    try {
      const res = await fetch('/api/admin/demo-requests')
      const data = await res.json()
      setDemoRequests(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch demo requests')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedDemo) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/demo-requests?id=${selectedDemo.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Demo request deleted')
      setDeleteModalOpen(false)
      setSelectedDemo(null)
      fetchDemoRequests()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete demo request')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = [
    { 
      key: 'name', 
      label: 'Name',
      render: (val: string, row: DemoRequest) => (
        <div>
          <div className="font-semibold text-gray-900">{val}</div>
          <div className="text-xs text-gray-500">{row.email}</div>
        </div>
      )
    },
    { 
      key: 'company', 
      label: 'Company',
      render: (val: string, row: DemoRequest) => (
        <div>
          <div className="font-medium text-gray-900">{val}</div>
          <div className="text-xs text-gray-500">{row.role}</div>
        </div>
      )
    },
    { key: 'team_size', label: 'Team Size' },
    {
      key: 'mail_sent',
      label: 'Mail Sent',
      render: (value: boolean) => (
        <span className={`badge ${value ? 'badge-success' : 'badge-warning'}`}>
          {value ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (value: string) => formatDate(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  // Filter and sort data
  const filteredAndSortedData = demoRequests
    .filter(demo => {
      if (mailFilter === 'sent') return demo.mail_sent === true
      if (mailFilter === 'pending') return demo.mail_sent === false
      return true
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'name_asc': return a.name.localeCompare(b.name)
        case 'name_desc': return b.name.localeCompare(a.name)
        case 'company_asc': return a.company.localeCompare(b.company)
        case 'company_desc': return b.company.localeCompare(a.company)
        default: return 0
      }
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Demo Requests</h1>
        </div>
        <p className="text-blue-100 text-lg">Manage demo booking requests</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Total Requests</p>
            <p className="text-3xl font-bold mt-1">{demoRequests.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Mail Sent</p>
            <p className="text-3xl font-bold mt-1">{demoRequests.filter(d => d.mail_sent).length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-blue-100 text-xs font-semibold uppercase">Pending</p>
            <p className="text-3xl font-bold mt-1">{demoRequests.filter(d => !d.mail_sent).length}</p>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Mail Status</label>
            <select 
              value={mailFilter} 
              onChange={(e) => setMailFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Requests</option>
              <option value="sent">Mail Sent</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="company_asc">Company (A-Z)</option>
              <option value="company_desc">Company (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredAndSortedData}
        columns={columns}
        onView={(row) => {
          router.push(`/admin/demo-requests/${row.id}`)
        }}
        onDelete={(row) => {
          setSelectedDemo(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['name', 'email', 'company']}
      />

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Demo Request"
        message="Are you sure you want to delete this demo request? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



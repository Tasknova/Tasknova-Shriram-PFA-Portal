'use client'

import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import FileUpload from '@/components/FileUpload'
import { Playbook } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Download, Book, Plus } from 'lucide-react'

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<Playbook>>({})
  const [sortBy, setSortBy] = useState<string>('downloads_desc')

  useEffect(() => {
    fetchPlaybooks()
  }, [])

  const fetchPlaybooks = async () => {
    try {
      const res = await fetch('/api/admin/playbooks')
      const data = await res.json()
      setPlaybooks(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch playbooks')
    } finally {
      setLoading(false)
    }
  }

  const fetchPlaybookDetails = async (id: string): Promise<Playbook | null> => {
    try {
      const res = await fetch(`/api/admin/playbooks?id=${id}`)
      if (!res.ok) throw new Error('Request failed')
      return await res.json()
    } catch {
      toast.error('Failed to load playbook details')
      return null
    }
  }

  const handleViewPlaybook = async (row: Playbook) => {
    const detailed = await fetchPlaybookDetails(row.id)
    if (!detailed) return

    setSelectedPlaybook(detailed)
    setViewModalOpen(true)
  }

  const handleEditPlaybook = async (row: Playbook) => {
    const detailed = await fetchPlaybookDetails(row.id)
    if (!detailed) return

    setSelectedPlaybook(detailed)
    setFormData({
      title: detailed.title,
      slug: detailed.slug,
      description: detailed.description || '',
      topics: detailed.topics || [],
      pages: detailed.pages,
      gradient: detailed.gradient || '',
      file_path: detailed.file_path || '',
      file_url: detailed.file_url || ''
    })
    setEditModalOpen(true)
  }

  const handleCreate = async () => {
    try {
      const payload = {
        ...formData,
        topics: typeof formData.topics === 'string' ? (formData.topics as string).split(',').map((t: string) => t.trim()) : formData.topics || [],
        pages: formData.pages || 0,
        downloads: 0,
      }

      const res = await fetch('/api/admin/playbooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        console.error('Server error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Create failed')
      }

      toast.success('Playbook created')
      setCreateModalOpen(false)
      setFormData({})
      fetchPlaybooks()
    } catch (error) {
      console.error('Create error:', error)
      const message = error instanceof Error ? error.message : 'Failed to create playbook'
      toast.error(message)
    }
  }

  const handleUpdate = async () => {
    if (!selectedPlaybook) return

    try {
      const payload = {
        ...formData,
        topics: typeof formData.topics === 'string' ? (formData.topics as string).split(',').map((t: string) => t.trim()) : formData.topics || [],
        pages: formData.pages || 0,
      }

      const res = await fetch(`/api/admin/playbooks?id=${selectedPlaybook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success('Playbook updated')
      setEditModalOpen(false)
      setSelectedPlaybook(null)
      setFormData({})
      fetchPlaybooks()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update playbook')
    }
  }

  const handleDelete = async () => {
    if (!selectedPlaybook) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/playbooks?id=${selectedPlaybook.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Playbook deleted')
      setDeleteModalOpen(false)
      setSelectedPlaybook(null)
      fetchPlaybooks()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete playbook')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'pages', label: 'Pages' },
    { key: 'downloads', label: 'Downloads' },
    {
      key: 'topics',
      label: 'Topics',
      render: (val: string[]) => val?.length || 0,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value: string) => formatDate(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  // Calculate stats
  const totalDownloads = playbooks.reduce((sum, p) => sum + (p.downloads || 0), 0)

  // Sort data
  const sortedData = [...playbooks].sort((a, b) => {
    switch(sortBy) {
      case 'downloads_desc': return (b.downloads || 0) - (a.downloads || 0)
      case 'downloads_asc': return (a.downloads || 0) - (b.downloads || 0)
      case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      case 'title_asc': return a.title.localeCompare(b.title)
      case 'title_desc': return b.title.localeCompare(a.title)
      default: return 0
    }
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Book className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Playbooks</h1>
        </div>
        <p className="text-orange-100 text-lg">Manage downloadable playbook resources</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-orange-100 text-xs font-semibold uppercase">Total Playbooks</p>
            <p className="text-3xl font-bold mt-1">{playbooks.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-orange-100 text-xs font-semibold uppercase">Total Downloads</p>
            <p className="text-3xl font-bold mt-1">{totalDownloads}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-orange-100 text-xs font-semibold uppercase">Avg Downloads</p>
            <p className="text-3xl font-bold mt-1">{playbooks.length ? Math.round(totalDownloads / playbooks.length) : 0}</p>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFormData({ title: '', slug: '', description: '', topics: [], pages: 0, gradient: '', file_path: '', file_url: '' })
            setCreateModalOpen(true)
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Playbook
        </button>
      </div>

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="downloads_desc">Downloads (High to Low)</option>
              <option value="downloads_asc">Downloads (Low to High)</option>
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="title_desc">Title (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={sortedData}
        columns={columns}
        onView={handleViewPlaybook}
        onEdit={handleEditPlaybook}
        onDelete={(row) => {
          setSelectedPlaybook(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['title', 'slug']}
      />

      {/* View Modal */}
      {selectedPlaybook && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          title="Playbook Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 font-semibold">{selectedPlaybook.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Slug</label>
                <p className="mt-1">{selectedPlaybook.slug}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Pages</label>
                <p className="mt-1">{selectedPlaybook.pages}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Downloads</label>
                <p className="mt-1">{selectedPlaybook.downloads}</p>
              </div>
            </div>

            {selectedPlaybook.description && (
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-600">{selectedPlaybook.description}</p>
              </div>
            )}

            {selectedPlaybook.topics && selectedPlaybook.topics.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Topics</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedPlaybook.topics.map((topic, idx) => (
                    <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full">
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selectedPlaybook.file_url && (
              <div>
                <label className="text-sm font-medium text-gray-700">Download Link</label>
                <a
                  href={selectedPlaybook.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Download className="w-4 h-4 mr-2" /> Download Playbook
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={createModalOpen || editModalOpen}
        onClose={() => {
          setCreateModalOpen(false)
          setEditModalOpen(false)
          setFormData({})
        }}
        title={createModalOpen ? 'Add Playbook' : 'Edit Playbook'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Enter playbook title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={formData.slug || ''}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="playbook-url-slug"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="Brief description of the playbook"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pages</label>
              <input
                type="number"
                value={formData.pages || ''}
                onChange={(e) => setFormData({ ...formData, pages: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Number of pages"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gradient</label>
              <input
                type="text"
                value={formData.gradient || ''}
                onChange={(e) => setFormData({ ...formData, gradient: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="e.g., from-orange-500 to-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Topics (comma-separated)</label>
            <input
              type="text"
              value={formData.topics ? (Array.isArray(formData.topics) ? formData.topics.join(', ') : formData.topics) : ''}
              onChange={(e) => setFormData({
                ...formData,
                topics: e.target.value.split(',').map((item) => item.trim()).filter(Boolean)
              })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              placeholder="Sales, Marketing, Strategy"
            />
          </div>

          <FileUpload
            value={formData.file_url || ''}
            onChange={(url) => setFormData({ ...formData, file_url: url, file_path: url })}
            label="Upload Playbook PDF"
            bucket="playbooks"
            accept=".pdf"
            fileType="pdf"
            maxSizeMB={10}
          />

          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setCreateModalOpen(false)
                setEditModalOpen(false)
                setFormData({})
              }}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={createModalOpen ? handleCreate : handleUpdate}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              {createModalOpen ? 'Create Playbook' : 'Update Playbook'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Playbook"
        message="Are you sure you want to delete this playbook? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



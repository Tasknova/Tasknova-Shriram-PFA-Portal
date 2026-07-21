'use client'

import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import FileUpload from '@/components/FileUpload'
import { IndustryReport } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Download, TrendingUp, Plus } from 'lucide-react'

export default function IndustryReportsPage() {
  const [reports, setReports] = useState<IndustryReport[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState<IndustryReport | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [formData, setFormData] = useState<Partial<IndustryReport>>({})
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('year_desc')

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/admin/industry-reports')
      const data = await res.json()
      setReports(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch industry reports')
    } finally {
      setLoading(false)
    }
  }

  const fetchReportDetails = async (id: string): Promise<IndustryReport | null> => {
    try {
      const res = await fetch(`/api/admin/industry-reports?id=${id}`)
      if (!res.ok) throw new Error('Request failed')
      return await res.json()
    } catch {
      toast.error('Failed to load report details')
      return null
    }
  }

  const handleViewReport = async (row: IndustryReport) => {
    const detailed = await fetchReportDetails(row.id)
    if (!detailed) return

    setSelectedReport(detailed)
    setViewModalOpen(true)
  }

  const handleEditReport = async (row: IndustryReport) => {
    const detailed = await fetchReportDetails(row.id)
    if (!detailed) return

    setSelectedReport(detailed)
    setFormData({
      title: detailed.title,
      slug: detailed.slug,
      description: detailed.description || '',
      year: detailed.year,
      pages: detailed.pages,
      gradient: detailed.gradient || '',
      icon: detailed.icon || '',
      key_findings: detailed.key_findings || [],
      pdf_url: detailed.pdf_url || '',
      is_published: detailed.is_published
    })
    setEditModalOpen(true)
  }

  const handleCreate = async () => {
    try {
      const payload = {
        ...formData,
        key_findings: typeof formData.key_findings === 'string' ? (formData.key_findings as string).split(',').map((f: string) => f.trim()) : formData.key_findings || [],
        pages: formData.pages || 0,
        year: formData.year || new Date().getFullYear().toString(),
        downloads: '0',
        is_published: formData.is_published || false,
      }

      const res = await fetch('/api/admin/industry-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        console.error('Server error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Create failed')
      }

      toast.success('Report created')
      setCreateModalOpen(false)
      setFormData({})
      fetchReports()
    } catch (error) {
      console.error('Create error:', error)
      const message = error instanceof Error ? error.message : 'Failed to create report'
      toast.error(message)
    }
  }

  const handleUpdate = async () => {
    if (!selectedReport) return

    try {
      const payload = {
        ...formData,
        key_findings: typeof formData.key_findings === 'string' ? (formData.key_findings as string).split(',').map((f: string) => f.trim()) : formData.key_findings || [],
        pages: formData.pages || 0,
        year: formData.year || new Date().getFullYear().toString(),
      }

      const res = await fetch(`/api/admin/industry-reports?id=${selectedReport.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success('Report updated')
      setEditModalOpen(false)
      setSelectedReport(null)
      setFormData({})
      fetchReports()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update report')
    }
  }

  const handleDelete = async () => {
    if (!selectedReport) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/industry-reports?id=${selectedReport.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Industry report deleted')
      setDeleteModalOpen(false)
      setSelectedReport(null)
      fetchReports()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete industry report')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleTogglePublish = async (report: IndustryReport) => {
    try {
      const res = await fetch('/api/admin/industry-reports', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: report.id, is_published: !report.is_published }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success(`Report ${!report.is_published ? 'published' : 'unpublished'}`)
      fetchReports()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update report status')
    }
  }

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'year', label: 'Year' },
    { key: 'pages', label: 'Pages' },
    { key: 'downloads', label: 'Downloads' },
    {
      key: 'is_published',
      label: 'Status',
      render: (value: boolean, row: IndustryReport) => (
        <button
          onClick={() => handleTogglePublish(row)}
          className={`px-2 py-1 text-xs rounded-full ${
            value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {value ? 'Published' : 'Draft'}
        </button>
      ),
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
  const totalDownloads = reports.reduce((sum, r) => sum + (Number(r.downloads) || 0), 0)

  // Filter and sort data
  const filteredAndSortedData = reports
    .filter(report => {
      if (statusFilter === 'published') return report.is_published === true
      if (statusFilter === 'draft') return report.is_published === false
      return true
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'year_desc': return Number(b.year) - Number(a.year)
        case 'year_asc': return Number(a.year) - Number(b.year)
        case 'downloads_desc': return (Number(b.downloads) || 0) - (Number(a.downloads) || 0)
        case 'downloads_asc': return (Number(a.downloads) || 0) - (Number(b.downloads) || 0)
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'title_asc': return a.title.localeCompare(b.title)
        case 'title_desc': return b.title.localeCompare(a.title)
        default: return 0
      }
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Industry Reports</h1>
        </div>
        <p className="text-emerald-100 text-lg">Manage research reports and benchmarks</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-emerald-100 text-xs font-semibold uppercase">Total Reports</p>
            <p className="text-3xl font-bold mt-1">{reports.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-emerald-100 text-xs font-semibold uppercase">Published</p>
            <p className="text-3xl font-bold mt-1">{reports.filter(r => r.is_published).length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-emerald-100 text-xs font-semibold uppercase">Total Downloads</p>
            <p className="text-3xl font-bold mt-1">{totalDownloads}</p>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFormData({ title: '', slug: '', description: '', year: new Date().getFullYear().toString(), pages: 0, gradient: '', icon: '', key_findings: [], pdf_url: '', is_published: false })
            setCreateModalOpen(true)
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Report
        </button>
      </div>

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="all">All Reports</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="year_desc">Year (Newest First)</option>
              <option value="year_asc">Year (Oldest First)</option>
              <option value="downloads_desc">Downloads (High to Low)</option>
              <option value="downloads_asc">Downloads (Low to High)</option>
              <option value="date_desc">Created Date (Newest)</option>
              <option value="date_asc">Created Date (Oldest)</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="title_desc">Title (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredAndSortedData}
        columns={columns}
        onView={handleViewReport}
        onEdit={handleEditReport}
        onDelete={(row) => {
          setSelectedReport(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['title', 'year']}
      />

      {/* View Modal */}
      {selectedReport && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          title="Industry Report Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 font-semibold">{selectedReport.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Year</label>
                <p className="mt-1">{selectedReport.year}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Pages</label>
                <p className="mt-1">{selectedReport.pages}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Downloads</label>
                <p className="mt-1">{selectedReport.downloads}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedReport.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedReport.is_published ? 'Published' : 'Draft'}
                  </span>
                </p>
              </div>
            </div>

            {selectedReport.description && (
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-600">{selectedReport.description}</p>
              </div>
            )}

            {selectedReport.key_findings && selectedReport.key_findings.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Key Findings</label>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  {selectedReport.key_findings.map((finding, idx) => (
                    <li key={idx} className="text-gray-600">{finding}</li>
                  ))}
                </ul>
              </div>
            )}

            {selectedReport.pdf_url && (
              <div>
                <label className="text-sm font-medium text-gray-700">Download Report</label>
                <a
                  href={selectedReport.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Download className="w-4 h-4 mr-2" /> Download PDF
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
        title={createModalOpen ? 'Add Report' : 'Edit Report'}
        size="xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                value={formData.title || ''}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Enter report title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={formData.slug || ''}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="report-url-slug"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Brief description of the report"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
              <input
                type="text"
                value={formData.year || ''}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="2024"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pages</label>
              <input
                type="number"
                value={formData.pages || ''}
                onChange={(e) => setFormData({ ...formData, pages: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Number of pages"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
              <input
                type="text"
                value={formData.icon || ''}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Icon name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gradient</label>
            <input
              type="text"
              value={formData.gradient || ''}
              onChange={(e) => setFormData({ ...formData, gradient: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="e.g., from-emerald-500 to-teal-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key Findings (comma-separated)</label>
            <textarea
              value={formData.key_findings ? (Array.isArray(formData.key_findings) ? formData.key_findings.join(', ') : formData.key_findings) : ''}
              onChange={(e) => setFormData({
                ...formData,
                key_findings: e.target.value.split(',').map((item) => item.trim()).filter(Boolean)
              })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Finding 1, Finding 2, Finding 3"
            />
          </div>

          <FileUpload
            value={formData.pdf_url || ''}
            onChange={(url) => setFormData({ ...formData, pdf_url: url })}
            label="Upload Industry Report PDF"
            bucket="industry-reports"
            accept=".pdf"
            fileType="pdf"
            maxSizeMB={20}
          />

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_published_report"
              checked={formData.is_published || false}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
            />
            <label htmlFor="is_published_report" className="ml-2 block text-sm text-gray-700">
              Published
            </label>
          </div>

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
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              {createModalOpen ? 'Create Report' : 'Update Report'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Industry Report"
        message="Are you sure you want to delete this industry report? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



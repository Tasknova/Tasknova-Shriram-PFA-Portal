'use client'

import { useEffect, useState } from 'react'
import { Plus, Briefcase } from 'lucide-react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import { JobOpening } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function JobOpeningsPage() {
  const [jobs, setJobs] = useState<JobOpening[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<JobOpening | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<JobOpening>>({
    title: '',
    department: '',
    location: '',
    type: 'Full-time',
    description: '',
    about: '',
    responsibilities: [],
    skills: [],
    is_active: true
  })
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [responsibilityInput, setResponsibilityInput] = useState('')
  const [skillInput, setSkillInput] = useState('')

  useEffect(() => {
    fetchJobs()
  }, [])

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/admin/job-openings')
      const data = await res.json()
      setJobs(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch job openings')
    } finally {
      setLoading(false)
    }
  }

  const fetchJobDetails = async (id: string): Promise<JobOpening | null> => {
    try {
      const res = await fetch(`/api/admin/job-openings?id=${id}`)
      if (!res.ok) throw new Error('Request failed')
      return await res.json()
    } catch {
      toast.error('Failed to load job details')
      return null
    }
  }

  const handleViewJob = async (row: JobOpening) => {
    const detailed = await fetchJobDetails(row.id)
    if (!detailed) return

    setSelectedJob(detailed)
    setViewModalOpen(true)
  }

  const handleOpenEditJob = async (row: JobOpening) => {
    const detailed = await fetchJobDetails(row.id)
    if (!detailed) return

    setSelectedJob(detailed)
    setFormData({
      title: detailed.title,
      department: detailed.department,
      location: detailed.location,
      type: detailed.type,
      description: detailed.description,
      about: detailed.about,
      responsibilities: detailed.responsibilities || [],
      skills: detailed.skills || [],
      is_active: detailed.is_active
    })
    setEditModalOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedJob) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/job-openings?id=${selectedJob.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Job opening deleted')
      setDeleteModalOpen(false)
      setSelectedJob(null)
      fetchJobs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete job opening')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleToggleActive = async (job: JobOpening) => {
    try {
      const res = await fetch('/api/admin/job-openings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, is_active: !job.is_active }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success(`Job ${!job.is_active ? 'activated' : 'deactivated'}`)
      fetchJobs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update job status')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveLoading(true)
    try {
      const res = await fetch('/api/admin/job-openings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) throw new Error('Create failed')

      toast.success('Job opening created')
      setCreateModalOpen(false)
      setFormData({ title: '', department: '', location: '', type: 'Full-time', description: '', about: '', responsibilities: [], skills: [], is_active: true })
      fetchJobs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to create job opening')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedJob) return

    setSaveLoading(true)
    try {
      const res = await fetch('/api/admin/job-openings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, id: selectedJob.id }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success('Job opening updated')
      setEditModalOpen(false)
      setSelectedJob(null)
      fetchJobs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update job opening')
    } finally {
      setSaveLoading(false)
    }
  }

  const addResponsibility = () => {
    if (responsibilityInput.trim()) {
      setFormData(prev => ({
        ...prev,
        responsibilities: [...(prev.responsibilities || []), responsibilityInput.trim()]
      }))
      setResponsibilityInput('')
    }
  }

  const removeResponsibility = (index: number) => {
    setFormData(prev => ({
      ...prev,
      responsibilities: prev.responsibilities?.filter((_, i) => i !== index) || []
    }))
  }

  const addSkill = () => {
    if (skillInput.trim()) {
      setFormData(prev => ({
        ...prev,
        skills: [...(prev.skills || []), skillInput.trim()]
      }))
      setSkillInput('')
    }
  }

  const removeSkill = (index: number) => {
    setFormData(prev => ({
      ...prev,
      skills: prev.skills?.filter((_, i) => i !== index) || []
    }))
  }

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'department', label: 'Department' },
    { key: 'location', label: 'Location' },
    { key: 'type', label: 'Type' },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean, row: JobOpening) => (
        <button
          onClick={() => handleToggleActive(row)}
          className={`px-2 py-1 text-xs rounded-full ${
            value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          }`}
        >
          {value ? 'Active' : 'Inactive'}
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

  // Get unique departments
  const departments = Array.from(new Set(jobs.map(j => j.department)))

  // Filter and sort data
  const filteredAndSortedData = jobs
    .filter(job => {
      if (statusFilter === 'active') return job.is_active === true
      if (statusFilter === 'inactive') return job.is_active === false
      return true
    })
    .filter(job => {
      if (departmentFilter === 'all') return true
      return job.department === departmentFilter
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'title_asc': return a.title.localeCompare(b.title)
        case 'title_desc': return b.title.localeCompare(a.title)
        default: return 0
      }
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Briefcase className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Job Openings</h1>
        </div>
        <p className="text-green-100 text-lg">Manage job postings</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-green-100 text-xs font-semibold uppercase">Total Jobs</p>
            <p className="text-3xl font-bold mt-1">{jobs.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-green-100 text-xs font-semibold uppercase">Active</p>
            <p className="text-3xl font-bold mt-1">{jobs.filter(j => j.is_active).length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-green-100 text-xs font-semibold uppercase">Departments</p>
            <p className="text-3xl font-bold mt-1">{departments.length}</p>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFormData({ title: '', department: '', location: '', type: 'Full-time', description: '', about: '', responsibilities: [], skills: [], is_active: true })
            setCreateModalOpen(true)
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Job Opening
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="all">All Jobs</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Department</label>
            <select 
              value={departmentFilter} 
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="title_desc">Title (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredAndSortedData}
        columns={columns}
        onView={handleViewJob}
        onEdit={handleOpenEditJob}
        onDelete={(row) => {
          setSelectedJob(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['title', 'department', 'location']}
      />

      {/* View Modal */}
      {selectedJob && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          title="Job Opening Details"
          size="lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 font-semibold">{selectedJob.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Department</label>
                <p className="mt-1">{selectedJob.department}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Location</label>
                <p className="mt-1">{selectedJob.location}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Type</label>
                <p className="mt-1">{selectedJob.type}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedJob.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedJob.is_active ? 'Active' : 'Inactive'}
                  </span>
                </p>
              </div>
            </div>
            {selectedJob.about && (
              <div>
                <label className="text-sm font-medium text-gray-700">About</label>
                <p className="mt-1 text-gray-600">{selectedJob.about}</p>
              </div>
            )}
            {selectedJob.description && (
              <div>
                <label className="text-sm font-medium text-gray-700">Description</label>
                <p className="mt-1 text-gray-600">{selectedJob.description}</p>
              </div>
            )}
            {selectedJob.responsibilities && selectedJob.responsibilities.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Responsibilities</label>
                <ul className="mt-1 list-disc list-inside space-y-1">
                  {selectedJob.responsibilities.map((resp, idx) => (
                    <li key={idx} className="text-gray-600">{resp}</li>
                  ))}
                </ul>
              </div>
            )}
            {selectedJob.skills && selectedJob.skills.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Required Skills</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedJob.skills.map((skill, idx) => (
                    <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full">
                      {skill}
                    </span>
                  ))}
                </div>
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
          setSelectedJob(null)
        }}
        title={createModalOpen ? 'Create Job Opening' : 'Edit Job Opening'}
        size="xl"
      >
        <form onSubmit={createModalOpen ? handleCreate : handleEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                type="text"
                required
                value={formData.title || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <input
                type="text"
                required
                value={formData.department || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input
                type="text"
                required
                value={formData.location || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select
                required
                value={formData.type || 'Full-time'}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                className="input-field"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">About</label>
            <textarea
              rows={3}
              value={formData.about || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, about: e.target.value }))}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={4}
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Responsibilities</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={responsibilityInput}
                onChange={(e) => setResponsibilityInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addResponsibility())}
                placeholder="Add responsibility and press Enter"
                className="input-field flex-1"
              />
              <button type="button" onClick={addResponsibility} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                Add
              </button>
            </div>
            <div className="space-y-2">
              {formData.responsibilities?.map((resp, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-sm">{resp}</span>
                  <button type="button" onClick={() => removeResponsibility(idx)} className="text-red-600 hover:text-red-800">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Required Skills</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Add skill and press Enter"
                className="input-field flex-1"
              />
              <button type="button" onClick={addSkill} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.skills?.map((skill, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-1 bg-primary-100 text-primary-800 rounded-full">
                  <span className="text-sm">{skill}</span>
                  <button type="button" onClick={() => removeSkill(idx)} className="text-primary-600 hover:text-primary-800 font-bold">
                    Ã—
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active || false}
              onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
              className="w-4 h-4"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Active
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => {
                setCreateModalOpen(false)
                setEditModalOpen(false)
                setSelectedJob(null)
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveLoading}
              className="btn-primary"
            >
              {saveLoading ? 'Saving...' : (createModalOpen ? 'Create' : 'Update')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Job Opening"
        message="Are you sure you want to delete this job opening? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



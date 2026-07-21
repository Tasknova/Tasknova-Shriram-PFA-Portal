'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import ProjectBrainPage from '@/components/ProjectBrainPage'
import { Plus, FolderKanban, CalendarDays, TrendingUp, Trash2, Edit2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import DeleteConfirm from '@/components/DeleteConfirm'

interface Project {
  id: string
  project_name: string
  description: string
  status: string
  created_at: string
  start_date: string | null
  end_date: string | null
}

export default function ProjectBrainAdminPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentAdmin, setCurrentAdmin] = useState<Record<string, unknown> | null>(null)
  const [showNewProjectForm, setShowNewProjectForm] = useState(false)
  const [newProject, setNewProject] = useState({
    project_name: '',
    description: '',
    start_date: '',
    end_date: ''
  })
  const [isNeverEnding, setIsNeverEnding] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editForm, setEditForm] = useState({
    project_name: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'active'
  })
  const [editIsNeverEnding, setEditIsNeverEnding] = useState(false)

  useEffect(() => {
    fetchCurrentAdmin()
    loadProjects()
  }, [])

  async function fetchCurrentAdmin() {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (data.authenticated) {
        setCurrentAdmin(data.admin)
      }
    } catch (error) {
      console.error('Failed to fetch current admin:', error)
      toast.error('Authentication failed')
    }
  }

  async function loadProjects() {
    try {
      const res = await fetch('/api/auth/session')
      const sessionData = await res.json()
      
      if (!sessionData.authenticated) {
        toast.error('Not authenticated')
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('company_id', sessionData.admin.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

      if (error) throw error
      setProjects(data || [])
    } catch (error) {
      console.error('Error loading projects:', error)
      toast.error('Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  async function createProject() {
    if (!newProject.project_name.trim()) {
      toast.error('Project name is required')
      return
    }

    if (!currentAdmin) {
      toast.error('User not authenticated')
      return
    }

    // Validate end date is not before start date
    if (!isNeverEnding && newProject.start_date && newProject.end_date) {
      if (new Date(newProject.end_date) < new Date(newProject.start_date)) {
        toast.error('Expected end date cannot be before start date')
        return
      }
    }

    setLoading(true)
    try {
      console.log('Creating project with data:', {
        company_id: currentAdmin.id,
        created_by: currentAdmin.id,
        project_name: newProject.project_name,
        description: newProject.description,
        start_date: newProject.start_date || null,
        end_date: isNeverEnding ? null : (newProject.end_date || null),
        status: 'active'
      })

      const { data, error } = await supabase
        .from('projects')
        .insert({
          company_id: currentAdmin.id,
          created_by: currentAdmin.id,
          project_name: newProject.project_name,
          description: newProject.description,
          start_date: newProject.start_date || null,
          end_date: isNeverEnding ? null : (newProject.end_date || null),
          status: 'active'
        })
        .select()
        .single()

      if (error) {
        console.error('Database error:', error)
        throw error
      }

      console.log('Project created:', data)
      toast.success('Project created successfully!')
      setProjects([data, ...projects])
      setShowNewProjectForm(false)
      setNewProject({ project_name: '', description: '', start_date: '', end_date: '' })
      setIsNeverEnding(false)
      setSelectedProjectId(data.id)
    } catch (error) {
      console.error('Error creating project:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to create project: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  async function deleteProject(projectId: string) {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('projects')
        .update({ is_deleted: true })
        .eq('id', projectId)

      if (error) throw error

      toast.success('Project deleted successfully!')
      setProjects(projects.filter(p => p.id !== projectId))
      setDeleteConfirmId(null)
    } catch (error) {
      console.error('Error deleting project:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to delete project: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  function openEditForm(project: Project) {
    setEditingProject(project)
    setEditForm({
      project_name: project.project_name,
      description: project.description || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      status: project.status
    })
    setEditIsNeverEnding(!project.end_date)
  }

  async function updateProject() {
    if (!editForm.project_name.trim()) {
      toast.error('Project name is required')
      return
    }

    if (!editingProject) return

    // Validate end date is not before start date
    if (!editIsNeverEnding && editForm.start_date && editForm.end_date) {
      if (new Date(editForm.end_date) < new Date(editForm.start_date)) {
        toast.error('Expected end date cannot be before start date')
        return
      }
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({
          project_name: editForm.project_name,
          description: editForm.description,
          start_date: editForm.start_date || null,
          end_date: editIsNeverEnding ? null : (editForm.end_date || null),
          status: editForm.status
        })
        .eq('id', editingProject.id)
        .select()
        .single()

      if (error) throw error

      toast.success('Project updated successfully!')
      setProjects(projects.map(p => p.id === editingProject.id ? data : p))
      setEditingProject(null)
      setEditIsNeverEnding(false)
    } catch (error) {
      console.error('Error updating project:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to update project: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  async function markAsComplete(projectId: string) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', projectId)
        .select()
        .single()

      if (error) throw error

      toast.success('Project marked as completed!')
      setProjects(projects.map(p => p.id === projectId ? data : p))
    } catch (error) {
      console.error('Error marking project as complete:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      toast.error(`Failed to mark project as complete: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  if (selectedProjectId) {
    return (
      <ProjectBrainPage
        projectId={selectedProjectId}
        onBack={() => setSelectedProjectId(null)}
      />
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Project Brain</h1>
        <p className="text-gray-600">Manage project-specific knowledge and embeddings</p>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <DeleteConfirm
          isOpen={!!deleteConfirmId}
          onClose={() => setDeleteConfirmId(null)}
          onConfirm={() => deleteProject(deleteConfirmId)}
          title="Delete Project"
          message="Are you sure you want to delete this project? This action cannot be undone and will remove all associated documents and embeddings."
          loading={loading}
        />
      )}

      {/* Edit Project Form */}
      {editingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4">Edit Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Name *
                </label>
                <input
                  type="text"
                  value={editForm.project_name}
                  onChange={(e) => setEditForm({ ...editForm, project_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter project name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Project description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    min="2000-01-01"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expected End Date
                  </label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                    min={editForm.start_date || undefined}
                    disabled={editIsNeverEnding}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-never-ending"
                  checked={editIsNeverEnding}
                  onChange={(e) => {
                    setEditIsNeverEnding(e.target.checked)
                    if (e.target.checked) {
                      setEditForm({ ...editForm, end_date: '' })
                    }
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="edit-never-ending" className="text-sm text-gray-700 cursor-pointer">
                  Never Ending Project
                </label>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={updateProject}
                  disabled={loading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Updating...
                    </>
                  ) : (
                    'Update Project'
                  )}
                </button>
                <button
                  onClick={() => setEditingProject(null)}
                  disabled={loading}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Project Form */}
      {showNewProjectForm && (
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border border-gray-200">
          <h2 className="text-xl font-semibold mb-4">Create New Project</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                value={newProject.project_name}
                onChange={(e) => setNewProject({ ...newProject, project_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter project name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Project description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={newProject.start_date}
                  onChange={(e) => setNewProject({ ...newProject, start_date: e.target.value })}
                  min="2000-01-01"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expected End Date
                </label>
                <input
                  type="date"
                  value={newProject.end_date}
                  onChange={(e) => setNewProject({ ...newProject, end_date: e.target.value })}
                  min={newProject.start_date || undefined}
                  disabled={isNeverEnding}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="never-ending"
                checked={isNeverEnding}
                onChange={(e) => {
                  setIsNeverEnding(e.target.checked)
                  if (e.target.checked) {
                    setNewProject({ ...newProject, end_date: '' })
                  }
                }}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="never-ending" className="text-sm text-gray-700 cursor-pointer">
                Never Ending Project
              </label>
            </div>
            <div className="flex gap-3">
              <button
                onClick={createProject}
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </button>
              <button
                onClick={() => setShowNewProjectForm(false)}
                disabled={loading}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Project Button */}
      {!showNewProjectForm && (
        <button
          onClick={() => setShowNewProjectForm(true)}
          className="mb-6 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all"
        >
          <Plus className="w-5 h-5" />
          New Project
        </button>
      )}

      {/* Projects Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600">Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm border border-gray-200">
          <FolderKanban className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-600">Create your first project to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all group"
            >
              <div className="flex items-start justify-between mb-4">
                <div 
                  className="flex-1 cursor-pointer"
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {project.project_name}
                  </h3>
                  {project.description && (
                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                      {project.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    project.status === 'active' ? 'bg-green-100 text-green-700' :
                    project.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    project.status === 'on_hold' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {project.status}
                  </span>
                </div>
              </div>
              
              <div 
                className="space-y-2 text-sm text-gray-600 mb-4 cursor-pointer"
                onClick={() => setSelectedProjectId(project.id)}
              >
                {project.start_date && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    <span>Started: {new Date(project.start_date).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>Created: {new Date(project.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4 border-t border-gray-100">
                {project.status === 'active' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      markAsComplete(project.id)
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors text-sm font-medium"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Complete
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    openEditForm(project)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteConfirmId(project.id)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}



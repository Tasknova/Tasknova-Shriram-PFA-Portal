'use client'

import { useEffect, useState } from 'react'
import { Plus, Shield } from 'lucide-react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import { Admin } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAdmin, setSelectedAdmin] = useState<Admin | null>(null)
  const [currentAdmin, setCurrentAdmin] = useState<Admin | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')
  
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'admin' as 'admin' | 'super_admin',
  })

  useEffect(() => {
    fetchAdmins()
    fetchCurrentAdmin()
  }, [])

  const fetchCurrentAdmin = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (data.authenticated) {
        setCurrentAdmin(data.admin)
      }
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      console.error('Failed to fetch current admin')
    }
  }

  const fetchAdmins = async () => {
    try {
      const res = await fetch('/api/admin/admins')
      const data = await res.json()
      setAdmins(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch admins')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (currentAdmin?.role !== 'super_admin') {
      toast.error('Only super admins can create admins')
      return
    }

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create admin')
      }

      toast.success('Admin created successfully')
      setCreateModalOpen(false)
      setFormData({ full_name: '', email: '', password: '', role: 'admin' })
      fetchAdmins()
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create admin'
      toast.error(errorMessage)
    }
  }

  const handleToggleActive = async (admin: Admin) => {
    if (currentAdmin?.role !== 'super_admin') {
      toast.error('Only super admins can modify admin status')
      return
    }

    if (admin.id === currentAdmin?.id) {
      toast.error('You cannot deactivate your own account')
      return
    }

    try {
      const res = await fetch('/api/admin/admins', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: admin.id, is_active: !admin.is_active }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success(`Admin ${!admin.is_active ? 'activated' : 'deactivated'}`)
      fetchAdmins()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update admin status')
    }
  }

  const handleDelete = async () => {
    if (!selectedAdmin) return

    if (currentAdmin?.role !== 'super_admin') {
      toast.error('Only super admins can delete admins')
      return
    }

    if (selectedAdmin.id === currentAdmin?.id) {
      toast.error('You cannot delete your own account')
      return
    }

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/admins?id=${selectedAdmin.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Admin deleted')
      setDeleteModalOpen(false)
      setSelectedAdmin(null)
      fetchAdmins()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete admin')
    } finally {
      setDeleteLoading(false)
    }
  }

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    {
      key: 'role',
      label: 'Role',
      render: (value: string) => (
        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${
          value === 'super_admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
        }`}>
          {value === 'super_admin' ? 'Super Admin' : 'Admin'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (value: boolean, row: Admin) => (
        <button
          onClick={() => handleToggleActive(row)}
          disabled={currentAdmin?.role !== 'super_admin' || row.id === currentAdmin?.id}
          className={`px-2 py-1 text-xs rounded-full ${
            value ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {value ? 'Active' : 'Inactive'}
        </button>
      ),
    },
    {
      key: 'last_login',
      label: 'Last Login',
      render: (value: string) => value ? formatDate(value) : 'Never',
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

  // Filter and sort data
  const filteredAndSortedData = admins
    .filter(admin => {
      if (roleFilter === 'super_admin') return admin.role === 'super_admin'
      if (roleFilter === 'admin') return admin.role === 'admin'
      return true
    })
    .filter(admin => {
      if (statusFilter === 'active') return admin.is_active === true
      if (statusFilter === 'inactive') return admin.is_active === false
      return true
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'name_asc': return a.full_name.localeCompare(b.full_name)
        case 'name_desc': return b.full_name.localeCompare(a.full_name)
        default: return 0
      }
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Admin Management</h1>
        </div>
        <p className="text-purple-100 text-lg">Manage admin users and permissions</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">Total Admins</p>
            <p className="text-3xl font-bold mt-1">{admins.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">Super Admins</p>
            <p className="text-3xl font-bold mt-1">{admins.filter(a => a.role === 'super_admin').length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">Active</p>
            <p className="text-3xl font-bold mt-1">{admins.filter(a => a.is_active).length}</p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        {currentAdmin?.role === 'super_admin' && (
          <button
            onClick={() => setCreateModalOpen(true)}
            className="btn-primary flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Admin
          </button>
        )}
      </div>

      {currentAdmin?.role !== 'super_admin' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            You have limited permissions. Only super admins can create, edit, or delete admin users.
          </p>
        </div>
      )}

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Role</label>
            <select 
              value={roleFilter} 
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admins</option>
              <option value="admin">Admins</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Status</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="date_desc">Date (Newest First)</option>
              <option value="date_asc">Date (Oldest First)</option>
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredAndSortedData}
        columns={columns}
        onDelete={currentAdmin?.role === 'super_admin' ? (row) => {
          if (row.id === currentAdmin?.id) {
            toast.error('You cannot delete your own account')
            return
          }
          setSelectedAdmin(row)
          setDeleteModalOpen(true)
        } : undefined}
        searchKeys={['full_name', 'email']}
      />

      {/* Create Admin Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Admin"
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Full Name</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="input-field"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as Admin['role'] })}
              className="input-field"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Admin
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Admin"
        message="Are you sure you want to delete this admin? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



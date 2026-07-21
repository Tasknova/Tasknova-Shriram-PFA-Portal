'use client'

import { useEffect, useState } from 'react'
import DataTable from '@/components/DataTable'
import Modal from '@/components/Modal'
import DeleteConfirm from '@/components/DeleteConfirm'
import ImageUpload from '@/components/ImageUpload'
import { Blog } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { BookOpen, Plus } from 'lucide-react'

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedBlog, setSelectedBlog] = useState<Blog | null>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [, setSaveLoading] = useState(false)
  const [formData, setFormData] = useState<Partial<Blog>>({
    title: '',
    slug: '',
    excerpt: '',
    content: '',
    hero_image_url: '',
    author: '',
    author_role: '',
    author_avatar_url: '',
    category: '',
    tags: [],
    read_time: 5,
    is_published: false
  })
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    fetchBlogs()
  }, [])

  const fetchBlogs = async () => {
    try {
      const res = await fetch('/api/admin/blogs')
      const data = await res.json()
      setBlogs(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch blogs')
    } finally {
      setLoading(false)
    }
  }

  const fetchBlogDetails = async (id: string): Promise<Blog | null> => {
    try {
      const res = await fetch(`/api/admin/blogs?id=${id}`)
      if (!res.ok) throw new Error('Request failed')
      return await res.json()
    } catch {
      toast.error('Failed to load blog details')
      return null
    }
  }

  const handleViewBlog = async (row: Blog) => {
    const detailed = await fetchBlogDetails(row.id)
    if (!detailed) return

    setSelectedBlog(detailed)
    setViewModalOpen(true)
  }

  const handleEditBlog = async (row: Blog) => {
    const detailed = await fetchBlogDetails(row.id)
    if (!detailed) return

    setSelectedBlog(detailed)
    setFormData({
      title: detailed.title,
      slug: detailed.slug,
      excerpt: detailed.excerpt || '',
      content: detailed.content || '',
      hero_image_url: detailed.hero_image_url || '',
      author: detailed.author,
      author_role: detailed.author_role || '',
      author_avatar_url: detailed.author_avatar_url || '',
      category: detailed.category,
      tags: detailed.tags || [],
      read_time: detailed.read_time,
      is_published: detailed.is_published
    })
    setEditModalOpen(true)
  }

  const handleDelete = async () => {
    if (!selectedBlog) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/blogs?id=${selectedBlog.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Blog deleted')
      setDeleteModalOpen(false)
      setSelectedBlog(null)
      fetchBlogs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete blog')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleTogglePublish = async (blog: Blog) => {
    try {
      const res = await fetch('/api/admin/blogs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: blog.id, 
          is_published: !blog.is_published,
          published_at: !blog.is_published ? new Date().toISOString() : null
        }),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success(`Blog ${!blog.is_published ? 'published' : 'unpublished'}`)
      fetchBlogs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update blog status')
    }
  }

  const handleCreate = async () => {
    setSaveLoading(true)
    try {
      const payload = {
        ...formData,
        tags: typeof formData.tags === 'string' ? (formData.tags as string).split(',').map((t: string) => t.trim()) : formData.tags || [],
      }

      const res = await fetch('/api/admin/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const errorData = await res.json()
        console.error('Server error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Create failed')
      }

      toast.success('Blog created')
      setCreateModalOpen(false)
      setFormData({})
      fetchBlogs()
    } catch (error) {
      console.error('Create error:', error)
      const message = error instanceof Error ? error.message : 'Failed to create blog'
      toast.error(message)
    } finally {
      setSaveLoading(false)
    }
  }

  const handleEdit = async () => {
    if (!selectedBlog) return

    setSaveLoading(true)
    try {
      const payload = {
        ...formData,
        tags: typeof formData.tags === 'string' ? (formData.tags as string).split(',').map((t: string) => t.trim()) : formData.tags || [],
      }

      const res = await fetch(`/api/admin/blogs?id=${selectedBlog.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Update failed')

      toast.success('Blog updated')
      setEditModalOpen(false)
      setSelectedBlog(null)
      setFormData({})
      fetchBlogs()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to update blog')
    } finally {
      setSaveLoading(false)
    }
  }

  // Function not currently used in UI - keeping for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addTag = () => {
    if (tagInput.trim()) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), tagInput.trim()]
      }))
      setTagInput('')
    }
  }
  // Function not currently used in UI - keeping for potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const removeTag = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter((_, i) => i !== index) || []
    }))
  }

  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'author', label: 'Author' },
    { key: 'category', label: 'Category' },
    { key: 'read_time', label: 'Read Time (min)' },
    {
      key: 'is_published',
      label: 'Status',
      render: (value: boolean, row: Blog) => (
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
      key: 'published_at',
      label: 'Published',
      render: (value: string) => value ? formatDate(value) : '-',
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  // Get unique categories
  const categories = Array.from(new Set(blogs.map(b => b.category)))

  // Filter and sort data
  const filteredAndSortedData = blogs
    .filter(blog => {
      if (statusFilter === 'published') return blog.is_published === true
      if (statusFilter === 'draft') return blog.is_published === false
      return true
    })
    .filter(blog => {
      if (categoryFilter === 'all') return true
      return blog.category === categoryFilter
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'date_desc': return new Date(b.published_at || b.created_at).getTime() - new Date(a.published_at || a.created_at).getTime()
        case 'date_asc': return new Date(a.published_at || a.created_at).getTime() - new Date(b.published_at || b.created_at).getTime()
        case 'title_asc': return a.title.localeCompare(b.title)
        case 'title_desc': return b.title.localeCompare(a.title)
        default: return 0
      }
    })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Blogs</h1>
        </div>
        <p className="text-indigo-100 text-lg">Manage blog posts</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Total Blogs</p>
            <p className="text-3xl font-bold mt-1">{blogs.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Published</p>
            <p className="text-3xl font-bold mt-1">{blogs.filter(b => b.is_published).length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-indigo-100 text-xs font-semibold uppercase">Drafts</p>
            <p className="text-3xl font-bold mt-1">{blogs.filter(b => !b.is_published).length}</p>
          </div>
        </div>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <button
          onClick={() => {
            setFormData({ title: '', slug: '', excerpt: '', content: '', hero_image_url: '', author: '', author_role: '', author_avatar_url: '', category: '', tags: [], read_time: 5, is_published: false })
            setCreateModalOpen(true)
          }}
          className="btn-primary flex items-center"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Blog
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Blogs</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Category</label>
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Sort By</label>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
        onView={handleViewBlog}
        onEdit={handleEditBlog}
        onDelete={(row) => {
          setSelectedBlog(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['title', 'author', 'category']}
      />

      {/* View Modal */}
      {selectedBlog && (
        <Modal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          title="Blog Post Details"
          size="xl"
        >
          <div className="space-y-4">
            {/* Hero Image */}
            {selectedBlog.hero_image_url && (
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={selectedBlog.hero_image_url} 
                  alt={selectedBlog.title} 
                  className="w-full h-64 object-cover rounded-lg"
                />
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Title</label>
                <p className="mt-1 font-semibold">{selectedBlog.title}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Slug</label>
                <p className="mt-1">{selectedBlog.slug}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Author</label>
                <p className="mt-1">{selectedBlog.author}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Author Role</label>
                <p className="mt-1">{selectedBlog.author_role}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <p className="mt-1">{selectedBlog.category}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Read Time</label>
                <p className="mt-1">{selectedBlog.read_time} min</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <p className="mt-1">
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    selectedBlog.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedBlog.is_published ? 'Published' : 'Draft'}
                  </span>
                </p>
              </div>
            </div>
            {selectedBlog.excerpt && (
              <div>
                <label className="text-sm font-medium text-gray-700">Excerpt</label>
                <p className="mt-1 text-gray-600">{selectedBlog.excerpt}</p>
              </div>
            )}
            {selectedBlog.tags && selectedBlog.tags.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-700">Tags</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedBlog.tags.map((tag, idx) => (
                    <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedBlog.content && (
              <div>
                <label className="text-sm font-medium text-gray-700">Content</label>
                <div className="mt-1 p-4 bg-gray-50 rounded max-h-96 overflow-auto">
                  <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: selectedBlog.content }} />
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
          setFormData({})
        }}
        title={createModalOpen ? 'Add Blog Post' : 'Edit Blog Post'}
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter blog title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={formData.slug || ''}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="blog-url-slug"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
            <textarea
              value={formData.excerpt || ''}
              onChange={(e) => setFormData({ ...formData, excerpt: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Brief summary of the blog post"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
            <textarea
              value={formData.content || ''}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={10}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="HTML content for the blog post"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ImageUpload
              value={formData.hero_image_url || ''}
              onChange={(url) => setFormData({ ...formData, hero_image_url: url })}
              label="Hero Image"
              bucket="blog-images"
            />
            <ImageUpload
              value={formData.author_avatar_url || ''}
              onChange={(url) => setFormData({ ...formData, author_avatar_url: url })}
              label="Author Avatar"
              bucket="blog-images"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author *</label>
              <input
                type="text"
                value={formData.author || ''}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Author name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Author Role</label>
              <input
                type="text"
                value={formData.author_role || ''}
                onChange={(e) => setFormData({ ...formData, author_role: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., Senior Content Writer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <input
                type="text"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="e.g., AI, Business, Technology"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Read Time (minutes)</label>
              <input
                type="number"
                value={formData.read_time || ''}
                onChange={(e) => setFormData({ ...formData, read_time: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="5"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.tags ? (Array.isArray(formData.tags) ? formData.tags.join(', ') : String(formData.tags)) : ''}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value.split(',').map(t => t.trim()) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="AI, Machine Learning, Innovation"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_published"
              checked={formData.is_published || false}
              onChange={(e) => setFormData({ ...formData, is_published: e.target.checked })}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor="is_published" className="ml-2 block text-sm text-gray-700">
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
              onClick={createModalOpen ? handleCreate : handleEdit}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              {createModalOpen ? 'Create Blog' : 'Update Blog'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Blog"
        message="Are you sure you want to delete this blog post? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



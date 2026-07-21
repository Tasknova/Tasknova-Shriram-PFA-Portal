'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import DataTable from '@/components/DataTable'
import DeleteConfirm from '@/components/DeleteConfirm'
import { JobApplicant } from '@/types'
import { formatDate } from '@/lib/utils'
import toast from 'react-hot-toast'
import { Users, Sparkles } from 'lucide-react'

function parseScore(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatScore(value: unknown): string {
  const score = parseScore(value)
  return score === null ? 'N/A' : `${score.toFixed(1)}/10`
}

function scoreClass(value: unknown): string {
  const score = parseScore(value)

  if (score === null) {
    return 'bg-gray-100 text-gray-700'
  }

  if (score >= 8) {
    return 'bg-green-100 text-green-800'
  }

  if (score >= 6) {
    return 'bg-yellow-100 text-yellow-800'
  }

  return 'bg-red-100 text-red-800'
}

function analysisStatusClass(status: string | null | undefined): string {
  if (status === 'completed') return 'bg-green-100 text-green-800'
  if (status === 'processing') return 'bg-blue-100 text-blue-800'
  if (status === 'failed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-700'
}

function analysisStatusLabel(status: string | null | undefined): string {
  if (status === 'completed') return 'Completed'
  if (status === 'processing') return 'Processing'
  if (status === 'failed') return 'Failed'
  return 'Not Started'
}

export default function JobApplicantsPage() {
  const router = useRouter()
  const [applicants, setApplicants] = useState<JobApplicant[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedApplicant, setSelectedApplicant] = useState<JobApplicant | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [analyzeAllLoading, setAnalyzeAllLoading] = useState(false)
  const [scoreFilter, setScoreFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('date_desc')

  useEffect(() => {
    fetchApplicants()
  }, [])

  const fetchApplicants = async () => {
    try {
      const res = await fetch('/api/admin/job-applicants')
      const data = await res.json()
      setApplicants(data)
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to fetch job applicants')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedApplicant) return

    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/job-applicants?id=${selectedApplicant.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) throw new Error('Delete failed')

      toast.success('Applicant deleted')
      setDeleteModalOpen(false)
      setSelectedApplicant(null)
      fetchApplicants()
    } catch { // eslint-disable-next-line @typescript-eslint/no-unused-vars
      toast.error('Failed to delete applicant')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleAnalyzePending = async () => {
    setAnalyzeAllLoading(true)

    try {
      const res = await fetch('/api/admin/job-applicants/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'bulk',
          limit: 5,
        }),
      })

      const payload = await res.json()

      if (!res.ok || payload.success !== true) {
        throw new Error(payload.error || 'Failed to run bulk analysis')
      }

      toast.success(`Analyzed ${payload.completed || 0} applicants`)
      await fetchApplicants()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run bulk analysis'
      toast.error(message)
    } finally {
      setAnalyzeAllLoading(false)
    }
  }

  const columns = [
    { key: 'full_name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'experience_years', label: 'Experience (Years)' },
    {
      key: 'analysis_status',
      label: 'Analysis',
      render: (value: string) => (
        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${analysisStatusClass(value)}`}>
          {analysisStatusLabel(value)}
        </span>
      ),
    },
    {
      key: 'ai_score',
      label: 'Final Score',
      render: (value: unknown) => (
        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${scoreClass(value)}`}>
          {formatScore(value)}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: 'Applied',
      render: (value: string) => formatDate(value),
    },
  ]

  if (loading) {
    return <div className="text-center py-12">Loading...</div>
  }

  // Filter and sort data
  const filteredAndSortedData = applicants
    .filter(applicant => {
      const score = parseScore(applicant.ai_score)

      if (scoreFilter === 'high') return score !== null && score >= 8
      if (scoreFilter === 'medium') return score !== null && score >= 6 && score < 8
      if (scoreFilter === 'low') return score !== null && score < 6
      if (scoreFilter === 'unscored') return score === null
      return true
    })
    .sort((a, b) => {
      const scoreA = parseScore(a.ai_score) ?? -1
      const scoreB = parseScore(b.ai_score) ?? -1

      switch(sortBy) {
        case 'date_desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'date_asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'name_asc': return a.full_name.localeCompare(b.full_name)
        case 'name_desc': return b.full_name.localeCompare(a.full_name)
        case 'score_desc': return scoreB - scoreA
        case 'score_asc': return scoreA - scoreB
        default: return 0
      }
    })

  const completedScores = applicants
    .map((item) => parseScore(item.ai_score))
    .filter((score): score is number => score !== null)

  const averageScore =
    completedScores.length > 0
      ? Math.round((completedScores.reduce((sum, score) => sum + score, 0) / completedScores.length) * 10) / 10
      : 0

  const highScoreCount = completedScores.filter((score) => score >= 8).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-10 h-10" />
          <h1 className="text-4xl font-bold">Job Applicants</h1>
        </div>
        <p className="text-purple-100 text-lg">Manage job applications</p>
        
        {/* Stats Summary */}
        <div className="mt-6 grid grid-cols-3 gap-4">
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">Total Applicants</p>
            <p className="text-3xl font-bold mt-1">{applicants.length}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">High Score (&gt;=8.0)</p>
            <p className="text-3xl font-bold mt-1">{highScoreCount}</p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
            <p className="text-purple-100 text-xs font-semibold uppercase">Avg Score</p>
            <p className="text-3xl font-bold mt-1">{averageScore}/10</p>
          </div>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by AI Score</label>
            <select 
              value={scoreFilter} 
              onChange={(e) => setScoreFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="all">All Applicants</option>
              <option value="high">High Score (&gt;=8.0)</option>
              <option value="medium">Medium Score (6.0-7.9)</option>
              <option value="low">Low Score (&lt;6.0)</option>
              <option value="unscored">Unscored</option>
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
              <option value="score_desc">Score (High to Low)</option>
              <option value="score_asc">Score (Low to High)</option>
            </select>
          </div>
          <div className="min-w-[220px]">
            <button
              onClick={handleAnalyzePending}
              disabled={analyzeAllLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              {analyzeAllLoading ? 'Analyzing...' : 'Analyze Pending (Top 5)'}
            </button>
          </div>
        </div>
      </div>

      <DataTable
        data={filteredAndSortedData}
        columns={columns}
        onView={(row) => {
          router.push(`/admin/job-applicants/${row.id}/analysis`)
        }}
        onDelete={(row) => {
          setSelectedApplicant(row)
          setDeleteModalOpen(true)
        }}
        searchKeys={['full_name', 'email']}
      />

      {/* Delete Confirmation */}
      <DeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Applicant"
        message="Are you sure you want to delete this applicant? This action cannot be undone."
        loading={deleteLoading}
      />
    </div>
  )
}



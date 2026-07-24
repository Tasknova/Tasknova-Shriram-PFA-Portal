'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, Play, Plus, Upload, X, AlertCircle, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react'
import { SHRIRAM_PFA_DIDS, isShriramPFAAgent } from '@/lib/aiAgentsUtils'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  agent_id: string
  total_calls: number
  executed_calls: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  contacts: Array<{ name: string; phone: string }>
  created_at: string
}

interface Agent {
  agent_id: string
  name: string
}

interface CsvContact {
  name: string
  phone: string
}

// ── CSV Column Auto-Detection ─────────────────────────────────────────────

const NAME_HEADERS = ['name', 'customer name', 'full name', 'customer_name', 'fullname', 'contact name', 'client name', 'lead name', 'first name', 'firstname']
const PHONE_HEADERS = ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'number', 'cell', 'telephone', 'tel', 'phonenumber', 'mobile_number', 'phone_number']

function detectColumn(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === candidate)
    if (idx !== -1) return idx
  }
  return -1
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) return { headers: [], rows: [] }
  const parse = (line: string) => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += ch }
    }
    result.push(current.trim())
    return result
  }
  const headers = parse(lines[0])
  const rows = lines.slice(1).map(parse)
  return { headers, rows }
}

function autoMapContacts(text: string): { contacts: CsvContact[]; needsMapping: boolean; headers: string[]; rows: string[][] } {
  const { headers, rows } = parseCSV(text)
  const nameIdx = detectColumn(headers, NAME_HEADERS)
  const phoneIdx = detectColumn(headers, PHONE_HEADERS)

  if (phoneIdx === -1) return { contacts: [], needsMapping: true, headers, rows }

  const contacts: CsvContact[] = rows
    .filter((r) => r[phoneIdx]?.trim())
    .map((r) => ({
      name: nameIdx !== -1 ? r[nameIdx] || '' : '',
      phone: r[phoneIdx].trim(),
    }))

  return { contacts, needsMapping: false, headers, rows }
}

// ── Status Badge ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: Campaign['status'] }) {
  const map: Record<Campaign['status'], { label: string; color: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800', icon: <Clock className="w-3 h-3" /> },
    running: { label: 'Running', color: 'bg-blue-100 text-blue-800', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="w-3 h-3" /> },
    failed: { label: 'Failed', color: 'bg-red-100 text-red-800', icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600', icon: <X className="w-3 h-3" /> },
  }
  const { label, color, icon } = map[status] || map.pending
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
      {icon}{label}
    </span>
  )
}

// ── Progress Bar ──────────────────────────────────────────────────────────

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{value}/{total}</span>
    </div>
  )
}

// ── Column Mapper (fallback when auto-detect fails) ────────────────────────

function ColumnMapper({
  headers,
  rows,
  onConfirm,
  onCancel,
}: {
  headers: string[]
  rows: string[][]
  onConfirm: (contacts: CsvContact[]) => void
  onCancel: () => void
}) {
  const [nameCol, setNameCol] = useState<number>(-1)
  const [phoneCol, setPhoneCol] = useState<number>(-1)

  const preview = rows.slice(0, 3)

  const handleConfirm = () => {
    if (phoneCol === -1) { toast.error('Please select the Phone Number column'); return }
    const contacts: CsvContact[] = rows
      .filter((r) => r[phoneCol]?.trim())
      .map((r) => ({
        name: nameCol !== -1 ? r[nameCol] || '' : '',
        phone: r[phoneCol].trim(),
      }))
    if (!contacts.length) { toast.error('No valid phone numbers found'); return }
    onConfirm(contacts)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          <h3 className="text-lg font-semibold text-gray-900">Map CSV Columns</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">We could not auto-detect the columns. Please select which columns correspond to Name and Phone Number.</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name Column (optional)</label>
            <select
              value={nameCol}
              onChange={(e) => setNameCol(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value={-1}>— Skip —</option>
              {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number Column*</label>
            <select
              value={phoneCol}
              onChange={(e) => setPhoneCol(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value={-1}>— Select —</option>
              {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
            </select>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 mb-4 overflow-x-auto">
            <p className="text-xs font-medium text-gray-500 mb-2">Preview (first 3 rows)</p>
            <table className="text-xs w-full">
              <thead><tr>{headers.map((h, i) => <th key={i} className="text-left px-2 py-1 text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {preview.map((row, ri) => (
                  <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="px-2 py-1 text-gray-800">{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          <button onClick={handleConfirm} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition">Use These Columns</button>
        </div>
      </div>
    </div>
  )
}

// ── New Campaign Modal ─────────────────────────────────────────────────────

function NewCampaignModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: Agent[]
  onClose: () => void
  onCreated: (campaign: Campaign) => void
}) {
  const [step, setStep] = useState<'form' | 'mapping' | 'confirm'>('form')
  const [name, setName] = useState('')
  const [agentId, setAgentId] = useState('')
  const [selectedDid, setSelectedDid] = useState('')
  const [contacts, setContacts] = useState<CsvContact[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const selectedAgentObj = agents.find((a) => a.agent_id === agentId)
  const isShriramPFA = isShriramPFAAgent(selectedAgentObj?.name)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const { contacts: mapped, needsMapping, headers, rows } = autoMapContacts(text)
      setCsvHeaders(headers)
      setCsvRows(rows)
      if (needsMapping) {
        setStep('mapping')
      } else {
        setContacts(mapped)
        toast.success(`Detected ${mapped.length} contacts`)
      }
    }
    reader.readAsText(file)
  }

  const handleStart = async () => {
    if (!name.trim()) { toast.error('Campaign name is required'); return }
    if (!agentId) { toast.error('Please select an agent'); return }
    if (isShriramPFA && !selectedDid) { toast.error('Please select a DID for this agent'); return }
    if (!contacts.length) { toast.error('Please upload a CSV with contacts'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/ai-agents/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), agent_id: agentId, contacts, did: selectedDid || undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start campaign')
      }
      const { campaign } = await res.json()
      toast.success(`Campaign "${campaign.name}" created! Starting calls now...`)
      onCreated(campaign)
      onClose()

      // Immediately trigger execution from the browser — this is reliable unlike
      // fire-and-forget self-calls inside a Vercel serverless function.
      fetch(`/api/ai-agents/campaigns/${campaign.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: selectedDid || undefined }),
      }).catch((err) => console.error('Campaign execute trigger failed:', err))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start campaign')
    } finally {
      setSubmitting(false)
    }
  }

  if (step === 'mapping') {
    return (
      <ColumnMapper
        headers={csvHeaders}
        rows={csvRows}
        onConfirm={(mapped) => { setContacts(mapped); setStep('form'); toast.success(`Mapped ${mapped.length} contacts`) }}
        onCancel={() => { setStep('form'); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
      />
    )
  }

  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mx-auto mb-4">
            <Play className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">Start Campaign?</h3>
          <p className="text-gray-600 text-center text-sm mb-2">
            Are you sure you want to start this campaign and call all the uploaded numbers?
          </p>
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Campaign:</span><span className="font-medium">{name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Agent:</span><span className="font-medium">{agents.find(a => a.agent_id === agentId)?.name}</span></div>
            {selectedDid && <div className="flex justify-between"><span className="text-gray-500">DID:</span><span className="font-medium font-mono">{selectedDid}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Total Calls:</span><span className="font-medium text-purple-700">{contacts.length}</span></div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('form')} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
            <button
              onClick={handleStart}
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />Starting...</> : 'Start Campaign'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Start New Campaign</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Name*</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Summer Campaign 2025"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select AI Agent*</label>
            <select
              value={agentId}
              onChange={(e) => { setAgentId(e.target.value); setSelectedDid('') }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Choose an agent...</option>
              {agents.map((a) => <option key={a.agent_id} value={a.agent_id}>{a.name}</option>)}
            </select>
          </div>

          {/* DID dropdown for Shriram PFA agents */}
          {isShriramPFA && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select DID*</label>
              <select
                value={selectedDid}
                onChange={(e) => setSelectedDid(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">— Select DID —</option>
                {SHRIRAM_PFA_DIDS.map((did) => (
                  <option key={did.value} value={did.value}>{did.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV*</label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 cursor-pointer hover:border-purple-400 hover:bg-purple-50 transition">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <span className="text-sm text-gray-600">{fileName || 'Click to upload CSV'}</span>
              <span className="text-xs text-gray-400 mt-1">Columns: Name, Phone Number</span>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            </label>
            {contacts.length > 0 && (
              <div className="flex items-center gap-2 mt-2 text-sm text-green-700">
                <CheckCircle className="w-4 h-4" />
                {contacts.length} contacts detected
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">Cancel</button>
          <button
            onClick={() => {
              if (!name.trim()) { toast.error('Campaign name is required'); return }
              if (!agentId) { toast.error('Please select an agent'); return }
              if (isShriramPFA && !selectedDid) { toast.error('Please select a DID for this agent'); return }
              if (!contacts.length) { toast.error('Please upload a CSV with contacts'); return }
              setStep('confirm')
            }}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition"
          >
            Review & Start
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Campaign Detail View ───────────────────────────────────────────────────

interface CampaignCall {
  id: string
  campaign_id: string
  call_id: string | null
  customer_name: string | null
  customer_number: string
  status: 'pending' | 'initiated' | 'failed'
  error_message: string | null
  created_at: string
  ai_calls?: {
    call_id: string
    status: string
    duration: number
    recording_url: string | null
    transcript_status: string
    outcome: string | null
    created_at: string
    ai_transcripts?: Array<{ summary: string | null; call_outcome: string | null }>
    ai_evaluations?: Array<{ id: string; score: number | null; overall_score: number | null; status: string }>
  } | null
}

function CallRowStatus({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    in_progress: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    initiated: 'bg-indigo-100 text-indigo-800',
    unknown: 'bg-gray-100 text-gray-600',
  }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>
}

function CampaignDetailView({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const [calls, setCalls] = useState<CampaignCall[]>([])
  const [loading, setLoading] = useState(true)
  const [liveData, setLiveData] = useState(campaign)
  const [cancelling, setCancelling] = useState(false)
  const [retryingRows, setRetryingRows] = useState<Set<string>>(new Set())

  const fetchDetails = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai-agents/campaigns/${campaign.id}`)
      if (!res.ok) return
      const data = await res.json()
      setCalls(data.calls || [])
      setLiveData(data.campaign)
    } catch (err) {
      console.error('Error fetching campaign detail:', err)
    } finally {
      setLoading(false)
    }
  }, [campaign.id])

  useEffect(() => {
    void fetchDetails()
  }, [fetchDetails])

  // Live polling while running or pending
  useEffect(() => {
    if (liveData.status !== 'running' && liveData.status !== 'pending') return
    const id = window.setInterval(() => void fetchDetails(), 5000)
    return () => window.clearInterval(id)
  }, [liveData.status, fetchDetails])

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/ai-agents/campaigns/${campaign.id}/cancel`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to cancel')
      toast.success('Campaign cancellation requested')
      void fetchDetails()
    } catch {
      toast.error('Failed to cancel campaign')
    } finally {
      setCancelling(false)
    }
  }

  const handleRetry = async (rowId: string) => {
    try {
      setRetryingRows(prev => new Set(prev).add(rowId))
      const res = await fetch(`/api/ai-agents/campaigns/${campaign.id}/calls/${rowId}/retry`, {
        method: 'POST'
      })
      if (!res.ok) throw new Error('Retry failed')
      toast.success('Call queued for retry')
      await fetchDetails()
    } catch (err) {
      toast.error('Failed to retry call')
      console.error(err)
    } finally {
      setRetryingRows(prev => {
        const next = new Set(prev)
        next.delete(rowId)
        return next
      })
    }
  }

  const handleRun = async () => {
    try {
      toast.loading('Starting campaign...', { id: 'run-campaign' })
      const res = await fetch(`/api/ai-agents/campaigns/${campaign.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: liveData.contacts?.[0] ? undefined : undefined }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to start')
      }
      toast.success('Campaign started!', { id: 'run-campaign' })
      void fetchDetails()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start campaign', { id: 'run-campaign' })
    }
  }

  const pct = liveData.total_calls > 0 ? Math.round((liveData.executed_calls / liveData.total_calls) * 100) : 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1 text-sm">← Back</button>
        <h2 className="text-xl font-bold text-gray-900">{liveData.name}</h2>
        <StatusBadge status={liveData.status} />
        {liveData.status === 'pending' && (
          <button
            onClick={handleRun}
            className="ml-2 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition flex items-center gap-1"
          >
            <Play className="w-3 h-3" /> Run Now
          </button>
        )}
        {(liveData.status === 'running' || liveData.status === 'pending') && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="ml-auto px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
          >
            {cancelling ? 'Cancelling...' : 'Cancel Campaign'}
          </button>
        )}
      </div>

      {/* Progress */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Campaign Progress</span>
          <span className="text-sm font-bold text-purple-700">{liveData.executed_calls} / {liveData.total_calls} Calls Completed</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-right text-xs text-gray-400 mt-1">{pct}%</p>
      </div>

      {/* Calls table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Contact List</h3>
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-500">Loading...</div>
        ) : calls.length === 0 ? (
          <div className="text-center py-10 text-gray-400">No contacts found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Call Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Eval Score</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Evaluation</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Recording</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((row, idx) => {
                  const call = row.ai_calls
                  const eval0 = Array.isArray(call?.ai_evaluations) 
                    ? call.ai_evaluations[0] 
                    : call?.ai_evaluations
                  const score = eval0?.overall_score ?? eval0?.score
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-gray-400">{idx + 1}</td>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{row.customer_name || '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-600 font-mono">{row.customer_number}</td>
                      <td className="px-5 py-3">
                        {call ? <CallRowStatus status={call.status} /> : row.status === 'failed'
                          ? <span className="text-xs text-red-500">{row.error_message || 'Failed'}</span>
                          : <CallRowStatus status={row.status} />}
                      </td>
                      <td className="px-5 py-3 text-sm">
                        {score != null
                          ? <span className={`font-semibold ${Number(score) >= 70 ? 'text-green-600' : Number(score) >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{Number(score).toFixed(0)}%</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs">
                        {eval0?.id ? (
                          <Link href={`/admin/ai-calling-agents/evaluations/${eval0.id}`} className="text-purple-600 hover:underline">
                            View Evaluation
                          </Link>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {call?.recording_url
                          ? <a href={call.recording_url} target="_blank" rel="noopener noreferrer" className="text-purple-600 text-xs hover:underline">▶ Play</a>
                          : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {(row.status === 'failed' || call?.status === 'failed') && (
                          <button
                            onClick={() => handleRetry(row.id)}
                            disabled={retryingRows.has(row.id)}
                            className="text-xs px-3 py-1 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 disabled:opacity-50 transition"
                          >
                            {retryingRows.has(row.id) ? 'Retrying...' : 'Call Again'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main CampaignsTab ─────────────────────────────────────────────────────

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-agents/campaigns')
      if (!res.ok) return
      const data = await res.json()
      setCampaigns(data.campaigns || [])
    } catch (err) {
      console.error('Error fetching campaigns:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-agents/index', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err) {
      console.error('Error fetching agents:', err)
    }
  }, [])

  useEffect(() => {
    void fetchCampaigns()
    void fetchAgents()
  }, [fetchCampaigns, fetchAgents])

  // Auto-refresh while any campaign is running
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === 'running')
    if (!hasRunning) return
    const id = window.setInterval(() => void fetchCampaigns(), 6000)
    return () => window.clearInterval(id)
  }, [campaigns, fetchCampaigns])

  if (selectedCampaign) {
    return (
      <CampaignDetailView
        campaign={selectedCampaign}
        onBack={() => { setSelectedCampaign(null); void fetchCampaigns() }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Campaigns</h2>
          <p className="text-sm text-gray-500 mt-0.5">Bulk AI calling campaigns — run calls server-side, independently of your browser</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Start New Campaign
        </button>
      </div>

      {/* Campaign History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Campaign History</h3>
          <button onClick={() => void fetchCampaigns()} className="text-xs text-purple-600 hover:underline">Refresh</button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16">
            <Play className="w-12 h-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">No campaigns yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first campaign to start bulk calling</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Campaign Name</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Progress</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500">Created</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="hover:bg-gray-50 cursor-pointer transition"
                  onClick={() => setSelectedCampaign(campaign)}
                >
                  <td className="px-5 py-4">
                    <span className="font-medium text-gray-900">{campaign.name}</span>
                  </td>
                  <td className="px-5 py-4 min-w-[180px]">
                    <ProgressBar value={campaign.executed_calls} total={campaign.total_calls} />
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={campaign.status} />
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {new Date(campaign.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && (
        <NewCampaignModal
          agents={agents}
          onClose={() => setShowNew(false)}
          onCreated={(c) => {
            setCampaigns((prev) => [c, ...prev])
          }}
        />
      )}
    </div>
  )
}

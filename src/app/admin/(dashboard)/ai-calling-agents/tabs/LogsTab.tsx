'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { useAiCallingRealtime } from '@/hooks/useAiCallingRealtime'

interface CallLog {
  call_id: string
  recording_url: string | null
  status: string
  created_at: string
  updated_at: string
}

function isValidRecordingUrl(url: unknown): boolean {
  return (
    typeof url === 'string' &&
    url.startsWith('http') &&
    url !== 'pending' &&
    url !== 'not_available'
  )
}

export default function LogsTab() {
  const [logs, setLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [filterCallId, setFilterCallId] = useState('')
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const fetchLogs = useCallback(async (callId?: string, silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (callId) params.set('call_id', callId)
      const res = await fetch(`/api/ai-agents/logs?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as { logs: CallLog[] }
      setLogs(data.logs ?? [])
      setLastRefreshed(new Date())
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial load
  useEffect(() => {
    void fetchLogs(filterCallId || undefined)
  }, [fetchLogs, filterCallId])

  // Real-time synchronization
  useAiCallingRealtime(() => {
    void fetchLogs(filterCallId || undefined, true)
  }, true)

  const handleSearch = () => {
    setFilterCallId(inputValue.trim())
    setLoading(true)
  }

  const handleClear = () => {
    setInputValue('')
    setFilterCallId('')
    setLoading(true)
  }

  const handleRefresh = () => {
    void fetchLogs(filterCallId || undefined)
  }

  const received = logs.filter((l) => isValidRecordingUrl(l.recording_url)).length
  const notReceived = logs.length - received

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Call Recording Logs</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Live view of recording delivery status for each completed call.
            {lastRefreshed && (
              <span className="ml-2 text-gray-400">
                Last updated: {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            Live Sync
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 bg-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Badges */}
      {!loading && logs.length > 0 && (
        <div className="flex gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-green-700">{received} Received</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <XCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-700">{notReceived} Not Received</span>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-3 max-w-xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search by Call ID..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9 w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          Search
        </button>
        {filterCallId && (
          <button
            onClick={handleClear}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Column Headers */}
        <div className="grid grid-cols-3 px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <span>Call ID</span>
          <span>Recording Status</span>
          <span>Timestamp</span>
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading recording logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            No calls found{filterCallId ? ` matching "${filterCallId}"` : ''}.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log) => {
              const recordingReceived = isValidRecordingUrl(log.recording_url)
              const ts = new Date(log.updated_at || log.created_at).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div
                  key={log.call_id}
                  className="grid grid-cols-3 px-6 py-4 items-center hover:bg-gray-50 transition-colors"
                >
                  {/* Call ID */}
                  <span className="text-sm font-mono text-gray-700 truncate" title={log.call_id}>
                    {log.call_id}
                  </span>

                  {/* Recording Status */}
                  {recordingReceived ? (
                    <span className="inline-flex items-center gap-1.5 w-fit px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Received
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 w-fit px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                      <XCircle className="w-3.5 h-3.5" />
                      Not Received
                    </span>
                  )}

                  {/* Timestamp */}
                  <span className="text-sm text-gray-500">{ts}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {logs.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {logs.length} calls · auto-refreshes every 10s
        </p>
      )}
    </div>
  )
}

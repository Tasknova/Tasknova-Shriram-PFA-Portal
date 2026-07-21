'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, Phone, Send } from 'lucide-react'
import { Agent } from '@/types'
import { useAiCallingRealtime } from '@/hooks/useAiCallingRealtime'
import { isCallAwaitingRecording, mergeCallState } from '@/lib/callState'
import { isShriramPFAAgent, SHRIRAM_PFA_DIDS } from '@/lib/aiAgentsUtils'

interface Call {
  call_id: string
  agent_id: string
  status: string
  call_type: string
  duration: number
  recording_url: string | null
  transcript_status: string
  outcome: string
  customer_number: string
  agent_number: string
  did: string
  agent_config: Record<string, string> | null
  created_at: string
  updated_at?: string
  started_at?: string | null
  ended_at?: string | null
  ai_agents: { name: string }
  ai_transcripts: Array<{ summary: string; call_outcome: string }>
  ai_evaluations: Array<{
    id?: string
    status?: 'processing' | 'completed' | 'failed'
    score: number | null
    overall_score?: number | null
    issues: string[]
    suggestions: string[]
    error_message?: string | null
  }>
}

const getActualDuration = (call: Call) => {
  // Priority 1: use the explicit duration from DB if it's non-zero
  if (call.duration && call.duration > 0) return call.duration;
  // Priority 2: use started_at → ended_at (ended_at = transcript.createdAt, i.e. when call truly ended)
  if (call.started_at && call.ended_at) {
    const start = new Date(call.started_at).getTime();
    const end = new Date(call.ended_at).getTime();
    const diffSeconds = Math.floor((end - start) / 1000);
    if (diffSeconds > 0) return diffSeconds;
  }
  // Priority 3: fall back to created_at → ended_at for older calls where started_at is null
  if (call.created_at && call.ended_at) {
    const start = new Date(call.created_at).getTime();
    const end = new Date(call.ended_at).getTime();
    const diffSeconds = Math.floor((end - start) / 1000);
    if (diffSeconds > 0 && diffSeconds < 7200) return diffSeconds; // sanity cap at 2 hours
  }
  return 0;
};

const formatDuration = (seconds: number) => {
  if (!seconds || seconds <= 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

export default function CallsTab({ isActive = true }: { isActive?: boolean }) {
  const [calls, setCalls] = useState<Call[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [selectedCallDetails, setSelectedCallDetails] = useState<Call | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [filters, setFilters] = useState({
    agent_id: '',
    status: '',
    call_type: '',
  })
  const [agents, setAgents] = useState<Agent[]>([])

  // Initiate call form state
  const [customerNumber, setCustomerNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [selectedAgent, setSelectedAgent] = useState('')
  const [organizationDid, setOrganizationDid] = useState('')
  const [initiatingCall, setInitiatingCall] = useState(false)
  const [callResponse, setCallResponse] = useState<{
    call_id: string
    call_status: string
    message: string
    failure_reason?: string | null
  } | null>(null)
  const [showStatusModal, setShowStatusModal] = useState(false)

  // Agent config form state — dynamic per agent's call_infields
  const [agentCallInfields, setAgentCallInfields] = useState<Array<{
    field_name: string
    field_type: string
    field_enum?: string[] | null
    is_visible?: boolean
  }>>([])
  const [agentConfig, setAgentConfig] = useState<Record<string, string>>({})

  // Call Again state — pre-fills form when re-calling
  const [callAgainData, setCallAgainData] = useState<{
    customer_number: string
    agent_id: string
    did: string
    agent_config: Record<string, string> | null
  } | null>(null)

  const detailsRequestIdRef = useRef(0)
  const selectedCallIdRef = useRef<string | null>(null)
  selectedCallIdRef.current = selectedCall?.call_id ?? null

  const applyCallUpdate = useCallback((incoming: Call) => {
    setSelectedCallDetails((prev) => {
      if (!prev || prev.call_id !== incoming.call_id) {
        return incoming
      }
      return mergeCallState(prev, incoming)
    })

    setSelectedCall((prev) => {
      if (!prev || prev.call_id !== incoming.call_id) {
        return prev
      }
      return mergeCallState(prev, incoming)
    })

    setCalls((prev) =>
      prev.map((call) =>
        call.call_id === incoming.call_id ? mergeCallState(call, incoming) : call
      )
    )
  }, [])

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/ai-agents/index', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch agents')
      const result = await response.json()
      setAgents(result.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
    }
  }

  const fetchAgentConfig = async (agentId: string) => {
    try {
      const response = await fetch(`/api/ai-agents/${agentId}/config`, { cache: 'no-store' })
      if (!response.ok) {
        setAgentCallInfields([])
        setAgentConfig({})
        return
      }
      const result = await response.json()
      const rawInfields = result.data?.call_infields || []
      const infields = rawInfields.map((f: unknown) => {
        if (typeof f === 'string') {
          try { return JSON.parse(f) } catch { return null }
        }
        return f
      }).filter(Boolean)
      setAgentCallInfields(infields)
      const initialValues: Record<string, string> = {}
      infields.forEach((f: { field_name: string }) => {
        initialValues[f.field_name] = ''
      })
      setAgentConfig(initialValues)
    } catch (error) {
      console.error('Error fetching agent config:', error)
      setAgentCallInfields([])
      setAgentConfig({})
    }
  }

  const fetchCalls = useCallback(async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false
    try {
      if (showLoading) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      const params = new URLSearchParams()
      if (filters.agent_id) params.append('agent_id', filters.agent_id)
      if (filters.status) params.append('status', filters.status)
      if (filters.call_type) params.append('call_type', filters.call_type)
      params.append('_t', Date.now().toString())

      const response = await fetch(`/api/ai-agents/calls?${params}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch calls')
      const result = await response.json()
      setCalls(result.calls || [])
    } catch (error) {
      console.error('Error fetching calls:', error)
      if (showLoading) {
        toast.error('Failed to load calls')
      }
    } finally {
      if (showLoading) {
        setLoading(false)
      } else {
        setRefreshing(false)
      }
    }
  }, [filters.agent_id, filters.call_type, filters.status])

  const fetchCallDetails = useCallback(async (callId: string, options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading ?? false
    const requestId = ++detailsRequestIdRef.current

    try {
      if (showLoading) {
        setLoadingDetails(true)
      }

      const response = await fetch(`/api/ai-agents/calls/${callId}?_t=${Date.now()}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (requestId !== detailsRequestIdRef.current) {
        return
      }

      if (!response.ok || !result?.call) {
        throw new Error(result?.error || 'Failed to fetch call details')
      }

      applyCallUpdate(result.call as Call)
    } catch (error) {
      if (requestId === detailsRequestIdRef.current) {
        console.error('Error fetching call details:', error)
        if (showLoading) {
          toast.error('Failed to load call details')
        }
      }
    } finally {
      if (showLoading && requestId === detailsRequestIdRef.current) {
        setLoadingDetails(false)
      }
    }
  }, [applyCallUpdate])

  const syncTranscriptStatus = useCallback(async (callId: string, options?: { notify?: boolean }) => {
    try {
      const response = await fetch(`/api/ai-agents/calls/${callId}/transcript-status`, {
        method: 'POST',
        cache: 'no-store',
      })
      const result = await response.json()

      if (!response.ok || !result?.call) {
        throw new Error(result?.error || 'Failed to check transcript status')
      }

      applyCallUpdate(result.call as Call)

      if (options?.notify) {
        const call = result.call as Call
        if (call.recording_url) {
          toast.success('Recording is ready')
        } else if (call.transcript_status === 'failed' || call.status === 'failed') {
          toast.error('Transcript processing failed')
        } else {
          toast.success('Transcript status updated')
        }
      }
    } catch (error) {
      if (options?.notify) {
        console.error('Error syncing transcript status:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to check transcript status')
      }
    }
  }, [applyCallUpdate])

  useAiCallingRealtime(() => {
    void fetchCalls()
    const callId = selectedCallIdRef.current
    if (callId) {
      void fetchCallDetails(callId)
    }
  }, isActive)

  const retryTranscriptStatus = async (callId: string) => {
    await syncTranscriptStatus(callId, { notify: true })
  }

  const selectedAgentObj = agents.find((agent) => agent.agent_id === selectedAgent);
  const isShriramPFA = isShriramPFAAgent(selectedAgentObj?.name);
  const visibleAgentCallInfields = agentCallInfields.filter(
    (f) => f.field_name && !(isShriramPFA && f.field_name === 'customer_name')
  );

  const handleInitiateCall = async () => {
    if (!customerNumber.trim() || !selectedAgent || !organizationDid.trim() || (isShriramPFA && !customerName.trim())) {
      toast.error(isShriramPFA
        ? 'Please fill in customer number, customer name, and select a DID'
        : 'Please fill in all required fields: customer number, agent, and organization DID'
      )
      return
    }

    try {
      setInitiatingCall(true)
      
      // Build request body
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestBody: any = {
        customer_number: customerNumber.trim(),
        agent_id: selectedAgent,
        transcript: true,
        transcript_language: 'en',
      }

      // Always send the DID — for Shriram PFA it is selected from the dropdown
      requestBody.did = organizationDid.trim()

      // Build agent_config from dynamic fields, then merge Shriram PFA customer_name
      const mergedAgentConfig: Record<string, string> = {}
      for (const [key, val] of Object.entries(agentConfig)) {
        if (val.trim()) {
          mergedAgentConfig[key] = val.trim()
        }
      }
      if (isShriramPFA && customerName.trim()) {
        mergedAgentConfig.customer_name = customerName.trim()
      }
      if (Object.keys(mergedAgentConfig).length > 0) {
        requestBody.agent_config = mergedAgentConfig
      }

      console.log('Sending initiate call request:', requestBody)

      // Create abort controller with 30 second timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const response = await fetch('/api/ai-agents/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      console.log('Response status:', response.status, response.statusText)
      const result = await response.json()
      console.log('Response data:', result)

      if (!response.ok) {
        throw new Error(result.error || `API error: ${response.statusText}`)
      }

      // Show status modal with the response
      setCallResponse({
        call_id: result.call_id,
        call_status: result.call_status,
        message: result.message,
        failure_reason: result.failure_reason,
      })
      setShowStatusModal(true)

      if (result.call_status === 'in_progress' || result.call_status === 'pending') {
        const selectedAgentName = agents.find((agent) => agent.agent_id === selectedAgent)?.name || '-'
        setCalls((current) => {
          if (current.some((call) => call.call_id === result.call_id)) {
            return current
          }

          const optimisticCall: Call = {
            call_id: result.call_id,
            agent_id: selectedAgent,
            status: result.call_status,
            call_type: 'unknown',
            duration: 0,
            recording_url: null,
            transcript_status: 'pending',
            outcome: '',
            customer_number: customerNumber.trim(),
            agent_number: selectedAgent,
            did: organizationDid.trim(),
            agent_config: requestBody.agent_config || null,
            created_at: new Date().toISOString(),
            ai_agents: { name: selectedAgentName },
            ai_transcripts: [],
            ai_evaluations: [],
          }

          return [optimisticCall, ...current]
        })

        setCustomerNumber('')
        setCustomerName('')
        setSelectedAgent('')
        setOrganizationDid('')
        setAgentConfig({})
        toast.success(`Call initiated! ID: ${result.call_id}`)
        void fetchCalls()
      } else {
        toast.error(result.failure_reason || result.message || `Call initiation failed with status: ${result.call_status}`)
      }
    } catch (error) {
      console.error('Error initiating call:', error)
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          toast.error('Request timeout - call initiation took too long. Please try again.')
        } else {
          toast.error(error.message)
        }
      } else {
        toast.error('Failed to initiate call')
      }
    } finally {
      setInitiatingCall(false)
    }
  }

  useEffect(() => {
    fetchAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void fetchCalls({ showLoading: true })
  }, [fetchCalls])

  // Fallback polling for environments where Realtime may lag
  useEffect(() => {
    if (!isActive) {
      return
    }

    const intervalId = window.setInterval(() => {
      void fetchCalls()
    }, 15000)
    return () => window.clearInterval(intervalId)
  }, [fetchCalls, isActive])

  // Auto-sync recording/transcript from IndusLabs while call is still active
  useEffect(() => {
    if (!isActive || !selectedCall?.call_id || !selectedCallDetails) {
      return
    }

    if (!isCallAwaitingRecording(selectedCallDetails)) {
      return
    }

    const callId = selectedCall.call_id
    void syncTranscriptStatus(callId)

    const intervalId = window.setInterval(() => {
      void syncTranscriptStatus(callId)
    }, 6000)

    return () => window.clearInterval(intervalId)
  }, [isActive, selectedCall?.call_id, selectedCallDetails, syncTranscriptStatus])

  // Fetch agent config when agent is selected
  useEffect(() => {
    if (selectedAgent) {
      fetchAgentConfig(selectedAgent)
      setCustomerName('') // reset customer name when agent changes
    } else {
      setAgentCallInfields([])
      setAgentConfig({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent])

  // Pre-fill form when "Call Again" is triggered
  useEffect(() => {
    if (callAgainData) {
      setCustomerNumber(callAgainData.customer_number || '')
      setSelectedAgent(callAgainData.agent_id || '')
      setOrganizationDid(callAgainData.did || '')
      if (callAgainData.agent_config) {
        const config = { ...callAgainData.agent_config } as Record<string, string>
        if (config.customer_name) {
          setCustomerName(config.customer_name)
          delete config.customer_name
        }
        setAgentConfig(config)
      }
      setCallAgainData(null)
      toast.success('Form pre-filled from previous call. Click Make Call to dial again.')
    }
  }, [callAgainData])

  if (selectedCall) {
    return (
      <CallDetail 
        call={selectedCallDetails} 
        loading={loadingDetails}
        onBack={() => {
          setSelectedCall(null)
          setSelectedCallDetails(null)
        }}
        onRetryTranscript={() => selectedCallDetails && retryTranscriptStatus(selectedCallDetails.call_id)}
        onCallAgain={(callData) => {
          setSelectedCall(null)
          setSelectedCallDetails(null)
          setCallAgainData(callData)
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Call Status Modal */}
      {showStatusModal && callResponse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-lg">
            <div className="flex items-center justify-center mb-4">
              {callResponse.call_status === 'in_progress' || callResponse.call_status === 'pending' ? (
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
                  <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
                  <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            <h3 className={`text-xl font-semibold text-center mb-2 ${
              callResponse.call_status === 'in_progress' || callResponse.call_status === 'pending'
                ? 'text-green-600'
                : 'text-red-600'
            }`}>
              {callResponse.call_status === 'in_progress' || callResponse.call_status === 'pending'
                ? 'Call Initiated Successfully!'
                : 'Call Initiation Failed'}
            </h3>

            <p className="text-center text-gray-600 mb-4">
              {callResponse.message}
            </p>

            {callResponse.failure_reason && callResponse.call_status === 'failed' && (
              <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
                <p className="text-xs font-medium text-red-800 mb-1">Reason</p>
                <p className="text-sm text-red-700">{callResponse.failure_reason}</p>
              </div>
            )}

            <div className="bg-gray-50 rounded p-3 mb-6">
              <p className="text-xs text-gray-600 mb-1">Call ID:</p>
              <p className="text-sm font-mono text-gray-900 break-all">{callResponse.call_id}</p>
            </div>

            <div className="bg-gray-50 rounded p-3 mb-6">
              <p className="text-xs text-gray-600 mb-1">Status:</p>
              <p className="text-sm font-semibold">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  callResponse.call_status === 'in_progress' || callResponse.call_status === 'pending'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}>
                  {callResponse.call_status.toUpperCase()}
                </span>
              </p>
            </div>

            <button
              onClick={() => {
                setShowStatusModal(false)
                setCallResponse(null)
              }}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Initiate Call Section */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Initiate New Call</h2>
        </div>

        <div className="space-y-4">
          {/* Basic Fields */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Customer Number*
              </label>
              <input
                type="tel"
                value={customerNumber}
                onChange={(e) => setCustomerNumber(e.target.value)}
                placeholder="e.g., 9175442260 (91 added auto)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={initiatingCall}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Agent*
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={initiatingCall}
              >
                <option value="">Choose an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Name — only for Shriram PFA agents */}
            {isShriramPFA && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer Name*
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g., Mihir Sharma"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={initiatingCall}
                />
              </div>
            )}

            {/* DID — dropdown for Shriram PFA, free-text for others */}
            {isShriramPFA ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select DID*
                </label>
                <select
                  value={organizationDid}
                  onChange={(e) => setOrganizationDid(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={initiatingCall}
                >
                  <option value="">— Select DID —</option>
                  {SHRIRAM_PFA_DIDS.map((did) => (
                    <option key={did.value} value={did.value}>{did.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organization DID*
                </label>
                <input
                  type="tel"
                  value={organizationDid}
                  onChange={(e) => setOrganizationDid(e.target.value)}
                  placeholder="e.g., 919484956750"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={initiatingCall}
                />
              </div>
            )}

            <button
              onClick={handleInitiateCall}
              disabled={initiatingCall || !customerNumber.trim() || !selectedAgent || !organizationDid.trim() || (isShriramPFA && !customerName.trim())}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {initiatingCall ? 'Initiating...' : 'Make Call'}
            </button>
          </div>

          {/* Agent Config Fields — dynamic from call_infields */}
          {selectedAgent && visibleAgentCallInfields.length > 0 && (
            <div className="bg-white rounded-lg border border-blue-300 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Agent Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {visibleAgentCallInfields.map((field) => (
                  <div key={field.field_name}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {(field.field_name || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </label>
                    {field.field_type === 'DATE' ? (
                      <input
                        type="date"
                        value={agentConfig[field.field_name] || ''}
                        onChange={(e) => setAgentConfig({ ...agentConfig, [field.field_name]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={initiatingCall}
                      />
                    ) : field.field_enum && field.field_enum.length > 0 ? (
                      <select
                        value={agentConfig[field.field_name] || ''}
                        onChange={(e) => setAgentConfig({ ...agentConfig, [field.field_name]: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={initiatingCall}
                      >
                        <option value="">Select...</option>
                        {field.field_enum.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={agentConfig[field.field_name] || ''}
                        onChange={(e) => setAgentConfig({ ...agentConfig, [field.field_name]: e.target.value })}
                        placeholder={`Enter ${field.field_name.replace(/_/g, ' ')}`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={initiatingCall}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Call History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Call History</h3>
          <button
            onClick={() => void fetchCalls()}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition flex items-center gap-1.5"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex gap-4 flex-wrap">
        <select
          value={filters.agent_id}
          onChange={(e) => setFilters({ ...filters, agent_id: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Agents</option>
          {agents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agent.name}
            </option>
          ))}
        </select>

        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>

        <select
          value={filters.call_type}
          onChange={(e) => setFilters({ ...filters, call_type: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All Types</option>
          <option value="valid">Valid</option>
          <option value="failed">Failed</option>
          <option value="invalid">Invalid</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8">Loading calls...</div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No calls found with current filters.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Call ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Agent</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600">Created</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {calls.map((call) => (
                <tr
                  key={call.call_id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    setSelectedCall(call)
                    setSelectedCallDetails(call)
                    void fetchCallDetails(call.call_id, { showLoading: true })
                  }}
                >
                  <td className="px-6 py-4 text-sm font-mono text-gray-900">{call.call_id.substring(0, 12)}...</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{call.ai_agents?.name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{formatDuration(getActualDuration(call))}</td>
                  <td className="px-6 py-4">
                    <StatusBadge status={call.status} />
                  </td>
                  <td className="px-6 py-4">
                    <TypeBadge type={call.call_type} status={call.status} />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(call.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  )
}

function CallDetail({ call, loading, onBack, onRetryTranscript, onCallAgain }: { call: Call | null; loading?: boolean; onBack: () => void; onRetryTranscript?: () => void; onCallAgain?: (data: { customer_number: string; agent_id: string; did: string; agent_config: Record<string, string> | null }) => void }) {
  if (loading && !call) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
        >
          ← Back to Calls
        </button>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 mb-4">
              <div className="animate-spin">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600">Loading call details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!call) {
    return (
      <div className="space-y-6">
        <button
          onClick={onBack}
          className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
        >
          ← Back to Calls
        </button>
        <div className="text-center py-12">
          <p className="text-gray-600">Call details not found</p>
        </div>
      </div>
    )
  }

  const transcript = call.ai_transcripts?.[0]
  const evaluation = call.ai_evaluations?.[0]
  const validRecordingUrl = call.recording_url && call.recording_url !== 'pending' && call.recording_url !== 'failed' ? call.recording_url : null
  const recordingReady = Boolean(validRecordingUrl) || call.transcript_status === 'completed'
  const awaitingRecording = isCallAwaitingRecording(call)
  const isFailedCall = call.status === 'failed' || call.call_type === 'failed'

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
      >
        ← Back to Calls
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Call Details & Transcript */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Call Details</h2>
              {onCallAgain && (
                <button
                  onClick={() => onCallAgain({
                    customer_number: call.customer_number || '',
                    agent_id: call.agent_id || '',
                    did: call.did || '',
                    agent_config: call.agent_config || null,
                  })}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium flex items-center gap-2"
                >
                  <Phone className="w-4 h-4" />
                  Call Again
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <DetailItem label="Call ID" value={call.call_id} />
              <DetailItem label="Agent" value={call.ai_agents?.name || '-'} />
              <DetailItem label="Duration" value={formatDuration(getActualDuration(call))} />
              <div>
                <p className="text-xs font-medium text-gray-600">Status</p>
                <div className="mt-1">
                  <StatusBadge status={call.status} />
                </div>
              </div>
              <DetailItem label="Type" value={call.call_type} />
              <DetailItem label="Created" value={new Date(call.created_at).toLocaleString()} />
              <DetailItem label="Customer Number" value={call.customer_number || '-'} />
              <DetailItem label="DID" value={call.did || '-'} />
            </div>
          </div>

          {/* Recording Status & Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recording Status</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Status:</p>
                  <div className="flex items-center gap-2 mt-2">
                    {recordingReady && (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Ready
                        </span>
                      </>
                    )}
                    {!recordingReady && call.transcript_status === 'pending' && (
                      <>
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      </>
                    )}
                    {call.transcript_status === 'failed' && (
                      <>
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Failed
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {awaitingRecording && (
                  <button
                    onClick={onRetryTranscript}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                  >
                    Check Status
                  </button>
                )}
                {call.transcript_status === 'failed' && (
                  <button
                    onClick={onRetryTranscript}
                    className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm font-medium"
                  >
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Transcript */}
          {isFailedCall ? (
            <div className="bg-red-50 rounded-lg border border-red-200 p-6">
              <h3 className="text-lg font-semibold text-red-900 mb-2">Call Failed</h3>
              <p className="text-sm text-red-700">The call failed to connect or was dropped. No transcript is available.</p>
            </div>
          ) : transcript ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Transcript</h3>
              <div className="space-y-3">
                {transcript.summary && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Summary:</p>
                    <p className="text-sm text-gray-600 mt-1">{transcript.summary}</p>
                  </div>
                )}
                {transcript.call_outcome && (
                  <div>
                    <p className="text-sm font-medium text-gray-700">Outcome:</p>
                    <p className="text-sm text-gray-600 mt-1">{transcript.call_outcome}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center py-8">
              <p className="text-gray-500 text-sm">Transcript is not available yet.</p>
            </div>
          )}
        </div>

        {/* Sidebar - Recording & Evaluation */}
        <div className="space-y-6">
          {/* Recording */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recording</h3>
            {validRecordingUrl ? (
              <audio controls className="w-full">
                <source src={validRecordingUrl} type="audio/mpeg" />
                Your browser does not support the audio element.
              </audio>
            ) : isFailedCall ? (
              <div className="text-sm text-red-500">
                Recording failed
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
                Recording pending — check status above to refresh
              </div>
            )}
          </div>

          {/* Evaluation */}
          {isFailedCall ? (
             <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Evaluation</h3>
              <p className="text-sm text-gray-500">Evaluation is not available for failed calls.</p>
            </div>
          ) : evaluation ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Evaluation</h3>
              <div className="mb-4">
                {evaluation.status === 'processing' ? (
                  <>
                    <p className="text-lg font-semibold text-blue-600">Processing...</p>
                    <p className="text-sm text-gray-600">Evaluation has started and will appear here when complete.</p>
                  </>
                ) : evaluation.status === 'failed' ? (
                  <>
                    <p className="text-lg font-semibold text-red-600">Evaluation Failed</p>
                    <p className="text-sm text-gray-600">{evaluation.error_message || 'Unable to process this call.'}</p>
                  </>
                ) : (
                  <>
                    <p className="text-3xl font-bold text-purple-600">
                      {typeof (evaluation.overall_score ?? evaluation.score) === 'number'
                        ? (evaluation.overall_score ?? evaluation.score)?.toFixed(2)
                        : '-'}
                    </p>
                    <p className="text-sm text-gray-600">Evaluation Score</p>
                  </>
                )}
              </div>

              {evaluation.issues && evaluation.issues.length > 0 && (
                <div>
                  <p className="font-medium text-gray-700 text-sm mb-2">Issues:</p>
                  <ul className="space-y-1">
                    {evaluation.issues.map((issue, idx) => (
                      <li key={idx} className="text-sm text-red-600">
                        • {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                <div className="mt-4">
                  <p className="font-medium text-gray-700 text-sm mb-2">Suggestions:</p>
                  <ul className="space-y-1">
                    {evaluation.suggestions.map((suggestion, idx) => (
                      <li key={idx} className="text-sm text-green-600">
                        • {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status === 'success' ? 'in_progress' : status
  const labels: Record<string, string> = {
    pending: 'Calling',
    in_progress: 'In Progress',
    completed: 'Completed',
    failed: 'Failed',
  }
  const colors: { [key: string]: string } = {
    completed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[normalizedStatus] || 'bg-gray-100 text-gray-800'}`}>
      {labels[normalizedStatus] || normalizedStatus}
    </span>
  )
}

function TypeBadge({ type, status }: { type: string; status?: string }) {
  const isCompleted = status === 'completed'
  const displayType = isCompleted ? 'valid' : type
  const colors: { [key: string]: string } = {
    valid: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    invalid: 'bg-orange-100 text-orange-800',
    unknown: 'bg-gray-100 text-gray-800',
  }
  const labels: { [key: string]: string } = {
    valid: 'Valid',
    failed: 'Failed',
    invalid: 'Invalid',
    unknown: 'Unknown',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[displayType] || 'bg-gray-100 text-gray-800'}`}>
      {labels[displayType] || displayType}
    </span>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="text-sm text-gray-900 mt-1">{value}</p>
    </div>
  )
}

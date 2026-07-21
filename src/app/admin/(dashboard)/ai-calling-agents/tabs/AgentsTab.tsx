'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronRight, RefreshCw, Clock, ExternalLink } from 'lucide-react'

interface Agent {
  agent_id: string
  name: string
  total_calls: number
  valid_calls: number
  failed_calls: number
  avg_score: number
  created_at: string
}

interface SyncStatus {
  needs_sync: boolean
  last_sync: string | null
  next_sync_at: string | null
  time_until_next_sync_minutes: number
}

export default function AgentsTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null)

  useEffect(() => {
    initializeAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const checkSyncStatus = async () => {
    try {
      const response = await fetch('/api/ai-agents/check-sync-status')
      if (!response.ok) throw new Error('Failed to check sync status')
      const status = await response.json()
      setSyncStatus(status)
      if (status.last_sync) {
        setLastSyncTime(new Date(status.last_sync))
      }
      return status
    } catch (error) {
      console.error('Error checking sync status:', error)
      return null
    }
  }

  const initializeAgents = async () => {
    try {
      setLoading(true)
      
      // Fetch agents first (faster path)
      await fetchAgents()
      
      // Check sync status in background (don't wait for it)
      checkSyncStatus().then(status => {
        if (status && status.needs_sync) {
          console.log('Auto-syncing agents (1 hour interval passed)')
          syncFromIndusLabs(true)
        }
      })
    } catch (error) {
      console.error('Error initializing agents:', error)
      await fetchAgents()
    } finally {
      setLoading(false)
    }
  }

  const fetchAgents = async () => {
    try {
      const response = await fetch('/api/ai-agents/index')
      if (!response.ok) throw new Error('Failed to fetch agents')
      const result = await response.json()
      setAgents(result.agents || [])
    } catch (error) {
      console.error('Error fetching agents:', error)
      toast.error('Failed to load agents')
    }
  }

  const syncFromIndusLabs = async (isAutoSync = false) => {
    try {
      setSyncing(true)
      const response = await fetch('/api/ai-agents/sync-induslabs', {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to sync agents')
      }
      const result = await response.json()
      setAgents(result.agents || [])
      
      // Update sync status
      await checkSyncStatus()
      
      if (!isAutoSync) {
        toast.success(`Synced ${result.synced_count} agents from IndusLabs`)
      }
    } catch (error) {
      console.error('Error syncing from IndusLabs:', error)
      if (!isAutoSync) {
        toast.error(error instanceof Error ? error.message : 'Failed to sync agents')
      }
    } finally {
      setSyncing(false)
    }
  }

  const syncAgentConfigs = async () => {
    try {
      setSyncing(true)
      const response = await fetch('/api/ai-agents/sync-configs', {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to sync agent configs')
      }
      const result = await response.json()
      toast.success(result.message || 'Agent configs synced successfully')
    } catch (error) {
      console.error('Error syncing agent configs:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to sync agent configs')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading agents...</div>
  }

  if (selectedAgent) {
    return (
      <AgentDetail agent={selectedAgent} onBack={() => setSelectedAgent(null)} />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Agents</h2>
          {lastSyncTime && (
            <p className="text-xs text-gray-500 mt-1">
              Last synced: {lastSyncTime.toLocaleString()}
            </p>
          )}
          {syncStatus && syncStatus.time_until_next_sync_minutes > 0 && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" />
              Next auto-sync in {syncStatus.time_until_next_sync_minutes} min
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => syncFromIndusLabs(false)}
            disabled={syncing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Agents'}
          </button>
          <button 
            onClick={syncAgentConfigs}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            Sync Configs
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600">No agents found. Sync from IndusLabs to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.agent_id}
              onClick={() => setSelectedAgent(agent)}
              className="bg-white rounded-lg border border-gray-200 p-6 cursor-pointer hover:shadow-md transition h-full"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{agent.name}</h3>
                  <p className="text-sm text-gray-600">ID: {agent.agent_id}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>

              <div className="grid grid-cols-4 gap-4 mt-4">
                <MetricSmall label="Total Calls" value={agent.total_calls} />
                <MetricSmall label="Valid Calls" value={agent.valid_calls} color="text-green-600" />
                <MetricSmall label="Failed Calls" value={agent.failed_calls} color="text-red-600" />
                <MetricSmall label="Avg Score" value={agent.avg_score ? agent.avg_score.toFixed(2) : 'N/A'} color="text-purple-600" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Metrics {
  agent_id: string
  total_calls: number
  valid_calls: number
  failed_calls: number
  invalid_calls: number
  completed_calls: number
  avg_score: number
  success_rate: number
  avg_duration: number
}

interface AgentDetails {
  local: Record<string, unknown>
  remote: Record<string, unknown> | null
}

interface AgentConfig {
  agent_id: string
  system_prompt?: string
  starting_instructions?: string
  agent_type?: string
  guardrail_ids?: string[]
  call_infields?: Array<{
    field_name: string
    field_type: string
    is_visible: boolean
  }>
  tts_config?: Record<string, unknown>
  llm_config?: Record<string, unknown>
  stt_config?: Record<string, unknown>
  vad_config?: Record<string, unknown>
  notes?: string
  status?: string
  version?: number
  synced_at?: string
}

function AgentDetail({ agent, onBack }: { agent: Agent; onBack: () => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [agentDetails, setAgentDetails] = useState<AgentDetails | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [configLoading, setConfigLoading] = useState(true)
  const [showUpdateConfig, setShowUpdateConfig] = useState(false)

  useEffect(() => {
    fetchMetrics()
    fetchAgentDetails()
    fetchAgentConfig()
  }, [agent.agent_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/ai-agents/${agent.agent_id}/metrics`)
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const result = await response.json()
      setMetrics(result)
    } catch (error) {
      console.error('Error fetching metrics:', error)
      toast.error('Failed to load metrics')
    } finally {
      setLoading(false)
    }
  }

  const fetchAgentDetails = async () => {
    try {
      setDetailsLoading(true)
      const response = await fetch(`/api/ai-agents/${agent.agent_id}/details`)
      if (!response.ok) throw new Error('Failed to fetch agent details')
      const result = await response.json()
      setAgentDetails(result)
    } catch (error) {
      console.error('Error fetching agent details:', error)
      // Don't show error toast as details are optional
    } finally {
      setDetailsLoading(false)
    }
  }

  const fetchAgentConfig = async () => {
    try {
      setConfigLoading(true)
      console.log(`Fetching config for agent: ${agent.agent_id}`)
      const response = await fetch(`/api/ai-agents/${agent.agent_id}/config`)
      
      if (response.status === 404) {
        console.warn('Agent config not found - needs to be synced')
        setAgentConfig(null)
        return
      }
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch agent config')
      }
      
      const result = await response.json()
      console.log('Agent config fetched:', result.data)
      setAgentConfig(result.data)
    } catch (error) {
      console.error('Error fetching agent config:', error)
      setAgentConfig(null)
    } finally {
      setConfigLoading(false)
    }
  }

  const syncAgentConfig = async () => {
    try {
      setConfigLoading(true)
      console.log(`Syncing config for agent: ${agent.agent_id}`)
      const response = await fetch('/api/ai-agents/sync-configs', {
        method: 'POST',
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to sync agent config')
      }
      
      const result = await response.json()
      console.log('Sync result:', result)
      
      // Refetch the config after syncing
      await fetchAgentConfig()
      toast.success('Agent config synced successfully')
    } catch (error) {
      console.error('Error syncing agent config:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to sync agent config')
      setConfigLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
      >
        ← Back to Agents
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{agent.name}</h2>
            <p className="text-gray-600 mt-1">Agent ID: {agent.agent_id}</p>
          </div>
          <button
            onClick={fetchAgentDetails}
            disabled={detailsLoading}
            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            Refresh Details
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">Loading metrics...</div>
        ) : metrics ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
            <MetricCard label="Total Calls" value={metrics.total_calls} />
            <MetricCard label="Valid Calls" value={metrics.valid_calls} />
            <MetricCard label="Failed Calls" value={metrics.failed_calls} />
            <MetricCard label="Invalid Calls" value={metrics.invalid_calls} />
            <MetricCard label="Completed" value={metrics.completed_calls} />
            <MetricCard label="Avg Score" value={metrics.avg_score ? metrics.avg_score.toFixed(2) : 'N/A'} />
            <MetricCard label="Success Rate" value={`${metrics.success_rate}%`} />
            <MetricCard label="Avg Duration" value={`${metrics.avg_duration}s`} />
          </div>
        ) : (
          <div className="text-center py-8 text-red-600">Failed to load metrics</div>
        )}
      </div>

      {agentDetails && !detailsLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4">Agent Details</h3>

          {agentDetails.remote ? (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-4">
                <DetailItem
                  label="Agent Name"
                  value={String(agentDetails.remote.agent_name || '')}
                />
                <DetailItem
                  label="Agent Type"
                  value={String(agentDetails.remote.agent_type || '')}
                />
                <DetailItem
                  label="Agent ID"
                  value={String(agentDetails.remote.agent_id || '')}
                />
                <DetailItem
                  label="Status"
                  value={(agentDetails.remote?.is_active as boolean) ? 'Active' : 'Inactive'}
                  valueColor={(agentDetails.remote?.is_active as boolean) ? 'text-green-600' : 'text-red-600'}
                />
              </div>

              {/* Description */}
              {(agentDetails.remote?.agent_description as string) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Description</p>
                  <p className="text-sm text-gray-600">{String(agentDetails.remote.agent_description)}</p>
                </div>
              )}

              {/* Organization & Team */}
              <div className="grid grid-cols-2 gap-4">
                <DetailItem
                  label="Organization ID"
                  value={String(agentDetails.remote.organization_id || '')}
                />
                <DetailItem
                  label="User ID"
                  value={String(agentDetails.remote.user_id || '')}
                />
                <DetailItem
                  label="Team Size"
                  value={String(agentDetails.remote.team_size || '0')}
                />
                <DetailItem
                  label="WhatsApp Enabled"
                  value={(agentDetails.remote?.whatsapp_enabled as boolean) ? 'Yes' : 'No'}
                />
              </div>

              {/* LiveKit Configuration */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">LiveKit Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    label="LiveKit API Key"
                    value={String(agentDetails.remote.livekit_api_key || '')}
                    monospace
                  />
                  <DetailItem
                    label="LiveKit Host"
                    value={String(agentDetails.remote.livekit_host_url || '')}
                    monospace
                  />
                </div>
              </div>

              {/* Timestamps */}
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Timestamps</h4>
                <div className="grid grid-cols-2 gap-4">
                  <DetailItem
                    label="Created At"
                    value={new Date(String(agentDetails.remote.created_at)).toLocaleString()}
                    small
                  />
                  <DetailItem
                    label="Updated At"
                    value={new Date(String(agentDetails.remote.updated_at)).toLocaleString()}
                    small
                  />
                </div>
              </div>

              {/* Cost Information */}
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm font-medium text-blue-900 mb-1">Agent Cost</p>
                <p className="text-2xl font-bold text-blue-600">${String(agentDetails.remote?.agent_cost || '0')}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <p>Could not fetch remote agent details from IndusLabs</p>
              <p className="text-sm mt-2">Ensure IndusLabs credentials are configured in .env</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-900">Agent Configuration</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpdateConfig(true)}
              className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition disabled:opacity-50"
            >
              Update Config
            </button>
            <button
              onClick={syncAgentConfig}
              disabled={configLoading}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${configLoading ? 'animate-spin' : ''}`} />
              {configLoading ? 'Syncing...' : 'Sync Config'}
            </button>
          </div>
        </div>

        {showUpdateConfig ? (
          <UpdateConfigFormInline 
            agent={agent} 
            currentConfig={agentConfig}
            onSuccess={() => {
              setShowUpdateConfig(false)
              fetchAgentConfig()
            }}
            onCancel={() => setShowUpdateConfig(false)}
          />
        ) : configLoading ? (
          <div className="text-center py-8">Loading configuration...</div>
        ) : agentConfig ? (
          <div className="space-y-6">
            {/* Agent Type and Status */}
            <div className="grid grid-cols-3 gap-4">
              <DetailItem
                label="Agent Type"
                value={agentConfig.agent_type || 'N/A'}
              />
              <DetailItem
                label="Status"
                value={agentConfig.status || 'N/A'}
                valueColor={agentConfig.status === 'published' ? 'text-green-600' : 'text-yellow-600'}
              />
              <DetailItem
                label="Version"
                value={String(agentConfig.version || '1')}
              />
            </div>

            {/* Starting Instructions */}
            {agentConfig.starting_instructions && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm font-medium text-blue-900 mb-2">Starting Instructions</p>
                <p className="text-sm text-blue-800 whitespace-pre-wrap">{agentConfig.starting_instructions}</p>
              </div>
            )}

            {/* System Prompt */}
            {agentConfig.system_prompt && (
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <p className="text-sm font-medium text-purple-900 mb-2">System Prompt</p>
                <div className="text-sm text-purple-800 whitespace-pre-wrap max-h-48 overflow-y-auto font-mono text-xs">
                  {agentConfig.system_prompt}
                </div>
              </div>
            )}

            {/* Call Input Fields */}
            {agentConfig.call_infields && agentConfig.call_infields.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Call Input Fields</h4>
                <div className="space-y-2">
                  {agentConfig.call_infields.map((field, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                      <div>
                        <p className="font-medium text-gray-900">{field.field_name}</p>
                        <p className="text-xs text-gray-600">{field.field_type}</p>
                      </div>
                      <span className={`px-3 py-1 text-xs rounded-full ${
                        field.is_visible 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {field.is_visible ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Guardrails */}
            {agentConfig.guardrail_ids && agentConfig.guardrail_ids.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="font-semibold text-gray-900 mb-3">Guardrails</h4>
                <div className="flex flex-wrap gap-2">
                  {agentConfig.guardrail_ids.map((guardrail, idx) => (
                    <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                      {guardrail}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* TTS Configuration */}
            {agentConfig.tts_config && (
              <div className="border-t pt-4 bg-orange-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Text-to-Speech Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(agentConfig.tts_config).map(([key, value]) => (
                    <DetailItem
                      key={key}
                      label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      value={String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* STT Configuration */}
            {agentConfig.stt_config && (
              <div className="border-t pt-4 bg-green-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Speech-to-Text Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(agentConfig.stt_config).map(([key, value]) => (
                    <DetailItem
                      key={key}
                      label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      value={String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* LLM Configuration */}
            {agentConfig.llm_config && (
              <div className="border-t pt-4 bg-cyan-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Language Model Configuration</h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(agentConfig.llm_config).map(([key, value]) => (
                    <DetailItem
                      key={key}
                      label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      value={String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* VAD Configuration */}
            {agentConfig.vad_config && (
              <div className="border-t pt-4 bg-yellow-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Voice Activity Detection Configuration</h4>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(agentConfig.vad_config).map(([key, value]) => (
                    <DetailItem
                      key={key}
                      label={key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                      value={String(value)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {agentConfig.notes && (
              <div className="border-t pt-4 bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Notes</p>
                <p className="text-sm text-gray-600">{agentConfig.notes}</p>
              </div>
            )}

            {/* Last Synced */}
            {agentConfig.synced_at && (
              <div className="border-t pt-4">
                <p className="text-xs text-gray-500">
                  Last synced: {new Date(agentConfig.synced_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No agent configuration data found</p>
            <p className="text-sm mt-2">Click &quot;Sync Config&quot; to fetch configuration from IndusLabs</p>
          </div>
        )}
      </div>
    </div>
  )
}

function UpdateConfigFormInline({
  agent,
  currentConfig,
  onSuccess,
  onCancel,
}: {
  agent: Agent
  currentConfig: AgentConfig | null
  onSuccess: () => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState<{
    system_prompt: string
    starting_instructions: string
    voice_id: string
    stt_language: string
    temperature: number
    max_tokens: number
    context_turns: number
    min_silence_duration: number
    min_speech_duration: number
    activation_threshold: number
  }>({
    system_prompt: currentConfig?.system_prompt || '',
    starting_instructions: currentConfig?.starting_instructions || '',
    voice_id: (currentConfig?.tts_config as Record<string, unknown> | undefined)?.voice_id as string || 'Indus-hi-maya',
    stt_language: (currentConfig?.stt_config as Record<string, unknown> | undefined)?.language as string || 'en',
    temperature: (currentConfig?.llm_config as Record<string, unknown> | undefined)?.temperature as number || 0.3,
    max_tokens: (currentConfig?.llm_config as Record<string, unknown> | undefined)?.max_tokens as number || 512,
    context_turns: (currentConfig?.llm_config as Record<string, unknown> | undefined)?.context_turns as number || 10,
    min_silence_duration: (currentConfig?.vad_config as Record<string, unknown> | undefined)?.min_silence_duration as number || 0.3,
    min_speech_duration: (currentConfig?.vad_config as Record<string, unknown> | undefined)?.min_speech_duration as number || 0.4,
    activation_threshold: (currentConfig?.vad_config as Record<string, unknown> | undefined)?.activation_threshold as number || 0.45,
  })
  const [inputVariables, setInputVariables] = useState<Array<{name: string; type: string; required: boolean}>>(
    currentConfig?.call_infields?.map((f: {field_name?: string; field_type?: string; is_visible?: boolean}) => ({
      name: f.field_name || '',
      type: f.field_type || 'TEXT',
      required: f.is_visible !== false,
    })) || []
  )
  const [newVar, setNewVar] = useState({name: '', type: 'TEXT'})
  const [submitting, setSubmitting] = useState(false)

  const addInputVariable = () => {
    if (newVar.name.trim()) {
      setInputVariables([...inputVariables, {name: newVar.name, type: newVar.type, required: true}])
      setNewVar({name: '', type: 'TEXT'})
    }
  }

  const removeInputVariable = (index: number) => {
    setInputVariables(inputVariables.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.system_prompt) {
      toast.error('System prompt is required')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch(`/api/ai-agents/update-agent-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          ...formData,
          call_infields: inputVariables.map(v => ({
            field_name: v.name,
            field_type: v.type,
            is_visible: v.required,
          })),
        }),
      })

      const responseData = await response.json()

      if (!response.ok) {
        const errorMsg = responseData.error || 'Failed to update config'
        throw new Error(errorMsg)
      }

      // Validate that database save was successful
      if (!responseData.config_saved) {
        throw new Error('Configuration was not saved to database')
      }

      toast.success('Agent config updated successfully. New version created.')
      onSuccess()
    } catch (error) {
      console.error('Error updating config:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update config')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-gray-50 p-6 rounded-lg border border-gray-200">
      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">System Prompt *</label>
        <textarea
          value={formData.system_prompt}
          onChange={(e) => setFormData({...formData, system_prompt: e.target.value})}
          rows={6}
          className="w-full p-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900 mb-2">Starting Instructions</label>
        <textarea
          value={formData.starting_instructions}
          onChange={(e) => setFormData({...formData, starting_instructions: e.target.value})}
          rows={3}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
        />
      </div>

      {/* Input Variables Section */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Input Variables</h3>
        
        {/* Add New Variable */}
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Variable name (e.g., customer_name)"
              value={newVar.name}
              onChange={(e) => setNewVar({...newVar, name: e.target.value})}
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addInputVariable())}
            />
            <select
              value={newVar.type}
              onChange={(e) => setNewVar({...newVar, type: e.target.value})}
              className="p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="TEXT">TEXT</option>
              <option value="NUMBER">NUMBER</option>
              <option value="EMAIL">EMAIL</option>
              <option value="PHONE">PHONE</option>
              <option value="DATE">DATE</option>
            </select>
            <button
              type="button"
              onClick={addInputVariable}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Variables List */}
        {inputVariables.length > 0 ? (
          <div className="space-y-2">
            {inputVariables.map((variable, index) => (
              <div key={index} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{variable.name}</p>
                  <p className="text-xs text-gray-600">{variable.type}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeInputVariable(index)}
                  className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600 text-center py-4">No input variables added yet</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Voice ID</label>
          <input
            type="text"
            value={formData.voice_id}
            onChange={(e) => setFormData({...formData, voice_id: e.target.value})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">STT Language</label>
          <input
            type="text"
            value={formData.stt_language}
            onChange={(e) => setFormData({...formData, stt_language: e.target.value})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Temperature</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="1"
            value={formData.temperature}
            onChange={(e) => setFormData({...formData, temperature: parseFloat(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Max Tokens</label>
          <input
            type="number"
            value={formData.max_tokens}
            onChange={(e) => setFormData({...formData, max_tokens: parseInt(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Context Turns</label>
          <input
            type="number"
            value={formData.context_turns}
            onChange={(e) => setFormData({...formData, context_turns: parseInt(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Min Silence Duration</label>
          <input
            type="number"
            step="0.1"
            value={formData.min_silence_duration}
            onChange={(e) => setFormData({...formData, min_silence_duration: parseFloat(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Min Speech Duration</label>
          <input
            type="number"
            step="0.1"
            value={formData.min_speech_duration}
            onChange={(e) => setFormData({...formData, min_speech_duration: parseFloat(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">Activation Threshold</label>
          <input
            type="number"
            step="0.01"
            value={formData.activation_threshold}
            onChange={(e) => setFormData({...formData, activation_threshold: parseFloat(e.target.value)})}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium"
        >
          {submitting ? 'Updating...' : 'Update Config'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function MetricSmall({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div>
      <p className="text-xs text-gray-600">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function DetailItem({
  label,
  value,
  monospace = false,
  small = false,
  valueColor = 'text-gray-900',
}: {
  label: string
  value: string
  monospace?: boolean
  small?: boolean
  valueColor?: string
}) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">{label}</p>
      <p
        className={`${monospace ? 'font-mono text-xs' : 'text-sm'} ${small ? 'text-sm' : ''} ${valueColor} break-all`}
      >
        {value}
      </p>
    </div>
  )
}

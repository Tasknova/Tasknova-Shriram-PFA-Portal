'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, CheckCircle } from 'lucide-react'

interface Agent {
  agent_id: string
  name: string
  total_calls?: number
}

interface PromptVersion {
  id?: string
  agent_id?: string
  version?: string | number
  prompt_text?: string
  is_active?: boolean
  status?: string
  performance_score?: number
  call_count?: number
  created_at?: string
  // IndusLabs fields
  system_prompt?: string
  starting_instructions?: string
  [key: string]: unknown
}

export default function PromptsTab() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentVersions, setAgentVersions] = useState<PromptVersion[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [showCreateAgent, setShowCreateAgent] = useState(false)

  useEffect(() => {
    fetchAgents()
  }, [])

  // Fetch versions when agent is selected
  useEffect(() => {
    if (selectedAgent) {
      fetchAgentVersions(selectedAgent.agent_id)
    }
  }, [selectedAgent])

  const fetchAgents = async () => {
    try {
      setLoading(true)
      const agentsRes = await fetch('/api/ai-agents/index')

      if (agentsRes.ok) {
        const result = await agentsRes.json()
        const agentsList = result.agents || []
        setAgents(agentsList)
        // Auto-select first agent
        if (agentsList.length > 0) {
          setSelectedAgent(agentsList[0])
        }
      }
    } catch (error) {
      console.error('Error fetching agents:', error)
      toast.error('Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  const fetchAgentVersions = async (agentId: string) => {
    try {
      setVersionsLoading(true)
      const response = await fetch(`/api/ai-agents/${agentId}/versions`)

      if (response.ok) {
        const result = await response.json()
        const versions = Array.isArray(result.versions) ? result.versions : []
        // Transform IndusLabs versions to match our interface
        const transformedVersions = versions.map((v: Record<string, unknown>, idx: number) => ({
          version: v.version || `v${idx + 1}`,
          system_prompt: v.system_prompt || '',
          starting_instructions: v.starting_instructions || '',
          agent_id: agentId,
          ...v,
        }))
        setAgentVersions(transformedVersions)
      } else {
        console.warn('Failed to fetch versions from IndusLabs API')
        setAgentVersions([])
      }
    } catch (error) {
      console.error('Error fetching agent versions:', error)
      toast.error('Failed to load agent versions')
      setAgentVersions([])
    } finally {
      setVersionsLoading(false)
    }
  }

  const currentVersion = agentVersions.length > 0 ? agentVersions[0] : null

  if (showCreateAgent) {
    return (
      <CreateAgentForm
        onSuccess={() => {
          setShowCreateAgent(false)
          fetchAgents()
        }}
        onCancel={() => setShowCreateAgent(false)}
      />
    )
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900">Agent Prompts</h2>
        <button
          onClick={() => setShowCreateAgent(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create Agent
        </button>
      </div>

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600 mb-4">No agents yet</p>
          <button
            onClick={() => setShowCreateAgent(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Create First Agent
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {agents.map((agent) => (
              <button
                key={agent.agent_id}
                onClick={() => setSelectedAgent(agent)}
                className={`p-4 rounded-lg border-2 transition text-left ${
                  selectedAgent?.agent_id === agent.agent_id
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
                <p className="text-xs text-gray-600 mt-1 truncate">{agent.agent_id}</p>
              </button>
            ))}
          </div>

          {/* Selected Agent Details */}
          {selectedAgent && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{selectedAgent.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">{selectedAgent.agent_id}</p>
                  </div>
                </div>

                {/* Current Version Badge */}
                {currentVersion && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-900">Current Version</span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 mb-3">
                      Version {currentVersion.version || '1'}
                    </p>

                    {currentVersion.system_prompt && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">System Prompt:</p>
                        <div className="text-xs text-gray-600 bg-white p-3 rounded border border-green-200 max-h-40 overflow-y-auto font-mono">
                          {currentVersion.system_prompt}
                        </div>
                      </div>
                    )}

                    {currentVersion.starting_instructions && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">Starting Instructions:</p>
                        <div className="text-xs text-gray-600 bg-white p-3 rounded border border-green-200 max-h-40 overflow-y-auto font-mono">
                          {currentVersion.starting_instructions}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* All Versions */}
                <h4 className="font-semibold text-gray-900 mb-3">All Versions</h4>
                {versionsLoading ? (
                  <p className="text-sm text-gray-600">Loading versions...</p>
                ) : agentVersions.length === 0 ? (
                  <p className="text-sm text-gray-600">No versions found</p>
                ) : (
                  <div className="space-y-3">
                    {agentVersions.map((version, idx) => (
                      <div
                        key={idx}
                        className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-gray-900">
                                Version {version.version || `v${idx + 1}`}
                              </span>
                              {(version.is_current || version.is_active || idx === 0) && (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              )}
                              {version.status && (
                                <span className={`px-2 py-1 rounded text-xs font-medium ${
                                  version.status === 'active'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-800'
                                }`}>
                                  {String(version.status)}
                                </span>
                              )}
                            </div>
                            {version.created_at && (
                              <p className="text-xs text-gray-600">
                                Created: {new Date(version.created_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* System Prompt Display */}
                        {version.system_prompt && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">System Prompt:</p>
                            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap">
                              {version.system_prompt}
                            </div>
                          </div>
                        )}

                        {/* Starting Instructions Display */}
                        {version.starting_instructions && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">Starting Instructions:</p>
                            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200 max-h-24 overflow-y-auto font-mono whitespace-pre-wrap">
                              {version.starting_instructions}
                            </div>
                          </div>
                        )}

                        {/* Prompt Text Display (fallback) */}
                        {version.prompt_text && !version.system_prompt && (
                          <div className="mb-3">
                            <p className="text-xs font-medium text-gray-700 mb-1">Prompt:</p>
                            <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border border-gray-200 max-h-24 overflow-y-auto font-mono">
                              {version.prompt_text.substring(0, 300)}
                              {version.prompt_text.length > 300 ? '...' : ''}
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        <div className="flex items-center gap-4 text-xs text-gray-600 mt-3 pt-3 border-t border-gray-200">
                          {version.call_count !== undefined && (
                            <span>Calls: {version.call_count}</span>
                          )}
                          {version.performance_score !== undefined && version.performance_score !== null && (
                            <span>Score: {version.performance_score.toFixed(1)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CreateAgentForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    agent_name: '',
    agent_description: '',
    agent_type: 'OUTBOUND',
    is_auto: true,
    system_prompt: '',
    starting_instructions: '',
    voice_id: 'Indus-hi-maya',
    stt_language: 'en',
    temperature: 0.3,
    max_tokens: 512,
    context_turns: 10,
    min_silence_duration: 0.3,
    min_speech_duration: 0.4,
    activation_threshold: 0.45,
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.agent_name || !formData.system_prompt || !formData.starting_instructions) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setSubmitting(true)
      const response = await fetch('/api/ai-agents/create-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create agent')
      }

      toast.success('Agent created successfully')
      onSuccess()
    } catch (error) {
      console.error('Error creating agent:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create agent')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={onCancel}
        className="text-purple-600 hover:text-purple-700 font-medium flex items-center gap-2"
      >
        ← Back
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-4xl">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Create New AI Agent</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Agent Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Agent Name *</label>
                <input
                  type="text"
                  value={formData.agent_name}
                  onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  placeholder="e.g., Support Bot"
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Agent Type</label>
                <select
                  value={formData.agent_type}
                  onChange={(e) => setFormData({ ...formData, agent_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  <option value="OUTBOUND">Outbound</option>
                  <option value="INBOUND">Inbound</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea
                value={formData.agent_description}
                onChange={(e) => setFormData({ ...formData, agent_description: e.target.value })}
                placeholder="Describe what this agent does..."
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Prompt Configuration</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">System Prompt *</label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                placeholder="Enter the system prompt that defines agent behavior..."
                required
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-mono"
              />
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Starting Instructions *</label>
              <textarea
                value={formData.starting_instructions}
                onChange={(e) => setFormData({ ...formData, starting_instructions: e.target.value })}
                placeholder="How should the agent introduce itself and start the conversation..."
                required
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>

          {/* LLM Configuration */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">LLM Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Temperature</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  value={formData.max_tokens}
                  onChange={(e) => setFormData({ ...formData, max_tokens: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Context Turns</label>
                <input
                  type="number"
                  min="1"
                  value={formData.context_turns}
                  onChange={(e) => setFormData({ ...formData, context_turns: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Voice & Audio */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Voice & Audio</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Voice ID</label>
                <input
                  type="text"
                  value={formData.voice_id}
                  onChange={(e) => setFormData({ ...formData, voice_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">STT Language</label>
                <input
                  type="text"
                  value={formData.stt_language}
                  onChange={(e) => setFormData({ ...formData, stt_language: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* VAD Configuration */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-4">Voice Activity Detection</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Silence Duration</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.min_silence_duration}
                  onChange={(e) => setFormData({ ...formData, min_silence_duration: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Min Speech Duration</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.min_speech_duration}
                  onChange={(e) => setFormData({ ...formData, min_speech_duration: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Activation Threshold</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formData.activation_threshold}
                  onChange={(e) => setFormData({ ...formData, activation_threshold: parseFloat(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition font-medium"
            >
              {submitting ? 'Creating...' : 'Create Agent'}
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
      </div>
    </div>
  )
}

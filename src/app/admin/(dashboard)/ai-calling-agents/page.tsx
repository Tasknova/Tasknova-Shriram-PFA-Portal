'use client'
import { useState } from 'react'
import AgentsTab from './tabs/AgentsTab'
import CallsTab from './tabs/CallsTab'
import EvaluationsTab from './tabs/EvaluationsTab'
import PromptsTab from './tabs/PromptsTab'
import SettingsTab from './tabs/SettingsTab'
import LogsTab from './tabs/LogsTab'
import CampaignsTab from './tabs/CampaignsTab'

const TABS = [
  { id: 'calls', name: 'Calls', component: CallsTab },
  { id: 'campaigns', name: 'Campaigns', component: CampaignsTab },
  { id: 'agents', name: 'Agents', component: AgentsTab },
  { id: 'evaluations', name: 'Evaluations', component: EvaluationsTab },
  { id: 'prompts', name: 'Prompts', component: PromptsTab },
  { id: 'logs', name: 'Logs', component: LogsTab },
  { id: 'settings', name: 'Settings', component: SettingsTab },
]

export default function AICallingAgentsPage() {
  const [activeTab, setActiveTab] = useState('calls')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-gray-900">AI Calling Agents</h1>
        <p className="text-gray-600">
          Manage and optimize your AI calling agents using IndusLabs APIs
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex overflow-x-auto border-b border-gray-200">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 font-medium text-sm whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-purple-500 text-purple-600 bg-purple-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {TABS.map((tab) => {
            const Component = tab.component
            const isTabActive = activeTab === tab.id
            const syncProps =
              tab.id === 'calls' || tab.id === 'evaluations'
                ? { isActive: isTabActive }
                : {}

            return (
              <div key={tab.id} className={isTabActive ? '' : 'hidden'}>
                <Component {...syncProps} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

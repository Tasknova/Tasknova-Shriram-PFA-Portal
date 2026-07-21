'use client'
import { useState } from 'react'
import DashboardTab from './tabs/DashboardTab'
import CallsTab from './tabs/CallsTab'
import EvaluationsTab from './tabs/EvaluationsTab'
import SettingsTab from './tabs/SettingsTab'

const TABS = [
  { id: 'dashboard', name: 'Dashboard', component: DashboardTab },
  { id: 'calls', name: 'Calls', component: CallsTab },
  { id: 'evaluations', name: 'Evaluations', component: EvaluationsTab },
  { id: 'settings', name: 'Settings', component: SettingsTab },
]

export default function C2CCallingPage() {
  const [activeTab, setActiveTab] = useState('dashboard')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-gray-900">C2C Calling</h1>
        <p className="text-gray-600">
          Initiate and monitor Click2Call sessions via IndusLabs
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
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
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

'use client'

import { useState } from 'react'
import AICallingDashboard from '../ai-calling-agents/tabs/DashboardTab'
import C2CCallingDashboard from '../c2c-calling/tabs/DashboardTab'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'ai' | 'c2c'>('ai')

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="bg-gradient-to-r from-primary-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
        <h1 className="text-4xl font-bold mb-2">Platform Dashboard</h1>
        <p className="text-primary-100 text-lg">Welcome back! Here's your calling overview</p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 py-4 px-6 font-medium text-sm text-center transition-colors border-b-2 ${
              activeTab === 'ai'
                ? 'border-purple-500 text-purple-600 bg-purple-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            AI Calling Dashboard
          </button>
          <button
            onClick={() => setActiveTab('c2c')}
            className={`flex-1 py-4 px-6 font-medium text-sm text-center transition-colors border-b-2 ${
              activeTab === 'c2c'
                ? 'border-blue-500 text-blue-600 bg-blue-50'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            C2C Calling Dashboard
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'ai' ? (
          <div className="animate-fade-in">
            <AICallingDashboard />
          </div>
        ) : (
          <div className="animate-fade-in">
            <C2CCallingDashboard />
          </div>
        )}
      </div>
    </div>
  )
}


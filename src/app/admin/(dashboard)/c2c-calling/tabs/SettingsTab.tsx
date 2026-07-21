'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Save, Eye, EyeOff } from 'lucide-react'

interface Setting {
  setting_key: string
  setting_value: string
}

export default function SettingsTab() {
  const [settings, setSettings] = useState<{ [key: string]: string }>({
    induslabs_api_key: '',
    callback_url: '',
    min_call_duration: '10',
    evaluation_threshold: '50',
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/ai-agents/settings')
      if (!response.ok) throw new Error('Failed to fetch settings')
      const result = await response.json()

      const settingsMap: { [key: string]: string } = {
        induslabs_api_key: '',
        callback_url: 'https://yourdomain.com/webhooks/ai-agents/indus',
        min_call_duration: '10',
        evaluation_threshold: '50',
      }

      result.settings?.forEach((setting: Setting) => {
        settingsMap[setting.setting_key] = setting.setting_value
      })

      setSettings(settingsMap)
    } catch (error) {
      console.error('Error fetching settings:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (key: string) => {
    try {
      setSubmitting(true)
      const response = await fetch('/api/ai-agents/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setting_key: key,
          setting_value: settings[key],
        }),
      })

      if (!response.ok) throw new Error('Failed to save setting')
      toast.success(`${key} saved successfully`)
    } catch (error) {
      console.error('Error saving setting:', error)
      toast.error('Failed to save setting')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* API Key */}
      <SettingSection title="IndusLabs API Configuration">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.induslabs_api_key}
                  onChange={(e) =>
                    setSettings({ ...settings, induslabs_api_key: e.target.value })
                  }
                  placeholder="Enter your IndusLabs API Key"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button
                onClick={() => handleSave('induslabs_api_key')}
                disabled={submitting}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Shared with AI Calling Agents. Get your API key from{' '}
              <a
                href="https://developer.induslabs.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 hover:underline"
              >
                IndusLabs Developer Console
              </a>
            </p>
          </div>
        </div>
      </SettingSection>

      {/* Callback URL */}
      <SettingSection title="Webhook Configuration">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Callback URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={settings.callback_url}
              onChange={(e) => setSettings({ ...settings, callback_url: e.target.value })}
              placeholder="https://yourdomain.com/webhooks/ai-agents/indus"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <button
              onClick={() => handleSave('callback_url')}
              disabled={submitting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2 transition"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            This URL will receive webhook events from IndusLabs for both AI and C2C calls.
          </p>
        </div>
      </SettingSection>
    </div>
  )
}

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

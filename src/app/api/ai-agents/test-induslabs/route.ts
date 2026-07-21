import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  try {
    const client = createServerClient()

    // Get API key from settings
    const { data: settingsData } = await client
      .from('ai_settings')
      .select('setting_value')
      .eq('setting_key', 'induslabs_api_key')
      .single()

    if (!settingsData || !settingsData.setting_value) {
      return NextResponse.json(
        { error: 'IndusLabs API key not configured' },
        { status: 400 }
      )
    }

    const apiKey = settingsData.setting_value

    const results: { [key: string]: unknown } = {}

    // Test the correct IndusLabs endpoint
    const endpoint = 'https://developer.induslabs.io/api/agents'

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
        }),
      })

      const contentType = response.headers.get('content-type')
      let data

      try {
        data = contentType?.includes('application/json') ? await response.json() : await response.text()
      } catch (e) {
        data = `<Could not parse response: ${String(e)}>`
      }

      results.endpoint_test = {
        url: endpoint,
        method: 'POST',
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': 'application/json',
        },
        body_sent: { api_key: apiKey.substring(0, 10) + '...' },
        response_data: typeof data === 'string' ? data.substring(0, 1000) : data,
      }
    } catch (error) {
      results.endpoint_test = {
        url: endpoint,
        method: 'POST',
        status: 'error',
        error: String(error),
      }
    }

    return NextResponse.json({
      api_key_configured: !!apiKey,
      api_key_first_10_chars: apiKey?.substring(0, 10) + '...',
      test_results: results,
    })
  } catch (error) {
    console.error('Error testing IndusLabs API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

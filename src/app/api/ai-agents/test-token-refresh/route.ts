import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

export async function GET() {
  try {
    console.log('=== Testing Token Refresh ===')
    
    // Get first token
    console.log('Getting first token...')
    const token1 = await getIndusLabsAccessToken(true)
    console.log('Token 1 obtained:', !!token1)
    const apiTestResult: Record<string, unknown> = {
      token1_obtained: !!token1,
      api_call_result: null,
    }

    if (token1) {
      console.log('Token 1 first 50 chars:', token1.substring(0, 50))
      
      try {
        console.log('Testing token with API call...')
        const response = await fetch('https://developer.induslabs.io/api/agents/AGT_3FD52A75/configs', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token1}`,
          },
        })
        console.log('API response status:', response.status)
        
        apiTestResult.api_response_status = response.status
        apiTestResult.api_response_ok = response.ok

        if (!response.ok) {
          const errorText = await response.text()
          console.log('Error response:', errorText.substring(0, 200))
          apiTestResult.api_error = errorText.substring(0, 200)
        } else {
          const data = await response.json()
          const count = Array.isArray(data) ? data.length : 0
          console.log('Success! Returned', count, 'configs')
          apiTestResult.api_success = true
          apiTestResult.api_config_count = count
        }
      } catch (apiError) {
        console.error('API call error:', apiError)
        apiTestResult.api_call_error = apiError instanceof Error ? apiError.message : String(apiError)
      }
    }

    return NextResponse.json(apiTestResult, { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

export async function GET() {
  try {
    console.log('=== Testing Agent Config Sync ===')

    // Step 1: Get token
    console.log('Step 1: Getting IndusLabs access token...')
    const accessToken = await getIndusLabsAccessToken()
    console.log(`Token obtained: ${!!accessToken}, length: ${accessToken?.length || 0}`)

    if (!accessToken) {
      return NextResponse.json({
        error: 'Failed to get access token',
        step: 1,
      })
    }

    // Step 2: Get API key from env
    const apiKey = process.env.INDUSLABS_API_KEY
    console.log(`API Key available: ${!!apiKey}`)

    if (!apiKey) {
      return NextResponse.json({
        error: 'API key not configured',
        step: 2,
      })
    }

    // Step 3: Test fetch with exact Postman format
    const testAgentId = 'AGT_0FBEDCFF'
    console.log(`Step 3: Calling IndusLabs API for agent ${testAgentId}...`)

    const response = await fetch(
      `https://developer.induslabs.io/api/agents/${testAgentId}/configs?api_key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    console.log(`Response status: ${response.status} ${response.statusText}`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error response:', errorText)
      return NextResponse.json({
        error: `API call failed: ${response.status} ${response.statusText}`,
        details: errorText,
        step: 3,
      })
    }

    const data = await response.json()
    console.log('Success! Config data received:', JSON.stringify(data).substring(0, 200))

    return NextResponse.json({
      success: true,
      token_obtained: true,
      api_key_available: true,
      config_data: data,
    })
  } catch (error) {
    console.error('Test error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

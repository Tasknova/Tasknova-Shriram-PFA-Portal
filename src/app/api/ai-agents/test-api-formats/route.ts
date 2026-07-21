import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getIndusLabsAccessToken } from '@/lib/aiAgentsUtils'

/**
 * Test different API formats to find what works
 */
export async function GET() {
  try {
    console.log('=== Testing Different API Formats ===')

    const accessToken = await getIndusLabsAccessToken()
    if (!accessToken) {
      return NextResponse.json({
        error: 'Failed to get access token',
      })
    }

    const testAgentId = 'AGT_0FBEDCFF'
    const apiKey = process.env.INDUSLABS_API_KEY

    console.log(`Testing agent: ${testAgentId}`)

    // Format 1: Bearer token only (no api_key)
    console.log('\n--- Format 1: Bearer token only ---')
    const test1 = await fetch(
      `https://developer.induslabs.io/api/agents/${testAgentId}/configs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    console.log(`Status: ${test1.status}`)
    const test1Text = await test1.text()
    console.log(`Response: ${test1Text.substring(0, 200)}`)

    // Format 2: Bearer token + api_key in header
    console.log('\n--- Format 2: Bearer + X-API-Key header ---')
    const test2 = await fetch(
      `https://developer.induslabs.io/api/agents/${testAgentId}/configs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-API-Key': apiKey || '',
        },
      }
    )
    console.log(`Status: ${test2.status}`)
    const test2Text = await test2.text()
    console.log(`Response: ${test2Text.substring(0, 200)}`)

    // Format 3: Bearer + api_key as query param
    console.log('\n--- Format 3: Bearer + query param ---')
    const test3 = await fetch(
      `https://developer.induslabs.io/api/agents/${testAgentId}/configs?api_key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )
    console.log(`Status: ${test3.status}`)
    const test3Text = await test3.text()
    console.log(`Response: ${test3Text.substring(0, 200)}`)

    // Format 4: Try without Bearer, only api_key
    console.log('\n--- Format 4: API key only ---')
    const test4 = await fetch(
      `https://developer.induslabs.io/api/agents/${testAgentId}/configs?api_key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    console.log(`Status: ${test4.status}`)
    const test4Text = await test4.text()
    console.log(`Response: ${test4Text.substring(0, 200)}`)

    return NextResponse.json({
      format1: { status: test1.status, message: test1Text.substring(0, 300) },
      format2: { status: test2.status, message: test2Text.substring(0, 300) },
      format3: { status: test3.status, message: test3Text.substring(0, 300) },
      format4: { status: test4.status, message: test4Text.substring(0, 300) },
    })
  } catch (error) {
    console.error('Test error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

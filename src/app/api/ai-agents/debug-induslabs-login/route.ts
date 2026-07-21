import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    console.log('=== IndusLabs Login Debug ===')

    const email = process.env.INDUSLABS_EMAIL
    const password = process.env.INDUSLABS_PASSWORD
    const apiKey = process.env.INDUSLABS_API_KEY

    console.log('Credentials check:', {
      hasEmail: !!email,
      hasPassword: !!password,
      hasApiKey: !!apiKey,
      emailValue: email,
    })

    if (!email || !password) {
      return NextResponse.json({
        error: 'Missing credentials in .env.local',
      })
    }

    // Call login endpoint
    console.log('Calling login endpoint...')
    const loginResponse = await fetch('https://developer.induslabs.io/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    })

    console.log('Login response status:', loginResponse.status)

    const loginText = await loginResponse.text()
    console.log('Login response body (raw):', loginText)

    let loginData
    try {
      loginData = JSON.parse(loginText)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      return NextResponse.json({
        error: 'Failed to parse login response',
        status: loginResponse.status,
        body: loginText,
      })
    }

    // Extract token
    const token =
      loginData.access_token ||
      loginData.token ||
      loginData.data?.access_token ||
      loginData.data?.token ||
      null

    console.log('Extracted token:', {
      hasToken: !!token,
      tokenLength: token?.length || 0,
      tokenPreview: token?.substring(0, 20) + '...',
    })

    if (!token) {
      return NextResponse.json({
        error: 'No token in login response',
        fullResponse: loginData,
      })
    }

    // Try using the token to call agents endpoint
    console.log('Testing token with agents config endpoint...')
    const configResponse = await fetch(
      `https://developer.induslabs.io/api/agents/AGT_0FBEDCFF/configs?api_key=${apiKey}`,
      {
        method: 'GET' as const,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )

    console.log('Config response status:', configResponse.status)
    const configText = await configResponse.text()
    console.log('Config response (first 500 chars):', configText.substring(0, 500))

    return NextResponse.json({
      success: loginResponse.ok && configResponse.ok,
      login: {
        status: loginResponse.status,
        data: loginData,
        tokenLength: token?.length,
      },
      config: {
        status: configResponse.status,
        data: configText.substring(0, 500),
      },
    })
  } catch (error) {
    console.error('Debug error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const email = process.env.INDUSLABS_EMAIL
    const password = process.env.INDUSLABS_PASSWORD

    if (!email || !password) {
      return NextResponse.json(
        {
          status: 'error',
          message: 'IndusLabs credentials not configured',
          hasEmail: !!email,
          hasPassword: !!password,
        },
        { status: 400 }
      )
    }

    console.log('Testing IndusLabs login with email:', email)

    const response = await fetch('https://developer.induslabs.io/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    })

    const responseText = await response.text()
    let responseData: Record<string, unknown> = {}

    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw_response: responseText }
    }

    return NextResponse.json({
      status: response.ok ? 'success' : 'failed',
      statusCode: response.status,
      headers: {
        contentType: response.headers.get('content-type'),
      },
      response: responseData,
      message: response.ok
        ? 'Login successful'
        : `Login failed with status ${response.status}`,
    })
  } catch (error) {
    console.error('Debug endpoint error:', error)
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

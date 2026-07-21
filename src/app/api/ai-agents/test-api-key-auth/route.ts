import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const apiKey = process.env.INDUSLABS_API_KEY
    
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 400 })
    }

    console.log('Testing API key authentication...')
    console.log('API Key first 20 chars:', apiKey.substring(0, 20))

    // Try different auth methods
    const testMethods: Array<{ name: string; headers: Record<string, string> }> = [
      {
        name: 'Bearer Token (API Key)',
        headers: { Authorization: `Bearer ${apiKey}` },
      },
      {
        name: 'X-API-Key Header',
        headers: { 'X-API-Key': apiKey },
      },
      {
        name: 'API-Key Header',
        headers: { 'API-Key': apiKey },
      },
    ]

    const results: Record<string, unknown>[] = []

    for (const method of testMethods) {
      try {
        console.log(`\nTesting: ${method.name}`)
        const response = await fetch('https://developer.induslabs.io/api/agents/AGT_3FD52A75/configs', {
          method: 'GET',
          headers: method.headers,
        })

        console.log(`  Status: ${response.status}`)

        let data: unknown = null
        if (response.ok) {
          data = await response.json()
        } else {
          data = await response.text()
        }

        results.push({
          method: method.name,
          status: response.status,
          success: response.ok,
          responsePreview: String(data).substring(0, 100),
        })
      } catch (error) {
        results.push({
          method: method.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return NextResponse.json({ results }, { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

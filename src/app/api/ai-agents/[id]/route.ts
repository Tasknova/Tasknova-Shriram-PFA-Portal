import { NextRequest, NextResponse } from 'next/server'
import { getIndusLabsAgentDetails } from '@/lib/aiAgentsUtils'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    // Fetch agent details from IndusLabs API
    const agentDetails = await getIndusLabsAgentDetails(id)

    if (!agentDetails) {
      return NextResponse.json(
        { error: 'Failed to fetch agent details' },
        { status: 500 }
      )
    }

    return NextResponse.json(agentDetails)
  } catch (error) {
    console.error('Error fetching agent details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch agent details' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/aiAgentsUtils'

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const agentId = req.nextUrl.searchParams.get('agent_id')

    let query = client
      .from('prompt_versions')
      .select('*')
      .order('created_at', { ascending: false })

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch prompt versions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      prompt_versions: data,
    })
  } catch (error) {
    console.error('Error fetching prompt versions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = createServerClient()
    const { agent_id, version, prompt_text, is_active } = await req.json()

    if (!agent_id || !version || !prompt_text) {
      return NextResponse.json(
        { error: 'Missing required fields: agent_id, version, prompt_text' },
        { status: 400 }
      )
    }

    // If marking as active, deactivate others
    if (is_active) {
      await client
        .from('prompt_versions')
        .update({ is_active: false })
        .eq('agent_id', agent_id)
    }

    // Insert new prompt version
    const { data, error } = await client
      .from('prompt_versions')
      .insert({
        agent_id,
        version,
        prompt_text,
        is_active: is_active || false,
        performance_score: 0,
        call_count: 0,
      })
      .select()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to create prompt version' },
        { status: 500 }
      )
    }

    // Log audit event
    await logAuditEvent('prompt_version.created', {
      agent_id,
      version,
      is_active: is_active || false,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      prompt_version: data[0],
      message: 'Prompt version created successfully',
    })
  } catch (error) {
    console.error('Error creating prompt version:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

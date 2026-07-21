import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createServerClient } from '@/lib/supabase'
import { logAuditEvent } from '@/lib/aiAgentsUtils'

interface Setting {
  setting_key: string
  setting_value: string
}

export async function GET(req: NextRequest) {
  try {
    const client = createServerClient()
    const settingKey = req.nextUrl.searchParams.get('key')

    if (settingKey) {
      // Get specific setting
      const { data, error } = await client
        .from('ai_settings')
        .select('setting_key, setting_value')
        .eq('setting_key', settingKey)
        .single()

      if (error && error.code !== 'PGRST116') {
        return NextResponse.json(
          { error: 'Failed to fetch setting' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        setting: data,
      })
    } else {
      // Get all settings (excluding sensitive data like API keys in response)
      const { data, error } = await client
        .from('ai_settings')
        .select('setting_key, setting_value')

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch settings' },
          { status: 500 }
        )
      }

      // Mask API keys in response
      const maskedSettings = (data as Setting[]).map((setting: Setting) => ({
        ...setting,
        setting_value:
          setting.setting_key.includes('api_key') && setting.setting_value
            ? `${setting.setting_value.substring(0, 4)}...${setting.setting_value.substring(setting.setting_value.length - 4)}`
            : setting.setting_value,
      }))

      return NextResponse.json({
        settings: maskedSettings,
      })
    }
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const client = createServerClient()
    const { setting_key, setting_value } = await req.json()

    if (!setting_key || setting_value === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: setting_key, setting_value' },
        { status: 400 }
      )
    }

    // Upsert setting
    const { data, error } = await client
      .from('ai_settings')
      .upsert(
        {
          setting_key,
          setting_value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      )
      .select()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to save setting' },
        { status: 500 }
      )
    }

    // Log audit event
    await logAuditEvent('setting.updated', {
      setting_key,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      setting: data[0],
      message: 'Setting saved successfully',
    })
  } catch (error) {
    console.error('Error saving setting:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

import { createServerClient } from '@/lib/supabase'

// Token cache with TTL
let cachedToken: string | null = null
let tokenExpiresAt: number = 0

export interface TranscriptMessage {
  role: string
  content: string
}

export interface EvaluationInput {
  transcript_history?: TranscriptMessage[]
  summary?: string
  outcome?: string
  duration?: number
}

export interface EvaluationOutput {
  score: number
  issues: string[]
  suggestions: string[]
}

/**
 * Evaluate a call based on transcript and call data
 * Scores range from 0-100
 */
export async function evaluateCall(input: EvaluationInput): Promise<EvaluationOutput> {
  const issues: string[] = []
  const suggestions: string[] = []
  let score = 100

  // Duration validation
  if (!input.duration || input.duration < 10) {
    issues.push('Call duration too short (< 10 seconds)')
    score -= 30
  }

  // Transcript validation
  if (!input.transcript_history || input.transcript_history.length === 0) {
    issues.push('No transcript data available')
    score -= 25
  }

  // Sentiment/Outcome analysis
  if (!input.outcome) {
    issues.push('Call outcome not recorded')
    score -= 20
  } else {
    // Check for successful outcomes
    const successKeywords = ['successful', 'completed', 'achieved', 'closed', 'converted']
    const failureKeywords = ['failed', 'dropped', 'rejected', 'cancelled', 'abandoned']
    
    const outcomeLower = input.outcome.toLowerCase()
    const hasSuccess = successKeywords.some(kw => outcomeLower.includes(kw))
    const hasFailure = failureKeywords.some(kw => outcomeLower.includes(kw))

    if (hasFailure) {
      issues.push('Negative call outcome detected')
      score -= 25
    } else if (!hasSuccess) {
      issues.push('Call outcome unclear')
      score -= 10
    }
  }

  // Summary analysis
  if (!input.summary || input.summary.length < 10) {
    issues.push('Summary too brief or missing')
    score -= 15
  }

  // Generate suggestions
  if (score < 50) {
    suggestions.push('Review agent communication patterns')
    suggestions.push('Consider additional training for call handling')
  }

  if (score < 70) {
    suggestions.push('Analyze call outcomes for improvement opportunities')
    suggestions.push('Compare with high-performing agents')
  }

  if (score >= 80) {
    suggestions.push('Strong performance - maintain current approach')
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    issues,
    suggestions,
  }
}

/**
 * Classify a call based on duration and transcript availability
 */
export function classifyCall(duration: number, hasTranscript: boolean): 'valid' | 'invalid' | 'failed' {
  if (duration > 0 && duration < 10) {
    return 'invalid'
  }
  if (!hasTranscript) {
    return 'failed'
  }
  return 'valid'
}

/**
 * Log audit event
 */
export async function logAuditEvent(
  eventType: string,
  payload: Record<string, unknown>
) {
  const client = createServerClient()
  
  try {
    await client
      .from('ai_audit_logs')
      .insert({
        event_type: eventType,
        payload,
      })
  } catch (error) {
    console.error('Failed to log audit event:', error)
  }
}

/**
 * Get IndusLabs API key from settings
 */
export async function getIndusLabsApiKey(): Promise<string | null> {
  const client = createServerClient()
  
  try {
    const { data } = await client
      .from('ai_settings')
      .select('setting_value')
      .eq('setting_key', 'induslabs_api_key')
      .single()
    
    return data?.setting_value || null
  } catch (error) {
    console.error('Failed to get IndusLabs API key:', error)
    return null
  }
}

/**
 * Get callback URL from settings
 */
export async function getCallbackUrl(): Promise<string> {
  return resolveAiCallingCallbackUrl()
}

/** Normalize webhook URL — ensure /api prefix before /webhooks/ */
export function normalizeCallbackUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    return 'https://admin.tasknova.io/api/webhooks/ai-agents/indus'
  }
  if (trimmed.includes('/api/webhooks/')) {
    return trimmed
  }
  return trimmed.replace(/^(https?:\/\/[^/]+)\/webhooks\//, '$1/api/webhooks/')
}

/** Resolve the IndusLabs webhook callback URL from ai_settings. */
export async function resolveAiCallingCallbackUrl(): Promise<string> {
  const client = createServerClient()
  const fallback = 'https://admin.tasknova.io/api/webhooks/ai-agents/indus'

  try {
    const { data: settings } = await client
      .from('ai_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['webhook_callback_url', 'callback_url'])

    const webhookUrl = settings?.find((s) => s.setting_key === 'webhook_callback_url')?.setting_value
    const callbackUrl = settings?.find((s) => s.setting_key === 'callback_url')?.setting_value

    // Prefer webhook_callback_url; normalize legacy callback_url missing /api
    const raw = webhookUrl || callbackUrl || fallback
    return normalizeCallbackUrl(raw)
  } catch {
    return fallback
  }
}

/** Parse IndusLabs click2call error body into a user-friendly message. */
export function parseIndusLabsCallError(status: number, errorBody: string): string {
  let detail = errorBody
  try {
    const parsed = JSON.parse(errorBody) as { detail?: string; message?: string; error?: string }
    detail = parsed.detail || parsed.message || parsed.error || errorBody
  } catch {
    // keep raw body
  }

  if (status === 429 || /channel limit/i.test(detail)) {
    return `${detail} Wait a few minutes before retrying, or contact IndusLabs to increase your concurrent call channel limit.`
  }

  return detail
}

/**
 * Get minimum call duration setting
 */
export async function getMinCallDuration(): Promise<number> {
  const client = createServerClient()
  
  try {
    const { data } = await client
      .from('ai_settings')
      .select('setting_value')
      .eq('setting_key', 'min_call_duration')
      .single()
    
    return parseInt(data?.setting_value || '10', 10)
  } catch {
    return 10
  }
}

/**
 * Get active prompt version for agent
 */
export async function getActivePromptVersion(agentId: string) {
  const client = createServerClient()
  
  try {
    const { data } = await client
      .from('prompt_versions')
      .select('*')
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    return data
  } catch (error) {
    console.error('Failed to get active prompt version:', error)
    return null
  }
}

/**
 * Get IndusLabs access token via login with email/password
 * The access token is a JWT from the login endpoint, NOT the API key
 * @param forceRefresh - If true, get a fresh token instead of using cache
 */
export async function getIndusLabsAccessToken(forceRefresh: boolean = false): Promise<string | null> {
  try {
    // Check if we have a cached token that's still valid (unless forceRefresh)
    if (!forceRefresh && cachedToken && tokenExpiresAt > Date.now() + 30000) { // Keep 30s buffer
      const remainingMs = tokenExpiresAt - Date.now()
      console.log('Using cached IndusLabs token (expires in', Math.round(remainingMs / 1000), 'seconds)')
      return cachedToken
    }

    const email = process.env.INDUSLABS_EMAIL
    const password = process.env.INDUSLABS_PASSWORD

    if (!email || !password) {
      console.error('IndusLabs credentials not configured in .env', {
        hasEmail: !!email,
        hasPassword: !!password,
      })
      return null
    }

    console.log('Attempting IndusLabs login with email:', email)

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

    console.log('IndusLabs login response status:', response.status)

    if (!response.ok) {
      const errorBody = await response.text()
      console.error(`IndusLabs login failed: ${response.status}`, errorBody)
      return null
    }

    const data = (await response.json()) as {
      access_token?: string
      token?: string
      data?: { access_token?: string; token?: string }
      expires_in?: number
    }
    
    // Handle nested response structure from IndusLabs
    const token =
      data.access_token ||
      data.token ||
      data.data?.access_token ||
      data.data?.token ||
      null
    
    console.log('IndusLabs login successful, token received:', !!token)
    
    if (!token) {
      console.error('No token in IndusLabs response:', data)
      return null
    }
    
    // Cache token with TTL using actual expires_in from response, or shorter default (5 min instead of 1 hour)
    // IndusLabs tokens appear to have short TTL, so we default to 5 minutes with safety buffer
    const expiresInSeconds = data.expires_in || 300 // 5 minutes default
    const ttlMs = Math.min(expiresInSeconds * 1000, 5 * 60 * 1000) // Cap at 5 minutes
    cachedToken = token
    tokenExpiresAt = Date.now() + ttlMs
    console.log(`Token cached for ${ttlMs / 1000} seconds (expires_in from response: ${expiresInSeconds}s)`)
    
    return token
  } catch (error) {
    console.error('Failed to get IndusLabs access token:', error)
    return null
  }
}

/**
 * Get agent details from IndusLabs API
 */
export async function getIndusLabsAgentDetails(agentId: string): Promise<Record<string, unknown> | null> {
  try {
    const accessToken = await getIndusLabsAccessToken()

    if (!accessToken) {
      console.error('Failed to obtain access token')
      return null
    }

    const response = await fetch(
      `https://developer.induslabs.io/api/agents/${agentId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch agent details: ${response.status}`)
      return null
    }

    return (await response.json()) as Record<string, unknown>
  } catch (error) {
    console.error('Failed to get agent details:', error)
    return null
  }
}

/**
 * Get agent versions/configs from IndusLabs API
 */
export async function getIndusLabsAgentVersions(agentId: string): Promise<Record<string, unknown>[] | null> {
  try {
    const accessToken = await getIndusLabsAccessToken()

    if (!accessToken) {
      console.error('Failed to obtain access token')
      return null
    }

    const response = await fetch(
      `https://developer.induslabs.io/api/agents/${agentId}/configs`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!response.ok) {
      console.error(`Failed to fetch agent versions: ${response.status}`)
      return null
    }

    const data = await response.json()
    // Return array of versions/configs
    if (Array.isArray(data)) {
      return data
    }
    if (data.configs && Array.isArray(data.configs)) {
      return data.configs
    }
    if (data.data && Array.isArray(data.data)) {
      return data.data
    }
    
    return [data]
  } catch (error) {
    console.error('Failed to get agent versions:', error)
    return null
  }
}

/** The two authorized DIDs for Shriram/Sriram PFA agents. */
export const SHRIRAM_PFA_DIDS = [
  { label: 'DID 1 — 919484956711', value: '919484956711' },
  { label: 'DID 2 — 919484956712', value: '919484956712' },
]

/** @deprecated — use SHRIRAM_PFA_DIDS instead */
export const SHRIRAM_PFA_DEFAULT_DID = SHRIRAM_PFA_DIDS[0].value

/**
 * Detect Shriram/Sriram PFA agents regardless of spelling, spacing, or suffix (e.g. "Agent").
 */
export function isShriramPFAAgent(agentName: string | null | undefined): boolean {
  if (!agentName) return false
  const normalized = agentName.toLowerCase().replace(/[\s_-]+/g, '')
  return (normalized.includes('shriram') || normalized.includes('sriram')) && normalized.includes('pfa')
}

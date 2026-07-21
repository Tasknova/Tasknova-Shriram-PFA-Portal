import { createServerClient } from '@/lib/supabase'

/**
 * API Call Log Entry
 */
export interface APILogEntry {
  endpoint: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  agent_id?: string
  request_body?: unknown
  status_code: number
  response_body?: unknown
  success: boolean
  error_message?: string
  duration_ms: number
}

/**
 * Log an API call to the database
 * This function should be called from API endpoints to maintain an audit trail
 */
export async function logAPICall(entry: APILogEntry): Promise<void> {
  try {
    const client = await createServerClient()
    
    const { error } = await client
      .from('api_logs')
      .insert([
        {
          endpoint: entry.endpoint,
          method: entry.method,
          agent_id: entry.agent_id,
          request_body: entry.request_body ? JSON.stringify(entry.request_body) : null,
          status_code: entry.status_code,
          response_body: entry.response_body ? JSON.stringify(entry.response_body) : null,
          success: entry.success,
          error_message: entry.error_message,
          duration_ms: entry.duration_ms,
          created_at: new Date().toISOString(),
        },
      ])
    
    if (error) {
      console.error('Failed to log API call:', error)
      // Don't throw - logging failure should not break the main request
    }
  } catch (error) {
    console.error('Error logging API call:', error)
    // Silently fail - logging should not impact the main request
  }
}

/**
 * Create a detailed error report with context for troubleshooting
 */
export function createErrorReport(
  context: string,
  error: unknown,
  details?: Record<string, unknown>
): { message: string; details: Record<string, unknown> } {
  const errorMessage = error instanceof Error ? error.message : String(error)

  return {
    message: `${context}: ${errorMessage}`,
    details: {
      context,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      ...details,
    },
  }
}

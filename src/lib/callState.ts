export interface CallRecord {
  call_id: string
  status: string
  call_type: string
  duration: number
  recording_url: string | null
  transcript_status: string
  outcome: string
  created_at: string
  updated_at?: string
}

function callCompletenessScore(call: CallRecord): number {
  let score = 0
  if (call.recording_url) score += 20
  if (call.transcript_status === 'completed') score += 15
  if (call.status === 'completed') score += 10
  if (call.transcript_status === 'failed' || call.status === 'failed') score += 8
  if (call.duration > 0) score += 2
  return score
}

/** Prefer the most complete / newest call snapshot — never regress to stale in-progress state. */
export function mergeCallState<T extends CallRecord>(current: T, incoming: T): T {
  const currentUpdated = Date.parse(current.updated_at || current.created_at)
  const incomingUpdated = Date.parse(incoming.updated_at || incoming.created_at)
  const currentScore = callCompletenessScore(current)
  const incomingScore = callCompletenessScore(incoming)

  if (incomingUpdated > currentUpdated) {
    return incoming
  }

  if (incomingUpdated < currentUpdated && currentScore >= incomingScore) {
    return current
  }

  if (incomingScore > currentScore) {
    return incoming
  }

  return current
}

export function isCallAwaitingRecording(call: CallRecord): boolean {
  if (call.recording_url) {
    return false
  }

  if (call.transcript_status === 'completed' || call.transcript_status === 'failed') {
    return false
  }

  if (call.status === 'completed' || call.status === 'failed') {
    return false
  }

  return true
}

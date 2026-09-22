/**
 * transcriptFormatter.ts
 *
 * A reusable helper for formatting plain-text C2C call transcripts into
 * structured, speaker-labeled conversation turns for display in the
 * Evaluation -> Transcript Tab.
 *
 * IMPORTANT:
 * - Does NOT modify the stored transcript text in any way.
 * - Does NOT call any API or external service.
 * - Operates purely on the text as passed in.
 * - Only used in the Evaluation Transcript Tab rendering path.
 *
 * -----------------------------------------------------------------------
 * WHY THE BUG OCCURRED (and what this version fixes)
 * -----------------------------------------------------------------------
 * The Whisper API (whisper-1, verbose_json) returns transcript text as a
 * single continuous paragraph with no newlines between sentences, e.g.:
 *
 *   "Hello? Hello, I'm speaking with TaskNova. Yes. Hello."
 *
 * The previous version of splitIntoLines() split ONLY on '\n' characters.
 * When the transcript has no newlines (Whisper output), the entire text
 * became ONE line, and assignSpeakers() returned a single turn for Speaker 0
 * containing the complete transcript — which is the bug the user saw.
 *
 * This version:
 * 1. Detects whether the transcript uses newline-separated or
 *    sentence-separated format.
 * 2. For newline format: splits by '\n' (preserves existing behaviour).
 * 3. For single-paragraph format (Whisper output): splits on sentence
 *    boundaries (. ? !) to produce individual utterance lines.
 * 4. Then applies the same speaker-assignment heuristic to all utterances.
 * -----------------------------------------------------------------------
 */

export interface FormattedTurn {
  speaker: number   // 0 = Assistant / Speaker 0, 1 = User / Speaker 1
  speakerLabel?: string // e.g. 'Assistant', 'User', 'Agent', 'Priya', etc.
  lines: string[]   // one or more utterance lines belonging to this turn
}

// ---------------------------------------------------------------------------
// Response-trigger patterns — case-insensitive, matched at line START
// ---------------------------------------------------------------------------
const RESPONSE_TRIGGERS: RegExp[] = [
  /^yes\b/i,
  /^no\b/i,
  /^okay\b/i,
  /^ok\b/i,
  /^hello\b/i,
  /^hi\b/i,
  /^sure\b/i,
  /^alright\b/i,
  /^right\b/i,
  /^good\b/i,
  /^got it\b/i,
  /^understood\b/i,
  /^absolutely\b/i,
  /^of course\b/i,
  /^thank you\b/i,
  /^thanks\b/i,
  /^welcome\b/i,
  /^sorry\b/i,
  /^please\b/i,
  /^i see\b/i,
  /^i understand\b/i,
  /^namaste\b/i,
  /^haan\b/i,
  /^han\b/i,
  /^yeah\b/i,
  /^yep\b/i,
  /^namaskar\b/i,
  /^bye\b/i,
  /^goodbye\b/i,
]

/** Returns true if the line matches a common conversational response starter */
function isResponseLine(line: string): boolean {
  return RESPONSE_TRIGGERS.some((re) => re.test(line.trim()))
}

/** Returns true if the line ends with a question mark (invites a response) */
function isQuestion(line: string): boolean {
  return line.trimEnd().endsWith('?')
}

function isAssistantRole(name: string): boolean {
  const n = name.toLowerCase().replace(/[\s_-]+/g, '')
  return (
    n.includes('assistant') ||
    n.includes('agent') ||
    n.includes('priya') ||
    n.includes('ai') ||
    n.includes('bot') ||
    n.includes('system') ||
    n === 'speaker0' ||
    n === 'spk0'
  )
}

function normalizeRoleLabel(name: string): string {
  const isAssoc = isAssistantRole(name)
  if (isAssoc) return 'Assistant'
  const n = name.toLowerCase().replace(/[\s_-]+/g, '')
  if (n.includes('user') || n.includes('customer') || n.includes('caller') || n.includes('human') || n.includes('lead') || n === 'speaker1' || n === 'spk1') {
    return 'User'
  }
  return name.trim().charAt(0).toUpperCase() + name.trim().slice(1)
}

/**
 * Preprocesses transcript text to ensure inline speaker prefixes (e.g. "User:", "Agent:", "Assistant:")
 * that might appear without newlines in single-paragraph transcripts get separated onto their own lines.
 */
function normalizeAndSplitSpeakerLines(text: string): string[] {
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()

  // Match inline speaker tags anywhere in the string
  // e.g. "food testing services. User: Yes. Agent: Is now a good time"
  const inlineSpeakerRegex = /(?:^|[\s\.\?!]+)((?:Assistant|Agent|Priya|AI|Bot|System|User|Customer|Caller|Receiver|Lead|Human|Speaker\s*[0-9A-Za-z]+)\s*:)\s*/gi

  normalized = normalized.replace(inlineSpeakerRegex, (match, prefix, offset) => {
    const trimmedPrefix = prefix.trim()
    if (offset === 0) {
      return `${trimmedPrefix} `
    }
    return `\n${trimmedPrefix} `
  })

  return normalized
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function splitIntoSentences(text: string): string[] {
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s|$)/g
  const sentences: string[] = []
  let match: RegExpExecArray | null

  while ((match = sentenceRegex.exec(text)) !== null) {
    const s = match[0].trim()
    if (s) sentences.push(s)
  }

  if (sentences.length >= 2) return sentences
  const raw = text.trim()
  return raw ? [raw] : []
}

function assignSpeakers(lines: string[]): FormattedTurn[] {
  if (lines.length === 0) return []

  const turns: FormattedTurn[] = []
  let currentSpeaker = 0
  let currentLines: string[] = [lines[0]]

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const prevLine = lines[i - 1]

    const prevWasQuestion = isQuestion(prevLine)
    const currentIsResponse = isResponseLine(line)

    const shouldSwitch = prevWasQuestion || currentIsResponse

    if (shouldSwitch) {
      turns.push({
        speaker: currentSpeaker,
        speakerLabel: currentSpeaker === 0 ? 'Assistant' : 'User',
        lines: [...currentLines],
      })
      currentSpeaker = currentSpeaker === 0 ? 1 : 0
      currentLines = [line]
    } else {
      currentLines.push(line)
    }
  }

  if (currentLines.length > 0) {
    turns.push({
      speaker: currentSpeaker,
      speakerLabel: currentSpeaker === 0 ? 'Assistant' : 'User',
      lines: [...currentLines],
    })
  }

  return turns
}

export function formatTranscriptIntoTurns(
  transcriptText: string | null | undefined,
): FormattedTurn[] {
  if (!transcriptText || !transcriptText.trim()) return []

  // Clean any raw subtitle/HTML artifacts, timestamp markers like [0.0s], and metadata markers
  const cleanedText = transcriptText
    .replace(/<[^>]*>?/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/<\|[^|]*\|>/g, ' ')
    .replace(/\[\d+\.?\d*s\]/g, '')
    .replace(/\b(?:mf\d+(?:\.\d+)?|mbf)\b/gi, ' ')
    .replace(/(\b[^\s\n]+(?:\s+[^\s\n]+)?\b)(?:\s+\1){2,}/gi, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()

  if (!cleanedText) return []

  const lines = normalizeAndSplitSpeakerLines(cleanedText)
  if (lines.length === 0) return []

  const prefixRegex = /^([A-Za-z0-9 _]{1,30}):\s+(.*)$/i
  const hasPrefixes = lines.some((l) => prefixRegex.test(l))

  if (hasPrefixes) {
    const turns: FormattedTurn[] = []

    for (const line of lines) {
      const match = prefixRegex.exec(line)
      if (match) {
        const rawSpeakerName = match[1].trim()
        const content = match[2].trim()
        const isAssistant = isAssistantRole(rawSpeakerName)
        const speaker = isAssistant ? 0 : 1
        const speakerLabel = normalizeRoleLabel(rawSpeakerName)

        const lastTurn = turns[turns.length - 1]
        if (lastTurn && lastTurn.speaker === speaker && lastTurn.speakerLabel === speakerLabel) {
          lastTurn.lines.push(content)
        } else {
          turns.push({
            speaker,
            speakerLabel,
            lines: [content],
          })
        }
      } else {
        // Continuation line without a prefix
        if (turns.length > 0) {
          turns[turns.length - 1].lines.push(line)
        } else {
          turns.push({
            speaker: 0,
            speakerLabel: 'Assistant',
            lines: [line],
          })
        }
      }
    }

    if (turns.length > 0) {
      return turns
    }
  }

  // Fallback: heuristic segmentation for unlabeled text
  const sentenceLines = lines.length >= 2 ? lines : splitIntoSentences(cleanedText)
  return assignSpeakers(sentenceLines)
}


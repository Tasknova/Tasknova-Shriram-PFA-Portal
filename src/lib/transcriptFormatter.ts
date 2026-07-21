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
  speaker: number   // 0 or 1
  lines: string[]   // one or more utterance lines belonging to this turn
}

// ---------------------------------------------------------------------------
// Response-trigger patterns — case-insensitive, matched at line START
// When a line starts with one of these it almost always signals the OTHER
// speaker has started talking (they are responding to the previous utterance).
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

// ---------------------------------------------------------------------------
// STEP 1: Pre-process and split transcript text into individual utterances
// ---------------------------------------------------------------------------

/**
 * Strips synthetic "Role: content" prefixes that may have been injected by
 * the API fallback path (e.g. "Conversation: Hello? Yes...").
 * The original stored text is never touched — this operates on a copy.
 */
function stripRolePrefixes(text: string): string {
  // If the entire text is prefixed with "SomeRole: ...", strip the prefix.
  // This covers synthetic entries like "Conversation: <raw_text>" that are
  // created when history is empty but raw_text exists.
  return text.replace(/^[A-Za-z0-9 _]+:\s+/i, '').trim()
}

/**
 * Detects whether the transcript is newline-separated (one utterance per line)
 * or a single paragraph (typical Whisper output with space-separated sentences).
 *
 * If there are at least 2 non-empty lines we treat it as newline-separated.
 * Otherwise we fall through to sentence splitting.
 */
function splitIntoLines(transcriptText: string): string[] {
  // Try newline split first
  const newlineLines = transcriptText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (newlineLines.length >= 2) {
    // Already has meaningful newline structure — use as-is
    return newlineLines
  }

  // Single paragraph (or just one newline-delimited line): split by sentence
  // boundaries. We split after . ? ! followed by whitespace OR end-of-string.
  // We keep the punctuation attached to the preceding sentence.
  const sentenceRegex = /[^.!?]+[.!?]+(?:\s|$)/g
  const sentences: string[] = []
  let match: RegExpExecArray | null

  while ((match = sentenceRegex.exec(transcriptText)) !== null) {
    const s = match[0].trim()
    if (s) sentences.push(s)
  }

  // If the regex produced useful splits, use them
  if (sentences.length >= 2) return sentences

  // Ultimate fallback: return the raw text as a single line
  // (the UI will still show it, just without speaker labels)
  const raw = transcriptText.trim()
  return raw ? [raw] : []
}

// ---------------------------------------------------------------------------
// STEP 2: Assign speakers — deterministic heuristic
// ---------------------------------------------------------------------------

/**
 * Core speaker-assignment algorithm.
 *
 * Rules applied per utterance line:
 * 1.  The very first line always belongs to Speaker 0.
 * 2.  A line triggers a speaker SWITCH when:
 *     a. The PREVIOUS line ended with '?' (question invites a response), OR
 *     b. The current line starts with a response-trigger word.
 * 3.  Otherwise the line is grouped with the CURRENT speaker (continuation).
 *
 * This produces stable, deterministic output for any given transcript text.
 *
 * NOTE: The algorithm never forces strict alternation. Two consecutive lines
 * that both lack response triggers and where the previous didn't ask a
 * question are assigned to the SAME speaker (continuation), correctly
 * representing a speaker who says multiple sentences in a row.
 */
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
      // Flush accumulated lines for the current speaker as one completed turn
      turns.push({ speaker: currentSpeaker, lines: [...currentLines] })
      // Flip speaker
      currentSpeaker = currentSpeaker === 0 ? 1 : 0
      currentLines = [line]
    } else {
      // Same speaker continues — append to the current turn
      currentLines.push(line)
    }
  }

  // Flush the final turn
  if (currentLines.length > 0) {
    turns.push({ speaker: currentSpeaker, lines: [...currentLines] })
  }

  return turns
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatTranscriptIntoTurns(
  transcriptText: string | null | undefined,
): FormattedTurn[] {
  if (!transcriptText || !transcriptText.trim()) return []
  
  const rawLines = transcriptText.split('\n').map(l => l.trim()).filter(Boolean)
  
  // Check if it's already explicitly diarized (e.g. "Assistant: Hello" and "User: Hi")
  // We check if at least half the lines have a prefix
  const prefixRegex = /^([A-Za-z0-9 _]+):\s+(.*)$/i
  let prefixedCount = 0
  
  for (const line of rawLines) {
    if (prefixRegex.test(line)) prefixedCount++
  }
  
  if (rawLines.length > 0 && prefixedCount >= rawLines.length / 2) {
    // Explicitly diarized!
    const turns: FormattedTurn[] = []
    let currentSpeakerIndex = 0
    const speakerMap = new Map<string, number>()
    
    for (const line of rawLines) {
      const match = prefixRegex.exec(line)
      if (match) {
        const name = match[1].toLowerCase()
        const content = match[2]
        
        if (!speakerMap.has(name)) {
          speakerMap.set(name, speakerMap.size)
        }
        
        const spkIdx = speakerMap.get(name)!
        
        if (spkIdx !== currentSpeakerIndex || turns.length === 0) {
          currentSpeakerIndex = spkIdx
          turns.push({ speaker: spkIdx, lines: [content] })
        } else {
          turns[turns.length - 1].lines.push(content)
        }
      } else {
        // Line without prefix, just append to current turn
        if (turns.length > 0) turns[turns.length - 1].lines.push(line)
        else turns.push({ speaker: 0, lines: [line] })
      }
    }
    return turns
  }

  // Fallback to legacy formatting logic
  const cleaned = stripRolePrefixes(transcriptText)
  const lines = splitIntoLines(cleaned)
  if (lines.length === 0) return []
  return assignSpeakers(lines)
}

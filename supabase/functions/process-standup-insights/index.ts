import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

interface Insight {
  type: "company" | "project" | "team"
  confidence: number
  text: string
  keywords: string[]
  mentioned_projects?: string[]
  mentioned_company?: string
  mentioned_people?: string[]
  mentioned_dates?: string[]
  category?: "decision" | "blocker" | "update" | "action_item" | "risk" | "opportunity"
  source_text?: string
}

interface ProcessingResult {
  success: boolean
  meeting_id: string
  stats: {
    total_insights: number
    company_items_added: number
    project_items_added: number
    duplicates_skipped: number
    failed_items: number
  }
  errors: string[]
}

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY")
    if (!apiKey) {
      console.error("GEMINI_API_KEY not configured")
      return null
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: 768,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error("Gemini API error:", error)
      return null
    }

    const data = await response.json()
    return data.embedding?.values || null
  } catch (error) {
    console.error("Error generating embedding:", error)
    return null
  }
}

function extractInsights(raw: unknown): Insight[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as Insight[]
  if (typeof raw === "object" && raw !== null) {
    const insights = (raw as { insights?: unknown }).insights
    if (Array.isArray(insights)) return insights as Insight[]
  }
  return []
}

async function resolveUserId(
  supabase: ReturnType<typeof createClient>,
  providedUserId?: string | null
): Promise<string | null> {
  if (providedUserId) return providedUserId

  // Fallback to latest project owner for single-tenant setups.
  const { data: project, error } = await supabase
    .from("projects")
    .select("company_id")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("Failed to resolve user from projects:", error)
    return null
  }

  return (project?.company_id as string | undefined) || null
}

async function classifyInsight(
  insight: Insight,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<{ type: "company" | "project"; projectId?: string; confidence: number }> {
  try {
    if (insight.mentioned_projects && insight.mentioned_projects.length > 0) {
      const projectName = insight.mentioned_projects[0]
      const { data: project, error } = await supabase
        .from("projects")
        .select("id")
        .eq("project_name", projectName)
        .eq("company_id", userId)
        .maybeSingle()

      if (!error && project?.id) {
        return {
          type: "project",
          projectId: project.id,
          confidence: insight.confidence,
        }
      }
    }

    return {
      type: "company",
      confidence: insight.confidence,
    }
  } catch (error) {
    console.error("Error classifying insight:", error)
    return {
      type: "company",
      confidence: Math.min(insight.confidence, 0.7),
    }
  }
}

function validateInsight(insight: Insight): boolean {
  const MIN_CONFIDENCE = 0.5

  if (insight.confidence < MIN_CONFIDENCE) return false
  if (!insight.text || insight.text.trim().length < 10) return false
  if (!["company", "project", "team"].includes(insight.type)) return false
  if (!insight.keywords || insight.keywords.length === 0) return false

  return true
}

async function storeInsight(
  insight: Insight,
  classification: { type: "company" | "project"; projectId?: string; confidence: number },
  _embedding: number[],
  supabase: ReturnType<typeof createClient>,
  userId: string,
  meetingRowId: string,
  sourceInsightId?: string
): Promise<boolean> {
  try {
    if (classification.type === "company") {
      const { data: inserted, error } = await supabase
        .from("company_context_memory")
        .insert({
          user_id: userId,
          approval_status: "pending",
          insight_text: insight.text,
          confidence_score: insight.confidence,
          relevance_score: insight.confidence,
          keywords: insight.keywords || [],
          category: insight.category || "update",
          source_insight_id: sourceInsightId,
          source_meeting_id: meetingRowId,
          metadata: {
            original_insight: insight,
          },
        })
        .select("id")
        .single()

      if (error || !inserted?.id) {
        console.error("Error storing company context memory:", error)
        return false
      }

      return true
    }

    if (classification.type === "project" && classification.projectId) {
      const { data: inserted, error } = await supabase
        .from("project_context_memory")
        .insert({
          user_id: userId,
          project_id: classification.projectId,
          approval_status: "pending",
          insight_text: insight.text,
          confidence_score: insight.confidence,
          relevance_score: insight.confidence,
          keywords: insight.keywords || [],
          category: insight.category || "update",
          source_insight_id: sourceInsightId,
          source_meeting_id: meetingRowId,
          metadata: {
            original_insight: insight,
          },
        })
        .select("id")
        .single()

      if (error || !inserted?.id) {
        console.error("Error storing project context memory:", error)
        return false
      }

      return true
    }

    return false
  } catch (error) {
    console.error("Error storing insight:", error)
    return false
  }
}

async function processMeeting(
  meetingRowId: string,
  supabase: ReturnType<typeof createClient>,
  providedUserId?: string | null
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: false,
    meeting_id: meetingRowId,
    stats: {
      total_insights: 0,
      company_items_added: 0,
      project_items_added: 0,
      duplicates_skipped: 0,
      failed_items: 0,
    },
    errors: [],
  }

  try {
    const { data: meeting, error: fetchError } = await supabase
      .from("daily_standup_meetings")
      .select("id, memory_context_analysis, processed")
      .eq("id", meetingRowId)
      .single()

    if (fetchError || !meeting) {
      result.errors.push(`Failed to fetch meeting by id: ${fetchError?.message}`)
      return result
    }

    const userId = await resolveUserId(supabase, providedUserId)
    if (!userId) {
      result.errors.push("Could not resolve user_id for context memory inserts")
      await supabase
        .from("daily_standup_meetings")
        .update({
          processed: false,
          processing_error: "Could not resolve user_id for context memory inserts",
        })
        .eq("id", meetingRowId)
      return result
    }

    const insights = extractInsights(meeting.memory_context_analysis)
    result.stats.total_insights = insights.length

    if (insights.length === 0) {
      await supabase
        .from("daily_standup_meetings")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          processing_error: null,
        })
        .eq("id", meetingRowId)
      result.success = true
      return result
    }

    for (let i = 0; i < insights.length; i++) {
      const insight = insights[i]

      if (!validateInsight(insight)) {
        result.stats.failed_items++
        continue
      }

      const embedding = await generateEmbedding(insight.text)
      if (!embedding) {
        result.stats.failed_items++
        continue
      }

      const classification = await classifyInsight(insight, supabase, userId)

      const stored = await storeInsight(
        insight,
        classification,
        embedding,
        supabase,
        userId,
        meetingRowId,
        `insight_${i}`
      )

      if (stored) {
        if (classification.type === "company") {
          result.stats.company_items_added++
        } else {
          result.stats.project_items_added++
        }
      } else {
        result.stats.failed_items++
      }
    }

    await supabase
      .from("daily_standup_meetings")
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", meetingRowId)

    result.success = true
  } catch (error) {
    result.errors.push(`Processing error: ${error instanceof Error ? error.message : String(error)}`)
    await supabase
      .from("daily_standup_meetings")
      .update({
        processed: false,
        processing_error: error instanceof Error ? error.message : String(error),
      })
      .eq("id", meetingRowId)
  }

  return result
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      })
    }

    const body = await req.json()
    const meetingRowId = body.id || body.meeting_row_id || body.meeting_db_id || body.meeting_id
    const userId = body.user_id || null

    if (!meetingRowId) {
      return new Response(
        JSON.stringify({ error: "meeting id is required (id | meeting_row_id | meeting_db_id | meeting_id)" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const result = await processMeeting(meetingRowId, supabase, userId)

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("Error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
})

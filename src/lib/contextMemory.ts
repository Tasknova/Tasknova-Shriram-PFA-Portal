/**
 * Context Memory Utilities
 * Handles classification, embedding, storage, and LRU management for meeting insights
 */

import { SupabaseClient } from '@supabase/supabase-js'
import {
  Insight,
  Classification,
  EmbeddingResponse,
} from '@/types'
import { generateEmbedding } from './embeddings'

const MIN_CONFIDENCE = 0.5
const MAX_COMPANY_CONTEXT_MEMORY = 10000 // Keep capacity "big"
const MAX_PROJECT_CONTEXT_MEMORY = 5000

/**
 * Classify an insight as company or project related
 * Uses entity mentions and embedding similarity
 */
export async function classifyInsight(
  insight: Insight,
  supabase: SupabaseClient,
  userId: string
): Promise<Classification> {
  try {
    // Step 1: Check mentioned_projects from insight
    if (
      insight.mentioned_projects &&
      insight.mentioned_projects.length > 0
    ) {
      // Find project by name in database
      const projectName = insight.mentioned_projects[0]
      const { data: project, error: projectLookupError } = await supabase
        .from('projects')
        .select('id')
        .eq('project_name', projectName)
        .eq('company_id', userId)
        .maybeSingle()

      if (projectLookupError) {
        console.warn('Project lookup failed during classification:', projectLookupError)
      }

      if (project?.id) {
        return {
          type: 'project',
          project_id: project.id,
          confidence: insight.confidence,
        }
      }
    }

    // Step 2: Use embedding similarity to existing company/project metadata
    const embedding = await generateEmbedding(insight.text)
    if (embedding.error) {
      console.warn('Could not generate embedding for classification:', embedding.error)
      // Default to company if embedding fails
      return {
        type: 'company',
        confidence: Math.min(insight.confidence, 0.7),
      }
    }

    // Compare with company brain metadata embeddings
    const { data: companyMatches } = await supabase.rpc(
      'match_company_brain_documents',
      {
        query_embedding: embedding.embedding,
        similarity_threshold: 0.5,
        match_count: 1,
      }
    )

    // Compare with project embeddings across all company projects
    const { data: projectMatches } = await supabase.rpc(
      'match_company_projects',
      {
        query_embedding: embedding.embedding,
        similarity_threshold: 0.5,
        match_count: 1,
      }
    )

    // Determine best match
    const companyScore =
      companyMatches && companyMatches.length > 0
        ? companyMatches[0].similarity
        : 0
    const projectScore =
      projectMatches && projectMatches.length > 0
        ? projectMatches[0].similarity
        : 0

    if (projectScore > companyScore && projectMatches && projectMatches.length > 0) {
      return {
        type: 'project',
        project_id: projectMatches[0].project_id,
        confidence: Math.min(projectScore, insight.confidence),
      }
    }

    // Default to company
    return {
      type: 'company',
      confidence: insight.confidence,
    }
  } catch (error) {
    console.error('Error classifying insight:', error)
    // Fallback: assume company-level
    return {
      type: 'company',
      confidence: Math.min(insight.confidence, 0.7),
    }
  }
}

/**
 * Check if an insight already exists (deduplication)
 * Uses embedding similarity to detect duplicates
 */
export async function deduplicateInsight(
  insightText: string,
  type: 'company' | 'project',
  projectId: string | undefined,
  embedding: number[],
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    if (type === 'company') {
      // Search existing company context embeddings
      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_count: 5,
        similarity_threshold: 0.85,
        table_name: 'company_context_embeddings',
      })

      if (error) {
        console.warn('Deduplication check failed:', error)
        return false
      }

      // If similarity > 0.85, consider it duplicate
      return data && data.length > 0 && data[0].similarity > 0.85
    } else if (type === 'project' && projectId) {
      // Search existing project context embeddings for this project
      const { data, error } = await supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_count: 5,
        similarity_threshold: 0.85,
        table_name: 'project_context_embeddings',
        project_id: projectId,
      })

      if (error) {
        console.warn('Deduplication check failed:', error)
        return false
      }

      return data && data.length > 0 && data[0].similarity > 0.85
    }

    return false
  } catch (error) {
    console.error('Error in deduplication check:', error)
    return false
  }
}

/**
 * Generate embedding for a context memory item
 * Uses existing embedding function
 */
export async function generateContextEmbedding(
  text: string
): Promise<EmbeddingResponse> {
  // Validate text length
  if (!text || text.trim().length < 10) {
    return {
      embedding: [],
      error: 'Text too short for embedding (minimum 10 characters)',
    }
  }

  // Use existing Gemini embedding function
  return await generateEmbedding(text)
}

/**
 * Store insight in context memory table
 */
export async function storeContextMemory(
  insight: Insight,
  classification: Classification,
  embedding: number[],
  supabase: SupabaseClient,
  userId: string,
  sourceMeetingId: string,
  sourceInsightId?: string
): Promise<string | null> {
  try {
    if (classification.type === 'company') {
      // Store in company context memory
      const { data, error } = await supabase
        .from('company_context_memory')
        .insert({
          user_id: userId,
          approval_status: 'pending',
          insight_text: insight.text,
          confidence_score: insight.confidence,
          relevance_score: insight.confidence,
          keywords: insight.keywords || [],
          category: insight.category || 'update',
          source_insight_id: sourceInsightId,
          source_meeting_id: sourceMeetingId,
          metadata: {
            original_insight: insight,
          },
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error storing company context memory:', error)
        return null
      }

      // Embedding is stored only after explicit approval.
      if (data?.id) return data.id
    } else if (classification.type === 'project' && classification.project_id) {
      // Store in project context memory
      const { data, error } = await supabase
        .from('project_context_memory')
        .insert({
          user_id: userId,
          project_id: classification.project_id,
          approval_status: 'pending',
          insight_text: insight.text,
          confidence_score: insight.confidence,
          relevance_score: insight.confidence,
          keywords: insight.keywords || [],
          category: insight.category || 'update',
          source_insight_id: sourceInsightId,
          source_meeting_id: sourceMeetingId,
          metadata: {
            original_insight: insight,
          },
        })
        .select('id')
        .single()

      if (error) {
        console.error('Error storing project context memory:', error)
        return null
      }

      // Embedding is stored only after explicit approval.
      if (data?.id) return data.id
    }

    return null
  } catch (error) {
    console.error('Error storing context memory:', error)
    return null
  }
}

/**
 * Update access count and last accessed timestamp
 * Called when a context memory item is used in search
 */
export async function updateAccessCount(
  contextMemoryId: string,
  type: 'company' | 'project',
  supabase: SupabaseClient
): Promise<void> {
  try {
    const table =
      type === 'company'
        ? 'company_context_memory'
        : 'project_context_memory'

    // Get current access count
    const { data: current } = await supabase
      .from(table)
      .select('access_count')
      .eq('id', contextMemoryId)
      .single()

    const newCount = (current?.access_count || 0) + 1

    // Update both access count and timestamp
    await supabase
      .from(table)
      .update({
        access_count: newCount,
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', contextMemoryId)
  } catch (error) {
    console.error('Error updating access count:', error)
  }
}

/**
 * Manage LRU cleanup - remove least-used items when at capacity
 */
export async function manageLRUCleanup(
  type: 'company' | 'project',
  supabase: SupabaseClient,
  userId: string,
  projectId?: string
): Promise<number> {
  try {
    const table =
      type === 'company'
        ? 'company_context_memory'
        : 'project_context_memory'
    const maxCapacity =
      type === 'company'
        ? MAX_COMPANY_CONTEXT_MEMORY
        : MAX_PROJECT_CONTEXT_MEMORY

    // Count existing items
    let countQuery = supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('approval_status', 'approved')

    if (type === 'project' && projectId) {
      countQuery = countQuery.eq('project_id', projectId)
    }

    const { count } = await countQuery

    if (!count || count < maxCapacity) {
      return 0 // No cleanup needed
    }

    // Find least-used unpinned items
    const itemsToRemove = count - maxCapacity
    let deleteQuery = supabase
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .eq('approval_status', 'approved')
      .eq('is_pinned', false)
      .order('last_accessed_at', { ascending: true })
      .limit(itemsToRemove)

    if (type === 'project' && projectId) {
      deleteQuery = deleteQuery.eq('project_id', projectId)
    }

    const { data: toDelete } = await deleteQuery

    if (!toDelete || toDelete.length === 0) {
      return 0
    }

    // Delete items
    const ids = toDelete.map((item) => item.id)
    const { error } = await supabase
      .from(table)
      .delete()
      .in('id', ids)

    if (error) {
      console.error('Error during LRU cleanup:', error)
      return 0
    }

    return toDelete.length
  } catch (error) {
    console.error('Error in LRU cleanup:', error)
    return 0
  }
}

/**
 * Validate insight before processing
 */
export function validateInsight(insight: Insight): boolean {
  // Check confidence threshold
  if (insight.confidence < MIN_CONFIDENCE) {
    return false
  }

  // Check text length
  if (!insight.text || insight.text.trim().length < 10) {
    return false
  }

  // Check type is valid
  if (!['company', 'project', 'team'].includes(insight.type)) {
    return false
  }

  // Check has at least one keyword
  if (!insight.keywords || insight.keywords.length === 0) {
    return false
  }

  return true
}

/**
 * Get context memory stats for a user
 */
export async function getContextMemoryStats(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  company_count: number
  project_count: number
  total_pinned: number
  last_updated: string | null
}> {
  try {
    const { count: companyCount } = await supabase
      .from('company_context_memory')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('approval_status', 'approved')

    const { count: projectCount } = await supabase
      .from('project_context_memory')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('approval_status', 'approved')

    const { count: pinnedCount } = await supabase
      .from('company_context_memory')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('approval_status', 'approved')
      .eq('is_pinned', true)

    const { data: latestMeeting } = await supabase
      .from('daily_standup_meetings')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return {
      company_count: companyCount || 0,
      project_count: projectCount || 0,
      total_pinned: pinnedCount || 0,
      last_updated: latestMeeting?.created_at || null,
    }
  } catch (error) {
    console.error('Error getting context memory stats:', error)
    return {
      company_count: 0,
      project_count: 0,
      total_pinned: 0,
      last_updated: null,
    }
  }
}

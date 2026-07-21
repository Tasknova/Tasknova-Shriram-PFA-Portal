// Utility functions for Project Brain vector embeddings with Google Gemini

import { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export interface ProjectMetadata {
  id?: string;
  project_id?: string;
  company_id?: string;
  domain?: string;
  industry?: string;
  project_type?: string;
  target_audience?: string;
  tech_stack?: string[];
  requirements?: string;
  key_goals?: string[];
  milestones?: Record<string, unknown>;
  team_size?: number;
  budget_currency?: string;
  budget_amount?: number;
  priority_level?: string;
  pricing_information?: string;
  custom_fields?: Record<string, unknown>;
  additional_context?: string;
}

interface DocumentInfo {
  file_name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  file_type?: string;
  content_text?: string;
  [key: string]: string | string[] | undefined;
}

/**
 * Prepare project metadata for embedding
 * @param metadata - Project metadata object
 * @param projectName - Project name
 * @returns Formatted text for embedding
 */
export function prepareProjectMetadataForEmbedding(
  metadata: Partial<ProjectMetadata>,
  projectName: string
): string {
  const parts = [];

  if (projectName) parts.push(`Project: ${projectName}`);
  if (metadata.domain) parts.push(`Domain: ${metadata.domain}`);
  if (metadata.industry) parts.push(`Industry: ${metadata.industry}`);
  if (metadata.project_type) parts.push(`Type: ${metadata.project_type}`);
  if (metadata.target_audience) parts.push(`Target Audience: ${metadata.target_audience}`);
  if (metadata.tech_stack?.length) parts.push(`Tech Stack: ${metadata.tech_stack.join(', ')}`);
  if (metadata.key_goals?.length) parts.push(`Goals: ${metadata.key_goals.join(', ')}`);
  if (metadata.requirements) parts.push(`Requirements: ${metadata.requirements}`);
  if (metadata.budget_amount && metadata.budget_currency) parts.push(`Budget: ${metadata.budget_currency} ${metadata.budget_amount}`);
  if (metadata.pricing_information) parts.push(`Pricing: ${metadata.pricing_information}`);
  if (metadata.additional_context) parts.push(`Context: ${metadata.additional_context}`);
  
  return parts.filter(Boolean).join('\n');
}

export interface ProjectEmbeddingData {
  projectId: string;
  companyId: string;
  contentType: 'project_metadata' | 'document' | 'document_chunk';
  contentId?: string;
  content: string;
  metadata?: Record<string, string | number | boolean>;
  embedding?: number[];
}

/**
 * Store project embedding in the database
 * @param supabase - Supabase client
 * @param data - Embedding data
 * @returns Success status
 */
export async function storeProjectEmbedding(
  supabase: SupabaseClient,
  data: ProjectEmbeddingData
): Promise<{ success: boolean; error?: string }> {
  try {
    let embedding = data.embedding;
    if (!embedding) {
      const result = await generateEmbedding(data.content);
      if (result.error) {
        return { success: false, error: result.error };
      }
      embedding = result.embedding;
    }

    // Convert embedding array to string for pgvector
    const embeddingStr = `[${embedding.join(',')}]`;

    const { error } = await supabase
      .from('project_embeddings')
      .insert([{
        project_id: data.projectId,
        company_id: data.companyId,
        content_type: data.contentType,
        content_id: data.contentId,
        content: data.content,
        metadata: data.metadata,
        embedding: embeddingStr
      }]);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error storing project embedding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Prepare document for embedding
 * @param doc - Document object
 * @param projectName - Project name
 * @returns Formatted text for embedding
 */
function prepareDocumentForEmbedding(doc: DocumentInfo, projectName: string): string {
  const parts = [];

  if (projectName) parts.push(`Project: ${projectName}`);
  if (doc.file_name) parts.push(`File: ${doc.file_name}`);
  if (doc.description) parts.push(`Description: ${doc.description}`);
  if (doc.category) parts.push(`Category: ${doc.category}`);
  if (doc.tags?.length) parts.push(`Tags: ${doc.tags.join(', ')}`);
  if (doc.file_type) parts.push(`Type: ${doc.file_type}`);
  
  // Most important: include the actual document content
  if (doc.content_text) {
    parts.push(`\nCONTENT:\n${doc.content_text}`);
  }

  return parts.filter(Boolean).join('\n');
}

/**
 * Generate and store embedding for a document (client-side)
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param companyId - Company ID
 * @param documentId - Document ID
 * @param projectName - Project name
 * @returns Success status
 */
export async function generateDocumentEmbeddingClientSide(
  supabase: SupabaseClient,
  projectId: string,
  companyId: string,
  documentId: string,
  projectName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch document from database
    const { data: document, error: docError } = await supabase
      .from('project_documents')
      .select('*')
      .eq('id', documentId)
      .eq('project_id', projectId)
      .single();

    if (docError || !document) {
      return { success: false, error: `Document not found: ${docError?.message}` };
    }

    // Prepare content for embedding
    const content = prepareDocumentForEmbedding(document, projectName);

    // Delete old embeddings for this document
    await supabase
      .from('project_embeddings')
      .delete()
      .eq('content_id', documentId)
      .eq('content_type', 'document');

    // Generate and store embedding
    const result = await storeProjectEmbedding(supabase, {
      projectId,
      companyId,
      contentType: 'document',
      contentId: documentId,
      content,
      metadata: {
        file_name: document.file_name,
        file_type: document.file_type,
        category: document.category,
        tags: document.tags,
      }
    });

    return result;
  } catch (error) {
    console.error('Error generating document embedding (client-side):', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Store project metadata with automatic embedding generation
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param companyId - Company ID
 * @param projectName - Project name
 * @param metadata - Project metadata
 * @returns Success status
 */
export async function storeProjectMetadataWithEmbedding(
  supabase: SupabaseClient,
  projectId: string,
  companyId: string,
  projectName: string,
  metadata: Partial<ProjectMetadata>
): Promise<{ success: boolean; error?: string; metadataId?: string }> {
  try {
    // Upsert project metadata
    const { data: metadataData, error: metadataError } = await supabase
      .from('project_metadata')
      .upsert({
        project_id: projectId,
        company_id: companyId,
        ...metadata,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (metadataError) throw metadataError;

    // Delete old project_metadata embeddings
    await supabase
      .from('project_embeddings')
      .delete()
      .eq('project_id', projectId)
      .eq('content_type', 'project_metadata');

    // Generate and store embedding
    const content = prepareProjectMetadataForEmbedding(metadata, projectName);
    const embeddingResult = await generateEmbedding(content);

    if (embeddingResult.error) {
      console.warn('Warning: Failed to generate embedding:', embeddingResult.error);
      return { success: true, metadataId: metadataData.id, error: embeddingResult.error };
    }

    // Fetch project status
    const { data: project } = await supabase
      .from('projects')
      .select('status')
      .eq('id', projectId)
      .single();

    // Convert embedding array to string for pgvector
    const embeddingStr = `[${embeddingResult.embedding.join(',')}]`;

    await supabase
      .from('project_embeddings')
      .insert({
        project_id: projectId,
        company_id: companyId,
        content_type: 'project_metadata',
        content_id: metadataData.id,
        content: content,
        embedding: embeddingStr,
        metadata: {
          source: 'project_metadata',
          project_name: projectName,
          status: project?.status || 'active'
        }
      });

    return { success: true, metadataId: metadataData.id };
  } catch (error) {
    console.error('Error storing project metadata:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate embedding for a project document
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param companyId - Company ID
 * @param documentId - Document ID
 * @returns Success status
 */
export async function generateProjectDocumentEmbedding(
  supabase: SupabaseClient,
  projectId: string,
  companyId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Call edge function to generate embedding
    const { error } = await supabase.functions.invoke('generate-project-embedding', {
      body: {
        type: 'document',
        project_id: projectId,
        company_id: companyId,
        document_id: documentId
      }
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error generating document embedding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate embedding for project metadata
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param companyId - Company ID
 * @returns Success status
 */
export async function generateProjectMetadataEmbedding(
  supabase: SupabaseClient,
  projectId: string,
  companyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Call edge function to generate embedding
    const { error } = await supabase.functions.invoke('generate-project-embedding', {
      body: {
        type: 'metadata',
        project_id: projectId,
        company_id: companyId
      }
    });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error generating metadata embedding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

interface ProjectSearchResult {
  content: string;
  similarity: number;
  content_type?: string;
  [key: string]: string | number | undefined;
}

/**
 * Search project content by semantic similarity
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param query - Natural language query
 * @param threshold - Minimum similarity score (default: 0.78)
 * @param limit - Maximum results (default: 10)
 * @returns Array of matching documents
 */
export async function searchProjectContent(
  supabase: SupabaseClient,
  projectId: string,
  query: string,
  threshold: number = 0.78,
  limit: number = 10
): Promise<ProjectSearchResult[]> {
  try {
    // Always fetch project metadata first to ensure basic project info is available
    const { data: metadataData, error: metadataError } = await supabase
      .from('project_embeddings')
      .select('*')
      .eq('project_id', projectId)
      .eq('content_type', 'project_metadata')
      .order('created_at', { ascending: false })
      .limit(1);

    if (metadataError) {
      console.error('Error fetching project metadata:', metadataError);
    }

    // Generate embedding for the query
    const result = await generateEmbedding(query);
    if (result.error) {
      console.error('Error generating query embedding:', result.error);
      // If we have metadata, at least return that
      return metadataData || [];
    }

    // Search for relevant documents using vector similarity
    const { data, error } = await supabase
      .rpc('match_project_documents', {
        p_query_embedding: result.embedding,
        p_project_id: projectId,
        p_match_threshold: threshold,
        p_match_count: limit
      });

    if (error) throw error;
    
    // Combine metadata with search results, ensuring metadata is first and no duplicates
    const results = (data || []) as ProjectSearchResult[];
    const metadata = metadataData?.[0] as ProjectSearchResult | undefined;
    
    if (metadata) {
      // Check if metadata is already in results
      const hasMetadata = results.some((r: ProjectSearchResult) => r.content_type === 'project_metadata');
      if (!hasMetadata) {
        // Add metadata at the beginning with a default similarity
        results.unshift({ ...metadata, similarity: 1.0 });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error searching project content:', error);
    return [];
  }
}

/**
 * Search across all company projects
 * @param supabase - Supabase client
 * @param companyId - Company ID
 * @param query - Natural language query
 * @param threshold - Minimum similarity score (default: 0.78)
 * @param limit - Maximum results (default: 10)
 * @returns Array of matching documents
 */
export async function searchCompanyProjects(
  supabase: SupabaseClient,
  companyId: string,
  query: string,
  threshold: number = 0.78,
  limit: number = 10
): Promise<ProjectSearchResult[]> {
  try {
    const result = await generateEmbedding(query);
    if (result.error) {
      console.error('Error generating query embedding:', result.error);
      return [];
    }

    const { data, error } = await supabase
      .rpc('match_company_projects', {
        p_query_embedding: result.embedding,
        p_company_id: companyId,
        p_match_threshold: threshold,
        p_match_count: limit
      });

    if (error) throw error;
    return (data || []) as ProjectSearchResult[];
  } catch (error) {
    console.error('Error searching company projects:', error);
    return [];
  }
}

/**
 * Generate chat response using RAG (Retrieval-Augmented Generation)
 * @param query - User's question
 * @param context - Retrieved context from embeddings
 * @returns AI response with sources
 */
export async function generateProjectChatResponse(
  query: string,
  context: ProjectSearchResult[]
): Promise<{ answer: string; sources: ProjectSearchResult[]; error?: string }> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!apiKey) {
      return { answer: '', sources: [], error: 'Gemini API key not configured' };
    }

    // Build context string from retrieved documents
    const contextText = context
      .map((doc, idx) => `[${idx + 1}] ${doc.content}`)
      .join('\n\n');

    // Create prompt for Gemini
    const prompt = `You are a helpful AI assistant that answers questions about a project using only the provided context. 

CONTEXT:
${contextText}

QUESTION: ${query}

INSTRUCTIONS:
- Answer the question based ONLY on the provided context
- If the context doesn't contain relevant information, say "I don't have enough information to answer that question."
- Be concise and specific
- If you reference information from the context, mention which source ([1], [2], etc.)

ANSWER:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini chat API error:', response.status, errorData);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid response structure from Gemini');
    }

    const answer = data.candidates[0].content.parts[0].text;

    return { answer, sources: context };
  } catch (error) {
    console.error('Error generating chat response:', error);
    return {
      answer: '',
      sources: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Delete project embeddings by type
 * @param supabase - Supabase client
 * @param projectId - Project ID
 * @param contentType - Content type to delete
 */
export async function deleteProjectEmbeddingsByType(
  supabase: SupabaseClient,
  projectId: string,
  contentType: string
): Promise<void> {
  await supabase
    .from('project_embeddings')
    .delete()
    .eq('project_id', projectId)
    .eq('content_type', contentType);
}

/**
 * Delete all embeddings for a project
 * @param supabase - Supabase client
 * @param projectId - Project ID
 */
export async function deleteAllProjectEmbeddings(
  supabase: SupabaseClient,
  projectId: string
): Promise<void> {
  await supabase
    .from('project_embeddings')
    .delete()
    .eq('project_id', projectId);
}

// Utility functions for Company Brain vector embeddings with Google Gemini

import { SupabaseClient } from '@supabase/supabase-js';

interface EmbeddingResponse {
  embedding: number[];
  error?: string;
}

/**
 * Generate a 768-dimensional embedding using Google Gemini API
 * @param text - The text content to embed
 * @returns Embedding array or error
 */
export async function generateEmbedding(text: string): Promise<EmbeddingResponse> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn('Gemini API key not configured');
      return { embedding: [], error: 'Gemini API key not configured' };
    }

    // Validate minimum text length
    if (!text || text.trim().length < 10) {
      console.warn('Text too short for embedding (min 10 chars)');
      return { embedding: [], error: 'Text too short for embedding (minimum 10 characters required)' };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: {
            parts: [{ text: text }]
          },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error response:', errorData);
      console.error('Request details:', {
        url: 'v1beta/models/gemini-embedding-001:embedContent',
        textLength: text.length,
        status: response.status
      });
      throw new Error(`Gemini API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data.embedding || !data.embedding.values) {
      console.error('Unexpected Gemini response structure:', data);
      throw new Error('Invalid embedding response structure');
    }
    
    console.log('Gemini API response:', {
      dimensions: data.embedding.values.length,
      firstFewValues: data.embedding.values.slice(0, 5)
    });
    
    return { embedding: data.embedding.values };
  } catch (error) {
    console.error('Error generating embedding:', error);
    return { embedding: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Chunk text into smaller pieces for better embedding quality
 * @param text - The text to chunk
 * @param maxLength - Maximum length per chunk (default: 1000)
 * @returns Array of text chunks
 */
export function chunkText(text: string, maxLength: number = 1000): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.split(/[.!?]+\s+/);
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence + '. ';
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence + '. ';
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

export interface CompanyBrain {
  id?: string;
  user_id?: string;
  company_name?: string;
  tagline?: string;
  company_description?: string;
  industry?: string;
  founded_year?: number;
  company_size?: string;
  location?: string;
  website?: string;
  email?: string;
  phone?: string;
  mission_statement?: string;
  vision_statement?: string;
  core_values?: string[];
  unique_selling_points?: string[];
  target_audience?: string;
  pricing_model?: string;
  key_features?: string[];
  founder_info?: string;
  additional_context?: string;
}

interface SearchResult {
  content: string;
  similarity: number;
  [key: string]: string | number;
}

interface ChatContext {
  content: string;
  [key: string]: string;
}

/**
 * Prepare company brain data for embedding
 * @param brain - Company brain object
 * @returns Formatted text for embedding
 */
export function prepareCompanyInfoForEmbedding(brain: Partial<CompanyBrain>): string {
  return [
    brain.company_name ? `Company: ${brain.company_name}` : '',
    brain.tagline ? `Tagline: ${brain.tagline}` : '',
    brain.company_description ? `Description: ${brain.company_description}` : '',
    brain.industry ? `Industry: ${brain.industry}` : '',
    brain.founded_year ? `Founded: ${brain.founded_year}` : '',
    brain.company_size ? `Size: ${brain.company_size}` : '',
    brain.location ? `Location: ${brain.location}` : '',
    brain.website ? `Website: ${brain.website}` : '',
    brain.email ? `Email: ${brain.email}` : '',
    brain.phone ? `Phone: ${brain.phone}` : '',
    brain.mission_statement ? `Mission: ${brain.mission_statement}` : '',
    brain.vision_statement ? `Vision: ${brain.vision_statement}` : '',
    brain.core_values?.length ? `Values: ${brain.core_values.join(', ')}` : '',
    brain.unique_selling_points?.length ? `USPs: ${brain.unique_selling_points.join(', ')}` : '',
    brain.target_audience ? `Target: ${brain.target_audience}` : '',
    brain.pricing_model ? `Pricing: ${brain.pricing_model}` : '',
    brain.key_features?.length ? `Features: ${brain.key_features.join(', ')}` : '',
    brain.founder_info ? `Founders: ${brain.founder_info}` : '',
  ].filter(Boolean).join('\n');
}

export interface CompanyBrainEmbedding {
  userId: string;
  contentType: 'company_info' | 'document' | 'additional_context';
  contentId?: string;
  content: string;
  metadata?: Record<string, string | number | boolean>;
  embedding?: number[];
}

/**
 * Store an embedding in the database
 * @param supabase - Supabase client
 * @param data - Embedding data
 * @returns Success status
 */
export async function storeEmbedding(
  supabase: SupabaseClient,
  data: CompanyBrainEmbedding
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate embedding if not provided
    let embedding = data.embedding;
    if (!embedding) {
      const result = await generateEmbedding(data.content);
      if (result.error) {
        return { success: false, error: result.error };
      }
      embedding = result.embedding;
    }

    // Store in database
    // Convert embedding array to string for pgvector
    const embeddingStr = `[${embedding.join(',')}]`;
    
    console.log('storeEmbedding:', {
      userId: data.userId,
      contentType: data.contentType,
      embeddingLength: embedding.length,
      embeddingStrLength: embeddingStr.length
    });
    
    const { error } = await supabase
      .from('company_brain_embeddings')
      .insert([{
        user_id: data.userId,
        content_type: data.contentType,
        content_id: data.contentId,
        content: data.content,
        metadata: data.metadata,
        embedding: embeddingStr
      }]);

    if (error) {
      console.error('storeEmbedding error:', error);
      throw error;
    }
    return { success: true };
  } catch (error) {
    console.error('Error storing embedding:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Store company brain info with automatic embedding generation
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param brain - Company brain data
 * @returns Success status
 */
export async function storeCompanyBrainWithEmbedding(
  supabase: SupabaseClient,
  userId: string,
  brain: Partial<CompanyBrain>
): Promise<{ success: boolean; error?: string; brainId?: string }> {
  try {
    // Upsert company brain
    const { data: brainData, error: brainError } = await supabase
      .from('company_brain')
      .upsert({
        user_id: userId,
        ...brain,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (brainError) throw brainError;

    // Delete old company_info embeddings
    await supabase
      .from('company_brain_embeddings')
      .delete()
      .eq('user_id', userId)
      .eq('content_type', 'company_info');

    // Generate and store embedding
    const content = prepareCompanyInfoForEmbedding(brain);
    const embeddingResult = await generateEmbedding(content);

    if (embeddingResult.error) {
      console.warn('Warning: Failed to generate embedding:', embeddingResult.error);
      return { success: true, brainId: brainData.id, error: embeddingResult.error };
    }

    // Convert embedding array to string for pgvector
    const embeddingStr = `[${embeddingResult.embedding.join(',')}]`;

    console.log('Inserting embedding:', {
      userId,
      contentType: 'company_info',
      brainId: brainData.id,
      embeddingLength: embeddingResult.embedding.length,
      embeddingStrLength: embeddingStr.length,
      embeddingStr: embeddingStr.substring(0, 100) + '...'
    });

    const { error: insertError } = await supabase
      .from('company_brain_embeddings')
      .insert({
        user_id: userId,
        content_type: 'company_info',
        content_id: brainData.id,
        content: content,
        embedding: embeddingStr,
        metadata: {
          company_name: brain.company_name,
          industry: brain.industry
        }
      });

    if (insertError) {
      console.error('Embedding insert error:', insertError);
      throw insertError;
    }

    console.log('✓ Embedding inserted successfully');
    return { success: true, brainId: brainData.id };
  } catch (error) {
    console.error('Error storing company brain:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Store additional context with chunking and embedding
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param brainId - Company brain ID
 * @param additionalContext - Large text to chunk and embed
 * @returns Success status
 */
export async function storeAdditionalContext(
  supabase: SupabaseClient,
  userId: string,
  brainId: string,
  additionalContext: string
): Promise<{ success: boolean; error?: string; chunksProcessed?: number }> {
  try {
    // Delete old additional_context embeddings
    await supabase
      .from('company_brain_embeddings')
      .delete()
      .eq('user_id', userId)
      .eq('content_type', 'additional_context');

    // Chunk the text
    const chunks = chunkText(additionalContext);

    // Generate and store embedding for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const embeddingResult = await generateEmbedding(chunks[i]);

      if (embeddingResult.error) {
        console.warn(`Warning: Failed to generate embedding for chunk ${i}:`, embeddingResult.error);
        continue;
      }

      // Convert embedding array to string for pgvector
      const embeddingStr = `[${embeddingResult.embedding.join(',')}]`;

      await supabase
        .from('company_brain_embeddings')
        .insert({
          user_id: userId,
          content_type: 'additional_context',
          content_id: brainId,
          content: chunks[i],
          embedding: embeddingStr,
          metadata: {
            chunk_index: i,
            total_chunks: chunks.length
          }
        });
    }

    return { success: true, chunksProcessed: chunks.length };
  } catch (error) {
    console.error('Error storing additional context:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Search company brain content using semantic search
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param query - Natural language query
 * @param threshold - Minimum similarity score (default: 0.78)
 * @param limit - Maximum results (default: 10)
 * @returns Array of matching documents
 */
export async function searchSimilarContent(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  threshold: number = 0.78,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    // Generate query embedding
    const result = await generateEmbedding(query);
    if (result.error) {
      console.error('Error generating query embedding:', result.error);
      return [];
    }

    // Search using RPC function
    const { data, error } = await supabase
      .rpc('match_company_brain_documents', {
        query_embedding: result.embedding,
        match_user_id: userId,
        match_threshold: threshold,
        match_count: limit
      });

    if (error) throw error;
    return (data || []) as SearchResult[];
  } catch (error) {
    console.error('Error searching content:', error);
    return [];
  }
}

/**
 * Generate chat response using RAG (Retrieval-Augmented Generation)
 * @param query - User's question
 * @param context - Retrieved context from embeddings
 * @returns AI response with sources
 */
export async function generateChatResponse(
  query: string,
  context: ChatContext[]
): Promise<{ answer: string; sources: ChatContext[]; error?: string }> {
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
    const prompt = `You are a helpful AI assistant that answers questions about a company using only the provided context. 

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
 * Delete embeddings by content type
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param contentType - Content type to delete
 */
export async function deleteEmbeddingsByType(
  supabase: SupabaseClient,
  userId: string,
  contentType: string
): Promise<void> {
  await supabase
    .from('company_brain_embeddings')
    .delete()
    .eq('user_id', userId)
    .eq('content_type', contentType);
}

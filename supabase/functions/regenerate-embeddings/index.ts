import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Generate embedding using Google Gemini
async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

// Chunk text into smaller pieces
function chunkText(text: string, maxLength: number = 1000): string[] {
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

// Prepare company info for embedding
function prepareCompanyInfoForEmbedding(brain: any): string {
  return [
    brain.company_name ? `Company: ${brain.company_name}` : '',
    brain.company_description ? `Description: ${brain.company_description}` : '',
    brain.industry ? `Industry: ${brain.industry}` : '',
    brain.mission_statement ? `Mission: ${brain.mission_statement}` : '',
    brain.vision_statement ? `Vision: ${brain.vision_statement}` : '',
    brain.core_values?.length ? `Values: ${brain.core_values.join(', ')}` : '',
    brain.unique_selling_points?.length ? `USPs: ${brain.unique_selling_points.join(', ')}` : '',
    brain.target_audience ? `Target: ${brain.target_audience}` : '',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting company brain embedding regeneration...');

    // Get all company brains
    const { data: companyBrains, error: brainError } = await supabase
      .from('company_brain')
      .select('*');

    if (brainError) throw brainError;

    let processedCount = 0;

    for (const brain of companyBrains || []) {
      // Delete old embeddings
      await supabase
        .from('company_brain_embeddings')
        .delete()
        .eq('user_id', brain.user_id)
        .eq('content_type', 'company_info');

      // Generate and store new embedding
      const content = prepareCompanyInfoForEmbedding(brain);
      const embedding = await generateEmbedding(content, geminiApiKey);
      // Convert to string for pgvector
      const embeddingStr = `[${embedding.join(',')}]`;

      await supabase
        .from('company_brain_embeddings')
        .insert({
          user_id: brain.user_id,
          content_type: 'company_info',
          content_id: brain.id,
          content,
          embedding: embeddingStr,
          metadata: {
            company_name: brain.company_name,
            industry: brain.industry,
          }
        });

      console.log(`✓ Regenerated embedding for: ${brain.company_name}`);

      // Process additional context if exists
      if (brain.additional_context) {
        await supabase
          .from('company_brain_embeddings')
          .delete()
          .eq('user_id', brain.user_id)
          .eq('content_type', 'additional_context');

        const chunks = chunkText(brain.additional_context);
        
        for (let i = 0; i < chunks.length; i++) {
          const chunkEmbedding = await generateEmbedding(chunks[i], geminiApiKey);
          // Convert to string for pgvector
          const embeddingStr = `[${chunkEmbedding.join(',')}]`;
          
          await supabase
            .from('company_brain_embeddings')
            .insert({
              user_id: brain.user_id,
              content_type: 'additional_context',
              content_id: brain.id,
              content: chunks[i],
              embedding: embeddingStr,
              metadata: {
                chunk_index: i,
                total_chunks: chunks.length,
              }
            });
        }

        console.log(`✓ Regenerated ${chunks.length} additional context chunks`);
      }

      processedCount++;
    }

    // Process all documents
    const { data: documents, error: docError } = await supabase
      .from('brain_documents')
      .select('*');

    if (docError) throw docError;

    let docsProcessed = 0;

    for (const doc of documents || []) {
      await supabase
        .from('company_brain_embeddings')
        .delete()
        .eq('content_type', 'document')
        .eq('content_id', doc.id);

      const embeddingContent = [
        `File: ${doc.file_name}`,
        doc.description ? `Description: ${doc.description}` : '',
        doc.category ? `Category: ${doc.category}` : '',
        doc.tags?.length ? `Tags: ${doc.tags.join(', ')}` : '',
        `Type: ${doc.file_type}`
      ].filter(Boolean).join('\n');

      const embedding = await generateEmbedding(embeddingContent, geminiApiKey);
      // Convert to string for pgvector
      const embeddingStr = `[${embedding.join(',')}]`;

      await supabase
        .from('company_brain_embeddings')
        .insert({
          user_id: doc.user_id,
          content_type: 'document',
          content_id: doc.id,
          content: embeddingContent,
          embedding: embeddingStr,
          metadata: {
            file_name: doc.file_name,
            file_type: doc.file_type,
            category: doc.category,
            tags: doc.tags
          }
        });

      docsProcessed++;
    }

    console.log(`✅ Completed: ${processedCount} company brains, ${docsProcessed} documents`);

    return new Response(
      JSON.stringify({
        success: true,
        companies_processed: processedCount,
        documents_processed: docsProcessed
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, status: 200 }
    );

  } catch (error) {
    console.error('[regenerate-embeddings] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate embedding using Google Gemini API
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
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

// Prepare project metadata for embedding
function prepareMetadataForEmbedding(metadata: any, projectName: string): string {
  const parts = [];

  if (projectName) parts.push(`Project: ${projectName}`);
  if (metadata.domain) parts.push(`Domain: ${metadata.domain}`);
  if (metadata.industry) parts.push(`Industry: ${metadata.industry}`);
  if (metadata.project_type) parts.push(`Type: ${metadata.project_type}`);
  if (metadata.target_audience) parts.push(`Target Audience: ${metadata.target_audience}`);
  if (metadata.budget_range) parts.push(`Budget: ${metadata.budget_range}`);
  if (metadata.tech_stack?.length) parts.push(`Tech Stack: ${metadata.tech_stack.join(', ')}`);
  if (metadata.key_goals?.length) parts.push(`Goals: ${metadata.key_goals.join(', ')}`);
  if (metadata.requirements) parts.push(`Requirements: ${metadata.requirements}`);
  if (metadata.pricing_information) parts.push(`Pricing: ${metadata.pricing_information}`);
  if (metadata.additional_context) parts.push(`Context: ${metadata.additional_context}`);

  return parts.filter(Boolean).join('\n');
}

// Prepare document for embedding
function prepareDocumentForEmbedding(doc: any, projectName: string): string {
  const parts = [];

  if (projectName) parts.push(`Project: ${projectName}`);
  if (doc.file_name) parts.push(`File: ${doc.file_name}`);
  if (doc.description) parts.push(`Description: ${doc.description}`);
  if (doc.category) parts.push(`Category: ${doc.category}`);
  if (doc.tags?.length) parts.push(`Tags: ${doc.tags.join(', ')}`);
  if (doc.file_type) parts.push(`Type: ${doc.file_type}`);

  return parts.filter(Boolean).join('\n');
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Check authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { type, project_id, company_id, document_id } = body;

    console.log(`[generate-project-embedding] Processing type: ${type}, project: ${project_id}`);

    // Validate required fields
    if (!type || !project_id || !company_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, project_id, company_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch project information
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('project_name, status')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      throw new Error(`Project not found: ${projectError?.message}`);
    }

    let embeddingContent = '';
    let contentType = '';
    let contentId = null;
    let metadata: any = {};

    // Handle metadata type
    if (type === 'metadata') {
      // Fetch project metadata
      const { data: projectMetadata, error: metadataError } = await supabase
        .from('project_metadata')
        .select('*')
        .eq('project_id', project_id)
        .single();

      if (metadataError || !projectMetadata) {
        throw new Error(`Project metadata not found: ${metadataError?.message}`);
      }

      // Prepare embedding text
      embeddingContent = prepareMetadataForEmbedding(projectMetadata, project.project_name);
      contentType = 'project_metadata';
      contentId = projectMetadata.id;
      metadata = {
        source: 'project_metadata',
        project_name: project.project_name,
        status: project.status,
      };

      console.log(`[generate-project-embedding] Prepared metadata embedding (${embeddingContent.length} chars)`);

    } else if (type === 'document') {
      // Validate document_id
      if (!document_id) {
        return new Response(
          JSON.stringify({ error: 'document_id required for type=document' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch document
      const { data: document, error: docError } = await supabase
        .from('project_documents')
        .select('*')
        .eq('id', document_id)
        .eq('project_id', project_id)
        .single();

      if (docError || !document) {
        throw new Error(`Document not found: ${docError?.message}`);
      }

      // Prepare embedding text
      embeddingContent = prepareDocumentForEmbedding(document, project.project_name);
      contentType = 'document';
      contentId = document_id;
      metadata = {
        file_name: document.file_name,
        file_type: document.file_type,
        category: document.category,
        tags: document.tags,
      };

      console.log(`[generate-project-embedding] Prepared document embedding (${embeddingContent.length} chars)`);

    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid type. Must be "metadata" or "document"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate embedding via Google Gemini
    console.log('[generate-project-embedding] Calling Gemini API...');
    const embedding = await generateEmbedding(embeddingContent, geminiApiKey);
    console.log(`[generate-project-embedding] Generated embedding: ${embedding.length} dimensions`);
    // Convert to string for pgvector
    const embeddingStr = `[${embedding.join(',')}]`;

    // Check if embedding already exists
    const { data: existingEmbedding } = await supabase
      .from('project_embeddings')
      .select('id')
      .eq('project_id', project_id)
      .eq('content_type', contentType)
      .eq('content_id', contentId)
      .maybeSingle();

    if (existingEmbedding) {
      // Update existing embedding
      console.log('[generate-project-embedding] Updating existing embedding...');
      const { error: updateError } = await supabase
        .from('project_embeddings')
        .update({
          content: embeddingContent,
          embedding: embeddingStr,
          metadata: metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingEmbedding.id);

      if (updateError) throw updateError;

      console.log('[generate-project-embedding] ✓ Embedding updated successfully');

    } else {
      // Insert new embedding
      console.log('[generate-project-embedding] Inserting new embedding...');
      const { error: insertError } = await supabase
        .from('project_embeddings')
        .insert({
          project_id,
          company_id,
          content_type: contentType,
          content_id: contentId,
          content: embeddingContent,
          embedding: embeddingStr,
          metadata: metadata,
        });

      if (insertError) throw insertError;

      console.log('[generate-project-embedding] ✓ Embedding inserted successfully');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Embedding generated successfully for ${type}`,
        embedding_dimensions: embedding.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[generate-project-embedding] Error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        details: error instanceof Error ? error.stack : undefined,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

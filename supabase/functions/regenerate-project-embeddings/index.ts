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

    console.log('Starting project brain embedding regeneration...');

    // Get all projects (not deleted)
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('is_deleted', false);

    if (projectsError) throw projectsError;

    let projectsProcessed = 0;
    let documentsProcessed = 0;

    for (const project of projects || []) {
      console.log(`\nProcessing project: ${project.project_name} (${project.id})`);

      // Fetch project metadata
      const { data: metadata, error: metadataError } = await supabase
        .from('project_metadata')
        .select('*')
        .eq('project_id', project.id)
        .maybeSingle();

      if (metadata) {
        // Delete old metadata embeddings
        await supabase
          .from('project_embeddings')
          .delete()
          .eq('project_id', project.id)
          .eq('content_type', 'project_metadata');

        // Generate and store new embedding
        const content = prepareMetadataForEmbedding(metadata, project.project_name);
        const embedding = await generateEmbedding(content, geminiApiKey);
        // Convert to string for pgvector
        const embeddingStr = `[${embedding.join(',')}]`;

        await supabase
          .from('project_embeddings')
          .insert({
            project_id: project.id,
            company_id: project.company_id,
            content_type: 'project_metadata',
            content_id: metadata.id,
            content,
            embedding: embeddingStr,
            metadata: {
              source: 'project_metadata',
              project_name: project.project_name,
              status: project.status,
            }
          });

        console.log(`  ✓ Regenerated metadata embedding`);
      }

      // Fetch project documents
      const { data: documents, error: docsError } = await supabase
        .from('project_documents')
        .select('*')
        .eq('project_id', project.id)
        .eq('is_deleted', false);

      if (docsError) {
        console.error(`  ✗ Error fetching documents: ${docsError.message}`);
        continue;
      }

      // Process each document
      for (const doc of documents || []) {
        // Delete old document embeddings
        await supabase
          .from('project_embeddings')
          .delete()
          .eq('content_type', 'document')
          .eq('content_id', doc.id);

        // Generate and store new embedding
        const content = prepareDocumentForEmbedding(doc, project.project_name);
        const embedding = await generateEmbedding(content, geminiApiKey);
        // Convert to string for pgvector
        const embeddingStr = `[${embedding.join(',')}]`;

        await supabase
          .from('project_embeddings')
          .insert({
            project_id: project.id,
            company_id: project.company_id,
            content_type: 'document',
            content_id: doc.id,
            content,
            embedding: embeddingStr,
            metadata: {
              file_name: doc.file_name,
              file_type: doc.file_type,
              category: doc.category,
              tags: doc.tags,
            }
          });

        documentsProcessed++;
      }

      if (documents?.length) {
        console.log(`  ✓ Regenerated ${documents.length} document embeddings`);
      }

      projectsProcessed++;
    }

    console.log(`\n✅ Completed: ${projectsProcessed} projects, ${documentsProcessed} documents`);

    return new Response(
      JSON.stringify({
        success: true,
        projects_processed: projectsProcessed,
        documents_processed: documentsProcessed
      }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, status: 200 }
    );

  } catch (error) {
    console.error('[regenerate-project-embeddings] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});

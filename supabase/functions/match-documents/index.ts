import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MatchDocumentsRequest {
  table: "project_embeddings" | "company_brain_embeddings";
  filter?: Record<string, any>;
  match_count: number;
  query_embedding: number[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: MatchDocumentsRequest = await req.json();
    const { table, filter, match_count, query_embedding } = body;

    // Validate
    if (!table) {
      return new Response(
        JSON.stringify({ error: "Missing required field: table" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!query_embedding || !Array.isArray(query_embedding) || query_embedding.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid query_embedding array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!match_count || match_count < 1) {
      return new Response(
        JSON.stringify({ error: "match_count must be a positive integer" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTables = ["project_embeddings", "company_brain_embeddings"];
    if (!validTables.includes(table)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid table name. Must be one of: ${validTables.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call RPC function
    const { data, error } = await supabase.rpc("match_documents", {
      p_table: table,
      p_query_embedding: query_embedding,
      p_match_count: match_count,
      p_filter: filter || {}
    });

    if (error) {
      console.error("[match-documents] Database error:", error);
      return new Response(
        JSON.stringify({ error: error.message, details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const matches = (data || []).map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      company_id: row.company_id,
      content_type: row.content_type,
      content_id: row.content_id,
      content: row.content,
      metadata: row.metadata,
      similarity: row.similarity
    }));

    return new Response(
      JSON.stringify({ matches }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[match-documents] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

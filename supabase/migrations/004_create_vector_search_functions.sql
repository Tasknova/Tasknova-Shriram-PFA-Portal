-- =====================================================
-- RPC FUNCTIONS FOR VECTOR SEARCH
-- =====================================================

-- Function 1: match_company_brain_documents
-- Purpose: Search company brain embeddings for a specific user
-- Returns: Matching documents ordered by similarity
CREATE OR REPLACE FUNCTION match_company_brain_documents(
  query_embedding vector(768),
  match_user_id UUID,
  match_threshold FLOAT DEFAULT 0.78,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content_type TEXT,
  content_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    company_brain_embeddings.id,
    company_brain_embeddings.user_id,
    company_brain_embeddings.content_type,
    company_brain_embeddings.content_id,
    company_brain_embeddings.content,
    company_brain_embeddings.metadata,
    1 - (company_brain_embeddings.embedding <=> query_embedding) AS similarity
  FROM company_brain_embeddings
  WHERE company_brain_embeddings.user_id = match_user_id
    AND 1 - (company_brain_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY company_brain_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function 2: match_project_documents
-- Purpose: Search within a specific project
-- Returns: Matching documents from a single project
CREATE OR REPLACE FUNCTION match_project_documents(
  p_query_embedding vector(768),
  p_project_id UUID,
  p_match_threshold FLOAT DEFAULT 0.78,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  company_id UUID,
  content_type TEXT,
  content_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    project_embeddings.id,
    project_embeddings.project_id,
    project_embeddings.company_id,
    project_embeddings.content_type,
    project_embeddings.content_id,
    project_embeddings.content,
    project_embeddings.metadata,
    1 - (project_embeddings.embedding <=> p_query_embedding) AS similarity
  FROM project_embeddings
  WHERE project_embeddings.project_id = p_project_id
    AND 1 - (project_embeddings.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY project_embeddings.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Function 3: match_company_projects
-- Purpose: Search across all projects in a company
-- Returns: Matching documents from all company projects
CREATE OR REPLACE FUNCTION match_company_projects(
  p_query_embedding vector(768),
  p_company_id UUID,
  p_match_threshold FLOAT DEFAULT 0.78,
  p_match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  company_id UUID,
  content_type TEXT,
  content_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    project_embeddings.id,
    project_embeddings.project_id,
    project_embeddings.company_id,
    project_embeddings.content_type,
    project_embeddings.content_id,
    project_embeddings.content,
    project_embeddings.metadata,
    1 - (project_embeddings.embedding <=> p_query_embedding) AS similarity
  FROM project_embeddings
  WHERE project_embeddings.company_id = p_company_id
    AND 1 - (project_embeddings.embedding <=> p_query_embedding) > p_match_threshold
  ORDER BY project_embeddings.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

-- Function 4: match_documents (Generic)
-- Purpose: Generic search function used by Edge Functions
-- Supports dynamic filtering on both company_brain_embeddings and project_embeddings
CREATE OR REPLACE FUNCTION match_documents(
  p_table TEXT,
  p_query_embedding vector(768),
  p_match_count INT,
  p_filter JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  project_id UUID,
  company_id UUID,
  content_type TEXT,
  content_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_sql TEXT;
  v_project_id UUID;
  v_company_id UUID;
  v_user_id UUID;
  v_content_type TEXT;
BEGIN
  -- Validate table name
  IF p_table NOT IN ('project_embeddings', 'company_brain_embeddings') THEN
    RAISE EXCEPTION 'Invalid table name: %. Must be one of: project_embeddings, company_brain_embeddings', p_table;
  END IF;

  -- Extract filter values
  v_project_id := (p_filter->>'project_id')::UUID;
  v_company_id := (p_filter->>'company_id')::UUID;
  v_user_id := (p_filter->>'user_id')::UUID;
  v_content_type := p_filter->>'content_type';

  -- Build dynamic SQL based on table
  IF p_table = 'project_embeddings' THEN
    v_sql := format('
      SELECT
        pe.id,
        pe.project_id,
        pe.company_id,
        pe.content_type,
        pe.content_id,
        pe.content,
        pe.metadata,
        (1 - (pe.embedding <=> $1)) AS similarity
      FROM project_embeddings pe
      WHERE 1=1
    ');

    -- Add project_id filter if provided
    IF v_project_id IS NOT NULL THEN
      v_sql := v_sql || format(' AND pe.project_id = %L', v_project_id);
    END IF;

    -- Add company_id filter if provided
    IF v_company_id IS NOT NULL THEN
      v_sql := v_sql || format(' AND pe.company_id = %L', v_company_id);
    END IF;

    -- Add content_type filter if provided
    IF v_content_type IS NOT NULL THEN
      v_sql := v_sql || format(' AND pe.content_type = %L', v_content_type);
    END IF;

    v_sql := v_sql || '
      ORDER BY pe.embedding <=> $1
      LIMIT $2
    ';

  ELSIF p_table = 'company_brain_embeddings' THEN
    v_sql := format('
      SELECT
        cbe.id,
        NULL::UUID AS project_id,
        NULL::UUID AS company_id,
        cbe.content_type,
        cbe.content_id,
        cbe.content,
        cbe.metadata,
        (1 - (cbe.embedding <=> $1)) AS similarity
      FROM company_brain_embeddings cbe
      WHERE 1=1
    ');

    -- Add user_id filter if provided
    IF v_user_id IS NOT NULL THEN
      v_sql := v_sql || format(' AND cbe.user_id = %L', v_user_id);
    END IF;

    -- Add content_type filter if provided
    IF v_content_type IS NOT NULL THEN
      v_sql := v_sql || format(' AND cbe.content_type = %L', v_content_type);
    END IF;

    v_sql := v_sql || '
      ORDER BY cbe.embedding <=> $1
      LIMIT $2
    ';
  END IF;

  -- Execute dynamic SQL
  RETURN QUERY EXECUTE v_sql USING p_query_embedding, p_match_count;
END;
$$;

-- =====================================================
-- GRANTS (Optional - for service role access)
-- =====================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION match_company_brain_documents TO authenticated;
GRANT EXECUTE ON FUNCTION match_project_documents TO authenticated;
GRANT EXECUTE ON FUNCTION match_company_projects TO authenticated;
GRANT EXECUTE ON FUNCTION match_documents TO authenticated;

-- Grant execute permissions to service_role (for Edge Functions)
GRANT EXECUTE ON FUNCTION match_company_brain_documents TO service_role;
GRANT EXECUTE ON FUNCTION match_project_documents TO service_role;
GRANT EXECUTE ON FUNCTION match_company_projects TO service_role;
GRANT EXECUTE ON FUNCTION match_documents TO service_role;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION match_company_brain_documents IS 
  'Search company brain embeddings using cosine similarity. Returns documents with similarity > threshold.';

COMMENT ON FUNCTION match_project_documents IS 
  'Search embeddings within a specific project using cosine similarity.';

COMMENT ON FUNCTION match_company_projects IS 
  'Search embeddings across all projects in a company using cosine similarity.';

COMMENT ON FUNCTION match_documents IS 
  'Generic vector search function with dynamic table selection and filtering. Used by Edge Functions.';

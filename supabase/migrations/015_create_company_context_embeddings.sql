-- =====================================================
-- COMPANY CONTEXT EMBEDDINGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS company_context_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_memory_id UUID NOT NULL REFERENCES company_context_memory(id) ON DELETE CASCADE,
  
  -- Vector embedding (768 dimensions)
  embedding vector(768) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_company_context_embeddings_user_id ON company_context_embeddings(user_id);
CREATE INDEX idx_company_context_embeddings_context_memory_id ON company_context_embeddings(context_memory_id);

-- Vector similarity search index
CREATE INDEX company_context_embeddings_embedding_idx 
ON company_context_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- RLS
ALTER TABLE company_context_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own company context embeddings"
  ON company_context_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert company context embeddings"
  ON company_context_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete company context embeddings"
  ON company_context_embeddings FOR DELETE
  USING (auth.uid() = user_id);

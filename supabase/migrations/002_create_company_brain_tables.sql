-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- =====================================================
-- COMPANY BRAIN TABLES
-- =====================================================

-- Table 1: company_brain (Main company information)
CREATE TABLE IF NOT EXISTS company_brain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Company Details
  company_name TEXT,
  tagline TEXT,
  company_description TEXT,
  industry TEXT,
  founded_year INTEGER,
  company_size TEXT,
  location TEXT,
  
  -- Contact Information
  website TEXT,
  email TEXT,
  phone TEXT,
  
  -- Values & Mission
  mission_statement TEXT,
  vision_statement TEXT,
  core_values TEXT[],
  unique_selling_points TEXT[],
  
  -- Business Information
  target_audience TEXT,
  products_services JSONB,
  pricing_model TEXT,
  key_features TEXT[],
  
  -- Team Information
  founder_info TEXT,
  leadership_team JSONB,
  team_size_details TEXT,
  
  -- Additional Data
  additional_context TEXT,
  custom_fields JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_user_company_brain UNIQUE(user_id)
);

-- Table 2: document_groups (Organize documents into groups)
CREATE TABLE IF NOT EXISTS document_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  description TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: brain_documents (Store uploaded documents)
CREATE TABLE IF NOT EXISTS brain_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_brain_id UUID REFERENCES company_brain(id) ON DELETE SET NULL,
  document_group_id UUID REFERENCES document_groups(id) ON DELETE SET NULL,
  
  -- File Metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'document', 'image', 'video', 'audio', 'other')),
  file_size BIGINT,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  
  -- Organization
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  
  -- Processing Status
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  extracted_text TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: company_brain_embeddings (Vector embeddings for semantic search)
CREATE TABLE IF NOT EXISTS company_brain_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content Information
  content_type TEXT NOT NULL CHECK (content_type IN ('company_info', 'document', 'additional_context')),
  content_id UUID, -- Links to company_brain.id or brain_documents.id
  content TEXT NOT NULL,
  
  -- Vector Embedding (768 dimensions for Google Gemini text-embedding-004)
  embedding vector(768) NOT NULL,
  
  -- Metadata for context
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Company Brain indexes
CREATE INDEX idx_company_brain_user_id ON company_brain(user_id);

-- Document Groups indexes
CREATE INDEX idx_document_groups_user_id ON document_groups(user_id);

-- Brain Documents indexes
CREATE INDEX idx_brain_documents_user_id ON brain_documents(user_id);
CREATE INDEX idx_brain_documents_category ON brain_documents(category);
CREATE INDEX idx_brain_documents_status ON brain_documents(status);
CREATE INDEX idx_brain_documents_group_id ON brain_documents(document_group_id);

-- Company Brain Embeddings indexes
CREATE INDEX idx_company_brain_embeddings_user_id ON company_brain_embeddings(user_id);
CREATE INDEX idx_company_brain_embeddings_content_type ON company_brain_embeddings(content_type);
CREATE INDEX idx_company_brain_embeddings_content_id ON company_brain_embeddings(content_id);

-- Vector similarity search index (IVFFlat)
CREATE INDEX company_brain_embeddings_embedding_idx 
ON company_brain_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE company_brain ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE brain_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_brain_embeddings ENABLE ROW LEVEL SECURITY;

-- Company Brain policies
CREATE POLICY "Users can view their own company brain"
  ON company_brain FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own company brain"
  ON company_brain FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own company brain"
  ON company_brain FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own company brain"
  ON company_brain FOR DELETE
  USING (auth.uid() = user_id);

-- Document Groups policies
CREATE POLICY "Users can view their own document groups"
  ON document_groups FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own document groups"
  ON document_groups FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own document groups"
  ON document_groups FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own document groups"
  ON document_groups FOR DELETE
  USING (auth.uid() = user_id);

-- Brain Documents policies
CREATE POLICY "Users can view their own documents"
  ON brain_documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON brain_documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON brain_documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON brain_documents FOR DELETE
  USING (auth.uid() = user_id);

-- Company Brain Embeddings policies
CREATE POLICY "Users can view their own embeddings"
  ON company_brain_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own embeddings"
  ON company_brain_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own embeddings"
  ON company_brain_embeddings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own embeddings"
  ON company_brain_embeddings FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

-- Create trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_company_brain_updated_at
  BEFORE UPDATE ON company_brain
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_groups_updated_at
  BEFORE UPDATE ON document_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_brain_documents_updated_at
  BEFORE UPDATE ON brain_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_company_brain_embeddings_updated_at
  BEFORE UPDATE ON company_brain_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE company_brain IS 'Stores company-wide knowledge and information';
COMMENT ON TABLE brain_documents IS 'Stores uploaded documents with metadata for company brain';
COMMENT ON TABLE document_groups IS 'Organizes documents into user-defined groups';
COMMENT ON TABLE company_brain_embeddings IS 'Stores 768-dimensional vector embeddings for semantic search';
COMMENT ON COLUMN company_brain_embeddings.embedding IS 'Vector embedding generated by Google Gemini text-embedding-004 model (768 dimensions)';

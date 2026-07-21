-- =====================================================
-- PROJECT BRAIN TABLES
-- =====================================================

-- Table 1: projects (Store project records)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Project Information
  project_name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
  
  -- Dates
  start_date DATE,
  end_date DATE,
  
  -- Soft Delete
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: project_metadata (Detailed project information)
CREATE TABLE IF NOT EXISTS project_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Project Context
  domain TEXT,
  industry TEXT,
  project_type TEXT,
  target_audience TEXT,
  
  -- Technical Information
  tech_stack TEXT[] DEFAULT '{}',
  requirements TEXT,
  
  -- Planning Information
  key_goals TEXT[] DEFAULT '{}',
  milestones JSONB DEFAULT '[]',
  team_size INTEGER,
  budget_range TEXT,
  
  -- Priority & Pricing
  priority_level TEXT DEFAULT 'medium' CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
  pricing_information TEXT,
  
  -- Additional Data
  custom_fields JSONB DEFAULT '{}',
  additional_context TEXT,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT unique_project_metadata UNIQUE(project_id)
);

-- Table 3: project_documents (Project-specific documents)
CREATE TABLE IF NOT EXISTS project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- File Metadata
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'document', 'image', 'video', 'audio', 'other')),
  file_size BIGINT,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  storage_url TEXT,
  
  -- Organization
  title TEXT,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  category TEXT,
  
  -- Processing
  extracted_text TEXT,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  
  -- Soft Delete
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: project_embeddings (Project-specific vector embeddings)
CREATE TABLE IF NOT EXISTS project_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content Information
  content_type TEXT NOT NULL CHECK (content_type IN ('project_metadata', 'document', 'document_chunk')),
  content_id UUID, -- Links to project_metadata.id or project_documents.id
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

-- Projects indexes
CREATE INDEX idx_projects_company_id ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_is_deleted ON projects(is_deleted);
CREATE INDEX idx_projects_created_by ON projects(created_by);

-- Project Metadata indexes
CREATE INDEX idx_project_metadata_project_id ON project_metadata(project_id);
CREATE INDEX idx_project_metadata_company_id ON project_metadata(company_id);

-- Project Documents indexes
CREATE INDEX idx_project_documents_project_id ON project_documents(project_id);
CREATE INDEX idx_project_documents_company_id ON project_documents(company_id);
CREATE INDEX idx_project_documents_category ON project_documents(category);
CREATE INDEX idx_project_documents_is_deleted ON project_documents(is_deleted);
CREATE INDEX idx_project_documents_uploaded_by ON project_documents(uploaded_by);

-- Project Embeddings indexes
CREATE INDEX idx_project_embeddings_project_id ON project_embeddings(project_id);
CREATE INDEX idx_project_embeddings_company_id ON project_embeddings(company_id);
CREATE INDEX idx_project_embeddings_content_type ON project_embeddings(content_type);
CREATE INDEX idx_project_embeddings_content_id ON project_embeddings(content_id);

-- Vector similarity search index (IVFFlat)
CREATE INDEX project_embeddings_embedding_idx 
ON project_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_embeddings ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view their company projects"
  ON projects FOR SELECT
  USING (auth.uid() = company_id);

CREATE POLICY "Users can insert their company projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can update their company projects"
  ON projects FOR UPDATE
  USING (auth.uid() = company_id);

CREATE POLICY "Users can delete their company projects"
  ON projects FOR DELETE
  USING (auth.uid() = company_id);

-- Project Metadata policies
CREATE POLICY "Users can view their project metadata"
  ON project_metadata FOR SELECT
  USING (auth.uid() = company_id);

CREATE POLICY "Users can insert their project metadata"
  ON project_metadata FOR INSERT
  WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can update their project metadata"
  ON project_metadata FOR UPDATE
  USING (auth.uid() = company_id);

CREATE POLICY "Users can delete their project metadata"
  ON project_metadata FOR DELETE
  USING (auth.uid() = company_id);

-- Project Documents policies
CREATE POLICY "Users can view their project documents"
  ON project_documents FOR SELECT
  USING (auth.uid() = company_id);

CREATE POLICY "Users can insert their project documents"
  ON project_documents FOR INSERT
  WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can update their project documents"
  ON project_documents FOR UPDATE
  USING (auth.uid() = company_id);

CREATE POLICY "Users can delete their project documents"
  ON project_documents FOR DELETE
  USING (auth.uid() = company_id);

-- Project Embeddings policies
CREATE POLICY "Users can view their project embeddings"
  ON project_embeddings FOR SELECT
  USING (auth.uid() = company_id);

CREATE POLICY "Users can insert their project embeddings"
  ON project_embeddings FOR INSERT
  WITH CHECK (auth.uid() = company_id);

CREATE POLICY "Users can update their project embeddings"
  ON project_embeddings FOR UPDATE
  USING (auth.uid() = company_id);

CREATE POLICY "Users can delete their project embeddings"
  ON project_embeddings FOR DELETE
  USING (auth.uid() = company_id);

-- =====================================================
-- TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_metadata_updated_at
  BEFORE UPDATE ON project_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_documents_updated_at
  BEFORE UPDATE ON project_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_project_embeddings_updated_at
  BEFORE UPDATE ON project_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE projects IS 'Stores project records with basic information';
COMMENT ON TABLE project_metadata IS 'Stores detailed project metadata and context';
COMMENT ON TABLE project_documents IS 'Stores project-specific documents with metadata';
COMMENT ON TABLE project_embeddings IS 'Stores 768-dimensional vector embeddings for project semantic search';
COMMENT ON COLUMN project_embeddings.embedding IS 'Vector embedding generated by Google Gemini text-embedding-004 model (768 dimensions)';

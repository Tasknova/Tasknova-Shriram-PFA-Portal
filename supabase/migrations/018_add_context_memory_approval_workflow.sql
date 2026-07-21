-- =====================================================
-- CONTEXT MEMORY APPROVAL WORKFLOW
-- =====================================================

ALTER TABLE company_context_memory
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'disapproved')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE project_context_memory
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'disapproved')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_company_context_memory_approval_status
  ON company_context_memory(approval_status);

CREATE INDEX IF NOT EXISTS idx_project_context_memory_approval_status
  ON project_context_memory(approval_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_context_embeddings_unique_memory
  ON company_context_embeddings(context_memory_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_context_embeddings_unique_memory
  ON project_context_embeddings(context_memory_id);

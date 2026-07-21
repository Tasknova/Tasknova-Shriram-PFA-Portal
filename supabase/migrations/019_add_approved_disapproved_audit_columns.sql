-- =====================================================
-- UNIFIED APPROVAL/DISAPPROVAL AUDIT COLUMNS
-- =====================================================

ALTER TABLE company_context_memory
  ADD COLUMN IF NOT EXISTS approved_disapproved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_disapproved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE project_context_memory
  ADD COLUMN IF NOT EXISTS approved_disapproved_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approved_disapproved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill from prior approved metadata where available.
UPDATE company_context_memory
SET approved_disapproved_at = COALESCE(approved_disapproved_at, approved_at),
    approved_disapproved_by = COALESCE(approved_disapproved_by, approved_by)
WHERE approved_at IS NOT NULL OR approved_by IS NOT NULL;

UPDATE project_context_memory
SET approved_disapproved_at = COALESCE(approved_disapproved_at, approved_at),
    approved_disapproved_by = COALESCE(approved_disapproved_by, approved_by)
WHERE approved_at IS NOT NULL OR approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_context_memory_decision_at
  ON company_context_memory(approved_disapproved_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_context_memory_decision_at
  ON project_context_memory(approved_disapproved_at DESC);

-- Add budget columns to project_documents table
ALTER TABLE project_documents 
ADD COLUMN IF NOT EXISTS budget_currency TEXT,
ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(15, 2);

-- Add index for querying by budget
CREATE INDEX IF NOT EXISTS idx_project_documents_budget ON project_documents(budget_currency, budget_amount);

-- Add comment
COMMENT ON COLUMN project_documents.budget_currency IS 'Currency code (USD, EUR, GBP, etc.)';
COMMENT ON COLUMN project_documents.budget_amount IS 'Budget amount in the specified currency';

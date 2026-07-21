-- Add budget columns to brain_documents table
ALTER TABLE brain_documents 
ADD COLUMN IF NOT EXISTS budget_currency TEXT,
ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(15, 2);

-- Add index for querying by budget
CREATE INDEX IF NOT EXISTS idx_brain_documents_budget ON brain_documents(budget_currency, budget_amount);

-- Add comment
COMMENT ON COLUMN brain_documents.budget_currency IS 'Currency code (USD, EUR, GBP, etc.)';
COMMENT ON COLUMN brain_documents.budget_amount IS 'Budget amount in the specified currency';

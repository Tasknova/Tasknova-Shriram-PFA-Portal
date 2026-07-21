-- Remove budget fields from project_documents table
-- Budget should only be in project_metadata, not individual documents

ALTER TABLE project_documents
DROP COLUMN IF EXISTS budget_currency,
DROP COLUMN IF EXISTS budget_amount;

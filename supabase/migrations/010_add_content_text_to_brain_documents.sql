-- Add content_text column to brain_documents table for AI search and embeddings
-- This brings brain_documents to parity with project_documents

-- Add content_text column
ALTER TABLE brain_documents
ADD COLUMN IF NOT EXISTS content_text TEXT;

COMMENT ON COLUMN brain_documents.content_text IS 'Extracted text content from the document for AI search and embeddings';
